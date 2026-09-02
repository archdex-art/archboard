use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    /// Exactly what `git remote get-url` returned.
    pub raw: String,
    pub host: String,
    /// Display name for the hosting service, e.g. "GitHub", "Azure DevOps".
    pub service: String,
    pub owner: Option<String>,
    pub repo: Option<String>,
    /// Browser URL, or `None` when the remote is a local/filesystem path.
    pub web_url: Option<String>,
}

/// Splits any of git's remote URL spellings into `(host, path)`:
///   - scp-style   `git@github.com:owner/repo.git`
///   - ssh://      `ssh://git@host:2222/owner/repo.git`
///   - http(s)://  `https://host/owner/repo.git`
///   - git://      `git://host/owner/repo.git`
///
/// Returns `None` for local paths (`/srv/repo.git`, `../other`, `file://`).
fn split(raw: &str) -> Option<(String, String)> {
    let raw = raw.trim();
    if raw.is_empty() || raw.starts_with("file://") || raw.starts_with('/') || raw.starts_with('.') {
        return None;
    }

    let rest = match raw.find("://") {
        Some(i) => &raw[i + 3..],
        None => {
            // scp-style: the first colon separates host from path, and the
            // segment before it must not look like a port or a drive letter.
            let (authority, path) = raw.split_once(':')?;
            let host = authority.rsplit('@').next()?;
            if host.is_empty() || path.is_empty() {
                return None;
            }
            return Some((host.to_ascii_lowercase(), trim_path(path)));
        }
    };

    let (authority, path) = rest.split_once('/')?;
    let host_port = authority.rsplit('@').next()?;
    // Drop any :port — it is meaningless for the browser URL.
    let host = host_port.split(':').next()?;
    if host.is_empty() {
        return None;
    }
    Some((host.to_ascii_lowercase(), trim_path(path)))
}

fn trim_path(path: &str) -> String {
    path.trim_start_matches('/').trim_end_matches('/').trim_end_matches(".git").to_string()
}

fn service_for(host: &str) -> &'static str {
    match host {
        h if h == "github.com" || h.ends_with(".github.com") => "GitHub",
        h if h.starts_with("gitlab.") || h.contains("gitlab") => "GitLab",
        h if h.starts_with("bitbucket.") || h.contains("bitbucket") => "Bitbucket",
        "dev.azure.com" | "ssh.dev.azure.com" | "vs-ssh.visualstudio.com" => "Azure DevOps",
        h if h.ends_with(".visualstudio.com") => "Azure DevOps",
        h if h.contains("codeberg") => "Codeberg",
        h if h.contains("sourcehut") || h == "git.sr.ht" => "SourceHut",
        _ => "Git",
    }
}

pub fn parse(raw: &str) -> Option<Remote> {
    let (host, path) = split(raw)?;
    let service = service_for(&host);

    // Azure DevOps speaks three dialects for the same repository.
    if service == "Azure DevOps" {
        let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        // ssh: v3/org/project/repo   |   https: org/project/_git/repo
        let triple = match segs.as_slice() {
            ["v3", org, project, repo] => Some((*org, *project, *repo)),
            [org, project, "_git", repo] => Some((*org, *project, *repo)),
            _ => None,
        };
        if let Some((org, project, repo)) = triple {
            return Some(Remote {
                raw: raw.to_string(),
                host,
                service: service.into(),
                owner: Some(format!("{org}/{project}")),
                repo: Some(repo.to_string()),
                web_url: Some(format!("https://dev.azure.com/{org}/{project}/_git/{repo}")),
            });
        }
    }

    let mut segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let repo = segs.pop().map(str::to_string);
    // GitLab subgroups mean the owner can be several segments deep.
    let owner = if segs.is_empty() { None } else { Some(segs.join("/")) };

    let web_url = repo.as_ref().map(|r| match &owner {
        Some(o) => format!("https://{host}/{o}/{r}"),
        None => format!("https://{host}/{r}"),
    });

    Some(Remote { raw: raw.to_string(), host, service: service.into(), owner, repo, web_url })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn web(raw: &str) -> String {
        parse(raw).and_then(|r| r.web_url).unwrap_or_default()
    }

    #[test]
    fn parses_every_dialect() {
        assert_eq!(web("git@github.com:user/project.git"), "https://github.com/user/project");
        assert_eq!(web("https://github.com/user/project.git"), "https://github.com/user/project");
        assert_eq!(web("git@gitlab.com:group/sub/proj.git"), "https://gitlab.com/group/sub/proj");
        assert_eq!(web("ssh://git@host.dev:2222/u/r.git"), "https://host.dev/u/r");
        assert_eq!(web("git@bitbucket.org:team/repo.git"), "https://bitbucket.org/team/repo");
        assert_eq!(
            web("git@ssh.dev.azure.com:v3/org/proj/repo"),
            "https://dev.azure.com/org/proj/_git/repo"
        );
        assert_eq!(
            web("https://dev.azure.com/org/proj/_git/repo"),
            "https://dev.azure.com/org/proj/_git/repo"
        );
        // Local remotes are not clickable.
        assert!(parse("/srv/git/repo.git").is_none());
        assert!(parse("../sibling").is_none());
    }

    #[test]
    fn names_the_service_from_the_host() {
        assert_eq!(parse("git@github.com:u/r.git").unwrap().service, "GitHub");
        assert_eq!(parse("git@gitlab.internal.corp:u/r.git").unwrap().service, "GitLab");
        // Self-hosted stays generic rather than pretending to be GitHub.
        assert_eq!(parse("git@git.example.com:u/r.git").unwrap().service, "Git");
    }
}
