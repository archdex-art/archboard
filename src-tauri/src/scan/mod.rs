//! Discovery of projects under user-configured roots.
//!
//! The walk is depth-limited, stops at repository boundaries, and never
//! descends into dependency or build directories. Nothing found here is added
//! to the board: the result is a list of candidates for the user to approve.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use walkdir::{DirEntry, WalkDir};

use crate::detect;

/// Skipped unconditionally. `.gitignore` cannot be relied on here: a folder
/// full of dependencies is just as likely to sit outside a repository.
const SKIP: &[&str] = &[
    "node_modules", "target", "dist", "build", "out", "vendor", "Pods", "DerivedData",
    ".venv", "venv", "env", "__pycache__", ".tox", ".mypy_cache", ".pytest_cache",
    ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache", ".gradle", ".idea", ".vscode",
    "Library", "Applications", ".Trash", ".git", ".bundle", "bower_components",
    "Carthage", ".terraform", ".stack-work", "obj", "bin", "coverage",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub name: String,
    pub path: String,
    pub language: Option<String>,
    pub framework: Option<String>,
    pub package_manager: Option<String>,
    pub has_git: bool,
    /// True when this path is already on the board; shown but not selectable.
    pub already_added: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub scanned: usize,
    pub found: usize,
    pub current: String,
    pub done: bool,
}

fn skipped(entry: &DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy();
    SKIP.contains(&name.as_ref())
        // Hidden directories other than the ones we explicitly want are noise.
        || (name.starts_with('.') && name != "." && entry.depth() > 0)
}

/// Walks every enabled root, reporting progress through `on_progress`.
///
/// A directory that contains `.git`, or a recognisable project manifest, is a
/// candidate — and the walk does not descend into it.
pub fn scan<F>(roots: &[(String, i64)], existing: &[String], mut on_progress: F) -> Vec<Candidate>
where
    F: FnMut(Progress),
{
    let existing: HashSet<&str> = existing.iter().map(String::as_str).collect();
    let mut candidates: Vec<Candidate> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut scanned = 0usize;

    for (root, depth) in roots {
        let root_path = Path::new(root);
        if !root_path.is_dir() {
            continue;
        }
        let mut walker = WalkDir::new(root_path)
            .min_depth(1)
            .max_depth((*depth).clamp(1, 6) as usize)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| e.file_type().is_dir() && !skipped(e));

        while let Some(entry) = walker.next() {
            let Ok(entry) = entry else { continue };
            scanned += 1;
            let path = entry.path();

            let detection = detect::detect(path);
            let is_project = detection.has_git || detection.language.is_some();
            if !is_project {
                if scanned.is_multiple_of(50) {
                    on_progress(Progress {
                        scanned,
                        found: candidates.len(),
                        current: path.to_string_lossy().into_owned(),
                        done: false,
                    });
                }
                continue;
            }

            let path_str = path.to_string_lossy().into_owned();
            if seen.insert(path_str.clone()) {
                candidates.push(Candidate {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    already_added: existing.contains(path_str.as_str()),
                    path: path_str.clone(),
                    language: detection.language,
                    framework: detection.framework,
                    package_manager: detection.package_manager,
                    has_git: detection.has_git,
                });
            }
            on_progress(Progress {
                scanned,
                found: candidates.len(),
                current: path_str,
                done: false,
            });
            // A project is a leaf: its subdirectories are its own business.
            walker.skip_current_dir();
        }
    }

    candidates.sort_by_key(|c| c.name.to_lowercase());
    on_progress(Progress {
        scanned,
        found: candidates.len(),
        current: String::new(),
        done: true,
    });
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(path: std::path::PathBuf) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "{}").unwrap();
    }

    #[test]
    fn finds_projects_without_descending_into_them() {
        let root = std::env::temp_dir().join(format!(
            "archboard-scan-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        // A repository, with a nested package that must NOT be reported
        // separately, and a dependency directory that must never be entered.
        touch(root.join("web/package.json"));
        std::fs::create_dir_all(root.join("web/.git")).unwrap();
        touch(root.join("web/packages/inner/package.json"));
        touch(root.join("web/node_modules/left-pad/package.json"));
        // A plain project one level deeper, with no repository.
        touch(root.join("group/service/go.mod"));
        // Not a project at all.
        std::fs::create_dir_all(root.join("group/notes")).unwrap();

        let found = scan(&[(root.to_string_lossy().into_owned(), 3)], &[], |_| {});
        let names: Vec<&str> = found.iter().map(|c| c.name.as_str()).collect();

        assert_eq!(names, vec!["service", "web"]);
        assert!(found.iter().find(|c| c.name == "web").unwrap().has_git);
        assert_eq!(
            found.iter().find(|c| c.name == "service").unwrap().language.as_deref(),
            Some("Go")
        );
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn marks_paths_already_on_the_board() {
        let root = std::env::temp_dir().join(format!(
            "archboard-scan-dup-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        touch(root.join("api/Cargo.toml"));
        let existing = vec![root.join("api").to_string_lossy().into_owned()];

        let found = scan(&[(root.to_string_lossy().into_owned(), 2)], &existing, |_| {});
        assert_eq!(found.len(), 1);
        assert!(found[0].already_added);
        std::fs::remove_dir_all(&root).ok();
    }
}
