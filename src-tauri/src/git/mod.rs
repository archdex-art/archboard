pub mod remote;

use std::path::Path;
use std::process::Stdio;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use serde::Serialize;
use tokio::process::Command;
use tokio::sync::Semaphore;

use crate::error::{AppError, Code, Result};
use remote::Remote;

/// Git state is read from the repository, never from SQLite. This cache exists
/// only to keep scroll-triggered refreshes from re-spawning `git` constantly.
const TTL: Duration = Duration::from_secs(60);
/// Spawning is cheap (~1ms amortized) but unbounded fan-out is not: cap it so a
/// 500-project board can never saturate the CPU.
const MAX_CONCURRENT_GIT: usize = 8;
const GIT_TIMEOUT: Duration = Duration::from_secs(5);

static CACHE: LazyLock<DashMap<i64, (GitStatus, Instant)>> = LazyLock::new(DashMap::new);
static GATE: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(MAX_CONCURRENT_GIT));

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub short_sha: String,
    pub author: String,
    /// ISO 8601 with offset, formatted for display on the frontend.
    pub date: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub initialized: bool,
    pub branch: Option<String>,
    pub detached: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: u32,
    pub modified: u32,
    pub untracked: u32,
    pub conflicted: u32,
    pub last_commit: Option<Commit>,
    pub remote: Option<Remote>,
    pub fetched_at: i64,
}

impl GitStatus {
    fn not_a_repo() -> Self {
        Self {
            initialized: false,
            branch: None,
            detached: false,
            upstream: None,
            ahead: 0,
            behind: 0,
            staged: 0,
            modified: 0,
            untracked: 0,
            conflicted: 0,
            last_commit: None,
            remote: None,
            fetched_at: crate::db::now(),
        }
    }
}

/// Runs git inside `dir` with an argv array — no shell, no interpolation.
async fn git(dir: &Path, args: &[&str]) -> Result<std::process::Output> {
    let _permit = GATE.acquire().await.map_err(|_| {
        AppError::new(Code::GitFailed, "Archboard is shutting down; git was not run.")
    })?;

    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(dir)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Never let a repository's config open an editor, a pager, or a
        // credential prompt on a background read.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_PAGER", "cat");

    match tokio::time::timeout(GIT_TIMEOUT, cmd.output()).await {
        Ok(Ok(out)) => Ok(out),
        Ok(Err(e)) if e.kind() == std::io::ErrorKind::NotFound => Err(AppError::new(
            Code::GitFailed,
            "Git is not installed, or is not on the system path.",
        )
        .hint("Install the Xcode command line tools with: xcode-select --install")),
        Ok(Err(e)) => Err(AppError::new(Code::GitFailed, format!("Could not run git: {e}"))),
        Err(_) => Err(AppError::new(Code::GitFailed, "Git took too long to respond.")
            .hint("The repository may be very large, or a lock file may be stale.")),
    }
}

fn stderr_message(out: &std::process::Output) -> String {
    String::from_utf8_lossy(&out.stderr).trim().to_string()
}

pub fn verify_dir(path: &str) -> Result<&Path> {
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(AppError::new(
            Code::PathMissing,
            format!("The folder {path} is gone. It may have been moved or deleted."),
        )
        .hint("Remove the project from Archboard, or add it again from its new location."));
    }
    Ok(dir)
}

pub fn invalidate(project_id: i64) {
    CACHE.remove(&project_id);
}

pub async fn status(project_id: i64, path: &str, force: bool) -> Result<GitStatus> {
    if !force {
        if let Some(entry) = CACHE.get(&project_id) {
            if entry.1.elapsed() < TTL {
                return Ok(entry.0.clone());
            }
        }
    }
    let fresh = read_status(path).await?;
    CACHE.insert(project_id, (fresh.clone(), Instant::now()));
    Ok(fresh)
}

pub async fn read_status(path: &str) -> Result<GitStatus> {
    let dir = verify_dir(path)?;

    // One call yields branch, upstream, ahead/behind and every file state.
    let out = git(dir, &["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]).await?;
    if !out.status.success() {
        let err = stderr_message(&out);
        if err.contains("not a git repository") {
            return Ok(GitStatus::not_a_repo());
        }
        return Err(AppError::new(Code::GitFailed, format!("git status failed: {err}")));
    }

    let mut st = parse_porcelain_v2(&String::from_utf8_lossy(&out.stdout));
    st.last_commit = read_last_commit(dir).await;
    st.remote = read_remote(dir).await;
    Ok(st)
}

pub fn parse_porcelain_v2(stdout: &str) -> GitStatus {
    let mut st = GitStatus::not_a_repo();
    st.initialized = true;

    for line in stdout.lines() {
        match line.as_bytes().first() {
            Some(b'#') => {
                let mut parts = line.split_whitespace();
                match (parts.next(), parts.next()) {
                    (Some("#"), Some("branch.head")) => match parts.next() {
                        Some("(detached)") => st.detached = true,
                        Some(name) => st.branch = Some(name.to_string()),
                        None => {}
                    },
                    (Some("#"), Some("branch.upstream")) => {
                        st.upstream = parts.next().map(str::to_string);
                    }
                    (Some("#"), Some("branch.ab")) => {
                        // "+2 -1"; absent entirely when there is no upstream.
                        for token in parts {
                            let (sign, num) = token.split_at(1);
                            let n = num.parse().unwrap_or(0);
                            match sign {
                                "+" => st.ahead = n,
                                "-" => st.behind = n,
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }
            // "1 XY ..." ordinary change, "2 XY ..." rename/copy.
            Some(b'1') | Some(b'2') => {
                let xy = line.split_whitespace().nth(1).unwrap_or("..").as_bytes();
                if xy.first().is_some_and(|&c| c != b'.') {
                    st.staged += 1;
                }
                if xy.get(1).is_some_and(|&c| c != b'.') {
                    st.modified += 1;
                }
            }
            Some(b'u') => st.conflicted += 1,
            Some(b'?') => st.untracked += 1,
            _ => {}
        }
    }
    st
}

async fn read_last_commit(dir: &Path) -> Option<Commit> {
    // NUL separators: commit subjects can contain anything else.
    let out = git(dir, &["log", "-1", "--format=%H%x00%an%x00%aI%x00%s"]).await.ok()?;
    if !out.status.success() {
        return None; // A repository with no commits yet.
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut fields = text.trim_end_matches('\n').split('\0');
    let sha = fields.next()?.to_string();
    if sha.is_empty() {
        return None;
    }
    Some(Commit {
        short_sha: sha.chars().take(7).collect(),
        sha,
        author: fields.next().unwrap_or_default().to_string(),
        date: fields.next().unwrap_or_default().to_string(),
        subject: fields.next().unwrap_or_default().to_string(),
    })
}

async fn read_remote(dir: &Path) -> Option<Remote> {
    let out = git(dir, &["remote", "get-url", "origin"]).await.ok()?;
    let url = if out.status.success() {
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    } else {
        // No `origin` — fall back to whichever remote is configured first.
        let all = git(dir, &["remote"]).await.ok()?;
        let first = String::from_utf8_lossy(&all.stdout).lines().next()?.trim().to_string();
        let out = git(dir, &["remote", "get-url", &first]).await.ok()?;
        if !out.status.success() {
            return None;
        }
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };
    remote::parse(&url)
}

pub async fn init(path: &str) -> Result<()> {
    let dir = verify_dir(path)?;
    let out = git(dir, &["init"]).await?;
    if !out.status.success() {
        return Err(AppError::new(
            Code::GitFailed,
            format!("Could not initialize a repository: {}", stderr_message(&out)),
        ));
    }
    Ok(())
}

pub async fn recent_commits(path: &str, n: u32) -> Result<Vec<Commit>> {
    let dir = verify_dir(path)?;
    let count = format!("-{}", n.clamp(1, 50));
    let out = git(dir, &["log", &count, "--format=%H%x00%an%x00%aI%x00%s"]).await?;
    if !out.status.success() {
        return Ok(Vec::new());
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| {
            let mut f = line.split('\0');
            let sha = f.next()?.to_string();
            if sha.is_empty() {
                return None;
            }
            Some(Commit {
                short_sha: sha.chars().take(7).collect(),
                sha,
                author: f.next().unwrap_or_default().to_string(),
                date: f.next().unwrap_or_default().to_string(),
                subject: f.next().unwrap_or_default().to_string(),
            })
        })
        .collect())
}

pub async fn branches(path: &str) -> Result<Vec<String>> {
    let dir = verify_dir(path)?;
    let out = git(dir, &["branch", "--format=%(refname:short)", "--sort=-committerdate"]).await?;
    if !out.status.success() {
        return Ok(Vec::new());
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_branch_counts_and_states() {
        let out = "\
# branch.oid abc123
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -1
1 M. N... 100644 100644 100644 h1 h2 staged.txt
1 .M N... 100644 100644 100644 h1 h2 dirty.txt
1 MM N... 100644 100644 100644 h1 h2 both.txt
2 R. N... 100644 100644 100644 h1 h2 R100 new.txt\told.txt
u UU N... 100644 100644 100644 100644 h1 h2 h3 conflict.txt
? untracked.txt
";
        let st = parse_porcelain_v2(out);
        assert_eq!(st.branch.as_deref(), Some("main"));
        assert_eq!(st.upstream.as_deref(), Some("origin/main"));
        assert_eq!((st.ahead, st.behind), (2, 1));
        assert_eq!(st.staged, 3); // M., MM, R.
        assert_eq!(st.modified, 2); // .M, MM
        assert_eq!(st.conflicted, 1);
        assert_eq!(st.untracked, 1);
        assert_eq!(st.staged + st.modified + st.untracked + st.conflicted, 7);
    }

    #[test]
    fn tolerates_a_repo_with_no_upstream_and_a_detached_head() {
        let st = parse_porcelain_v2("# branch.oid abc\n# branch.head (detached)\n");
        assert!(st.detached);
        assert!(st.branch.is_none());
        assert!(st.upstream.is_none());
        assert_eq!((st.ahead, st.behind), (0, 0));
        assert_eq!(st.modified + st.untracked, 0);
    }
}
