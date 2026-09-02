use std::future::Future;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::models::*;
use crate::db::{self, Db};
use crate::detect::{self, Detection};
use crate::error::{AppError, Code, Result};
use crate::git::{self, Commit, GitStatus};
use crate::launcher;
use crate::scan::{self, Candidate};
use crate::shortcut;
use crate::window;

/// Canonicalizes and validates a user-supplied directory before it is ever
/// stored or used as a working directory.
fn validate_dir(raw: &str) -> Result<PathBuf> {
    let expanded = if let Some(rest) = raw.strip_prefix("~/") {
        dirs::home_dir()
            .ok_or_else(|| AppError::new(Code::Invalid, "Could not locate your home folder."))?
            .join(rest)
    } else {
        PathBuf::from(raw)
    };
    let canonical = expanded.canonicalize().map_err(|_| {
        AppError::new(Code::PathMissing, format!("There is nothing at {raw}."))
            .hint("Check the path, or pick the folder again.")
    })?;
    if !canonical.is_dir() {
        return Err(AppError::new(Code::Invalid, format!("{raw} is a file, not a folder."))
            .hint("Choose the folder that contains the project."));
    }
    Ok(canonical)
}

// ------------------------------------------------------------------ projects

#[tauri::command]
pub fn list_projects(db: State<'_, Db>) -> Result<Vec<Project>> {
    db::list_projects(&db.conn())
}

#[tauri::command]
pub fn get_project(db: State<'_, Db>, id: i64) -> Result<Project> {
    db::get_project(&db.conn(), id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddOutcome {
    pub project: Project,
    /// True when the folder is not a git repository. The UI asks before running
    /// `git init`; Archboard never initializes silently.
    pub needs_git_init: bool,
}

#[tauri::command]
pub fn add_project(db: State<'_, Db>, path: String, name: Option<String>) -> Result<AddOutcome> {
    let dir = validate_dir(&path)?;
    let detection = detect::detect(&dir);
    let display_name = name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .or_else(|| dir.file_name().map(|n| n.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "Untitled".into());

    let conn = db.conn();
    let id = db::insert_project(
        &conn,
        db::NewProject {
            name: display_name,
            path: dir.to_string_lossy().into_owned(),
            language: detection.language.clone(),
            framework: detection.framework.clone(),
            package_manager: detection.package_manager.clone(),
            git_initialized: detection.has_git,
            git_remote: None,
        },
    )?;
    Ok(AddOutcome { project: db::get_project(&conn, id)?, needs_git_init: !detection.has_git })
}

#[tauri::command]
pub fn add_projects(db: State<'_, Db>, paths: Vec<String>) -> Result<Vec<Project>> {
    let conn = db.conn();
    let mut added = Vec::new();
    for path in paths {
        let Ok(dir) = validate_dir(&path) else { continue };
        let detection = detect::detect(&dir);
        let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let record = db::NewProject {
            name,
            path: dir.to_string_lossy().into_owned(),
            language: detection.language,
            framework: detection.framework,
            package_manager: detection.package_manager,
            git_initialized: detection.has_git,
            git_remote: None,
        };
        // A path already on the board is a no-op. Anything else is a genuine
        // failure and must not be swallowed just because this is a bulk call.
        match db::insert_project(&conn, record) {
            Ok(id) => added.push(db::get_project(&conn, id)?),
            Err(e) if e.code == Code::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(added)
}

#[tauri::command]
pub fn remove_project(db: State<'_, Db>, id: i64) -> Result<()> {
    git::invalidate(id);
    db::remove_project(&db.conn(), id)
}

#[tauri::command]
pub fn update_project(db: State<'_, Db>, id: i64, patch: ProjectPatch) -> Result<Project> {
    let conn = db.conn();
    db::update_project(&conn, id, patch)?;
    db::get_project(&conn, id)
}

#[tauri::command]
pub fn set_favorite(db: State<'_, Db>, id: i64, favorite: bool) -> Result<Project> {
    let conn = db.conn();
    db::update_project(&conn, id, ProjectPatch { is_favorite: Some(favorite), ..Default::default() })?;
    db::get_project(&conn, id)
}

#[tauri::command]
pub fn touch_project(db: State<'_, Db>, id: i64) -> Result<Project> {
    let conn = db.conn();
    db::touch_project(&conn, id)?;
    db::get_project(&conn, id)
}

#[tauri::command]
pub fn redetect_project(db: State<'_, Db>, id: i64) -> Result<Project> {
    let conn = db.conn();
    let path = db::project_path(&conn, id)?;
    let dir = validate_dir(&path)?;
    let d = detect::detect(&dir);
    db::set_detection(&conn, id, d.language.as_deref(), d.framework.as_deref(), d.package_manager.as_deref())?;
    db::get_project(&conn, id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
    pub project: Project,
    pub detection: Detection,
    pub readme: Option<String>,
}

#[tauri::command]
pub fn project_detail(db: State<'_, Db>, id: i64) -> Result<ProjectDetail> {
    let (project, path) = {
        let conn = db.conn();
        let project = db::get_project(&conn, id)?;
        let path = project.path.clone();
        (project, path)
    };
    let dir = Path::new(&path);
    let detection = if dir.is_dir() { detect::detect(dir) } else { Detection::default() };
    // 8 KB is enough for a title and an intro; the detail pane never scrolls it all.
    let readme = if dir.is_dir() { detect::readme_preview(dir, 8 * 1024) } else { None };
    Ok(ProjectDetail { project, detection, readme })
}

// ----------------------------------------------------------------------- git

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitEntry {
    pub project_id: i64,
    pub status: Option<GitStatus>,
    pub error: Option<AppError>,
}

#[tauri::command]
pub async fn git_status(db: State<'_, Db>, id: i64, force: Option<bool>) -> Result<GitStatus> {
    let path = { db::project_path(&db.conn(), id)? };
    let status = git::status(id, &path, force.unwrap_or(false)).await?;
    {
        let conn = db.conn();
        db::set_git_hint(
            &conn,
            id,
            status.initialized,
            status.remote.as_ref().map(|r| r.raw.as_str()),
        )?;
    }
    Ok(status)
}

/// Batched refresh for whichever rows are on screen. Bounded internally, so the
/// frontend can call this with every visible id without throttling it further.
#[tauri::command]
pub async fn git_status_batch(
    db: State<'_, Db>,
    ids: Vec<i64>,
    force: Option<bool>,
) -> Result<Vec<GitEntry>> {
    let force = force.unwrap_or(false);
    let targets: Vec<(i64, String)> = {
        let conn = db.conn();
        ids.iter().filter_map(|&id| db::project_path(&conn, id).ok().map(|p| (id, p))).collect()
    };

    let futures = targets.into_iter().map(|(id, path)| async move {
        match git::status(id, &path, force).await {
            Ok(status) => GitEntry { project_id: id, status: Some(status), error: None },
            Err(error) => GitEntry { project_id: id, status: None, error: Some(error) },
        }
    });
    let entries: Vec<GitEntry> = futures_join(futures).await;

    {
        let conn = db.conn();
        for entry in &entries {
            if let Some(status) = &entry.status {
                let _ = db::set_git_hint(
                    &conn,
                    entry.project_id,
                    status.initialized,
                    status.remote.as_ref().map(|r| r.raw.as_str()),
                );
            }
        }
    }
    Ok(entries)
}

/// Drives a set of futures to completion concurrently. The git module's own
/// semaphore is what actually caps process spawns.
async fn futures_join<F, T>(futures: impl IntoIterator<Item = F>) -> Vec<T>
where
    F: Future<Output = T> + Send + 'static,
    T: Send + 'static,
{
    let handles: Vec<_> = futures.into_iter().map(tauri::async_runtime::spawn).collect();
    let mut out = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(value) = handle.await {
            out.push(value);
        }
    }
    out
}

#[tauri::command]
pub async fn git_init(db: State<'_, Db>, id: i64) -> Result<GitStatus> {
    let path = { db::project_path(&db.conn(), id)? };
    git::init(&path).await?;
    git::invalidate(id);
    let status = git::status(id, &path, true).await?;
    {
        db::set_git_hint(&db.conn(), id, true, None)?;
    }
    Ok(status)
}

#[tauri::command]
pub async fn git_recent_commits(db: State<'_, Db>, id: i64, count: Option<u32>) -> Result<Vec<Commit>> {
    let path = { db::project_path(&db.conn(), id)? };
    git::recent_commits(&path, count.unwrap_or(8)).await
}

#[tauri::command]
pub async fn git_branches(db: State<'_, Db>, id: i64) -> Result<Vec<String>> {
    let path = { db::project_path(&db.conn(), id)? };
    git::branches(&path).await
}

// ----------------------------------------------------------------- launchers

#[tauri::command]
pub fn detect_launchers(db: State<'_, Db>) -> Result<Vec<Launcher>> {
    let found = launcher::detect();
    let conn = db.conn();
    for l in &found {
        db::upsert_launcher(&conn, l)?;
    }
    let keep: Vec<(&str, &str)> =
        found.iter().map(|l| (l.kind.as_str(), l.name.as_str())).collect();
    db::prune_detected(&conn, &keep)?;
    // Seed sensible defaults the first time we find anything.
    if db::get_setting(&conn, "default_ide_id")?.is_none() {
        if let Some(first) = db::list_launchers(&conn, Some(LauncherKind::Ide))?.first() {
            db::set_setting(&conn, "default_ide_id", &first.id.to_string())?;
        }
    }
    if db::get_setting(&conn, "default_terminal_id")?.is_none() {
        if let Some(first) = db::list_launchers(&conn, Some(LauncherKind::Terminal))?.first() {
            db::set_setting(&conn, "default_terminal_id", &first.id.to_string())?;
        }
    }
    db::list_launchers(&conn, None)
}

#[tauri::command]
pub fn list_launchers(db: State<'_, Db>, kind: Option<LauncherKind>) -> Result<Vec<Launcher>> {
    db::list_launchers(&db.conn(), kind)
}

#[tauri::command]
pub fn upsert_launcher(db: State<'_, Db>, launcher: Launcher) -> Result<Launcher> {
    if let Some(exec) = launcher.exec_path.as_deref().filter(|e| !e.is_empty()) {
        let p = Path::new(exec);
        if !p.is_absolute() {
            return Err(AppError::new(Code::Invalid, "Enter the full path to the application.")
                .hint("For example: /Applications/Cursor.app or /opt/homebrew/bin/cursor"));
        }
        if !p.exists() {
            return Err(AppError::new(Code::PathMissing, format!("There is nothing at {exec}.")));
        }
    }
    let conn = db.conn();
    let id = db::upsert_launcher(&conn, &launcher)?;
    db::get_launcher(&conn, id)
}

#[tauri::command]
pub fn delete_launcher(db: State<'_, Db>, id: i64) -> Result<()> {
    db::delete_launcher(&db.conn(), id)
}

fn open_with(db: &Db, kind: LauncherKind, project_id: i64, launcher_id: Option<i64>) -> Result<()> {
    let (chosen, path) = {
        let conn = db.conn();
        let project = db::get_project(&conn, project_id)?;
        let chosen = launcher::resolve(&conn, kind, launcher_id, project.default_ide_id)?;
        (chosen, project.path)
    };
    launcher::launch(&chosen, Path::new(&path))?;
    let conn = db.conn();
    db::touch_project(&conn, project_id)
}

#[tauri::command]
pub fn open_in_ide(db: State<'_, Db>, id: i64, launcher_id: Option<i64>) -> Result<()> {
    open_with(&db, LauncherKind::Ide, id, launcher_id)
}

#[tauri::command]
pub fn open_terminal(db: State<'_, Db>, id: i64, launcher_id: Option<i64>) -> Result<()> {
    open_with(&db, LauncherKind::Terminal, id, launcher_id)
}

#[tauri::command]
pub fn open_folder(app: AppHandle, db: State<'_, Db>, id: i64) -> Result<()> {
    let path = { db::project_path(&db.conn(), id)? };
    git::verify_dir(&path)?;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .reveal_item_in_dir(&path)
        .map_err(|e| AppError::new(Code::Io, format!("Could not reveal the folder: {e}")))
}

#[tauri::command]
pub async fn open_remote(app: AppHandle, db: State<'_, Db>, id: i64) -> Result<String> {
    let path = { db::project_path(&db.conn(), id)? };
    let status = git::status(id, &path, false).await?;
    let url = status
        .remote
        .as_ref()
        .and_then(|r| r.web_url.clone())
        .ok_or_else(|| {
            AppError::new(Code::NoRemote, "This project has no remote to open.")
                .hint("Add one with: git remote add origin <url>")
        })?;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(&url, None::<&str>)
        .map_err(|e| AppError::new(Code::Io, format!("Could not open your browser: {e}")))?;
    Ok(url)
}

// ---------------------------------------------------------------------- tags

#[tauri::command]
pub fn list_tags(db: State<'_, Db>) -> Result<Vec<Tag>> {
    db::list_tags(&db.conn())
}

#[tauri::command]
pub fn create_tag(db: State<'_, Db>, name: String) -> Result<Tag> {
    db::create_tag(&db.conn(), &name)
}

#[tauri::command]
pub fn rename_tag(db: State<'_, Db>, id: i64, name: String) -> Result<()> {
    db::rename_tag(&db.conn(), id, &name)
}

#[tauri::command]
pub fn delete_tag(db: State<'_, Db>, id: i64) -> Result<()> {
    db::delete_tag(&db.conn(), id)
}

#[tauri::command]
pub fn set_project_tags(db: State<'_, Db>, id: i64, tag_ids: Vec<i64>) -> Result<Project> {
    let mut conn = db.conn();
    db::set_project_tags(&mut conn, id, &tag_ids)?;
    db::get_project(&conn, id)
}

// ---------------------------------------------------------------- scan roots

#[tauri::command]
pub fn list_scan_roots(db: State<'_, Db>) -> Result<Vec<ScanRoot>> {
    db::list_scan_roots(&db.conn())
}

#[tauri::command]
pub fn add_scan_root(db: State<'_, Db>, path: String, depth: Option<i64>) -> Result<Vec<ScanRoot>> {
    let dir = validate_dir(&path)?;
    let conn = db.conn();
    db::add_scan_root(&conn, &dir.to_string_lossy(), depth.unwrap_or(3))?;
    db::list_scan_roots(&conn)
}

#[tauri::command]
pub fn update_scan_root(
    db: State<'_, Db>,
    id: i64,
    depth: Option<i64>,
    enabled: Option<bool>,
) -> Result<Vec<ScanRoot>> {
    let conn = db.conn();
    db::update_scan_root(&conn, id, depth, enabled)?;
    db::list_scan_roots(&conn)
}

#[tauri::command]
pub fn remove_scan_root(db: State<'_, Db>, id: i64) -> Result<Vec<ScanRoot>> {
    let conn = db.conn();
    db::remove_scan_root(&conn, id)?;
    db::list_scan_roots(&conn)
}

/// Runs the walk off the UI thread, streaming `scan:progress` and finishing
/// with `scan:done`. Nothing is written to the database: the payload is a list
/// of candidates for the user to approve.
#[tauri::command]
pub fn scan_roots(app: AppHandle) -> Result<()> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = handle.state::<Db>();
        let (roots, existing) = {
            let conn = db.conn();
            let roots = db::list_scan_roots(&conn)
                .unwrap_or_default()
                .into_iter()
                .filter(|r| r.enabled)
                .map(|r| (r.path, r.depth))
                .collect::<Vec<_>>();
            (roots, db::existing_paths(&conn).unwrap_or_default())
        };

        let mut last = std::time::Instant::now();
        let candidates: Vec<Candidate> = scan::scan(&roots, &existing, |progress| {
            // Throttle to roughly 20 frames a second; the walk is far faster
            // than the UI can usefully redraw.
            if progress.done || last.elapsed() >= std::time::Duration::from_millis(50) {
                last = std::time::Instant::now();
                let _ = handle.emit("scan:progress", &progress);
            }
        });
        let _ = handle.emit("scan:done", &candidates);
    });
    Ok(())
}

// ------------------------------------------------------------------ settings

#[tauri::command]
pub fn get_settings(db: State<'_, Db>) -> Result<std::collections::HashMap<String, String>> {
    db::get_settings(&db.conn())
}

#[tauri::command]
pub fn set_setting(db: State<'_, Db>, key: String, value: String) -> Result<()> {
    db::set_setting(&db.conn(), &key, &value)
}

// ------------------------------------------------- global shortcut & window

/// Binds a new global shortcut, or clears it when `accelerator` is `None`.
///
/// The new binding is proved to work before it is saved: if the combination is
/// taken, the previous one is put back so the user is never left with nothing.
#[tauri::command]
pub fn set_global_shortcut(
    app: AppHandle,
    db: State<'_, Db>,
    accelerator: Option<String>,
) -> Result<()> {
    let previous = {
        let conn = db.conn();
        db::get_setting(&conn, shortcut::SETTING_KEY)?
    };

    match accelerator.as_deref().map(str::trim).filter(|a| !a.is_empty()) {
        Some(next) => {
            if let Err(e) = shortcut::apply(&app, next) {
                if let Some(previous) = previous.as_deref() {
                    let _ = shortcut::apply(&app, previous);
                }
                return Err(e);
            }
            let conn = db.conn();
            db::set_setting(&conn, shortcut::SETTING_KEY, next)?;
            db::set_setting(&conn, shortcut::SETTING_ENABLED, "true")?;
        }
        None => {
            shortcut::clear(&app);
            db::set_setting(&db.conn(), shortcut::SETTING_ENABLED, "false")?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: AppHandle) {
    window::hide(&app);
}

/// Adds or removes the Dock icon. Applied immediately, no restart.
#[tauri::command]
pub fn set_dock_visible(app: AppHandle, db: State<'_, Db>, visible: bool) -> Result<()> {
    window::set_dock_visible(&app, visible);
    db::set_setting(&db.conn(), "show_dock_icon", &visible.to_string())
}
