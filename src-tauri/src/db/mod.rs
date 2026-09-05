pub mod models;
mod schema;

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, Code, Result};
use models::*;

/// Single-connection SQLite handle. Every query here is short and synchronous;
/// the guard is never held across an `.await`.
pub struct Db(pub Mutex<Connection>);

impl Db {
    /// Opens the database and brings the schema up to date.
    ///
    /// Opening deliberately does not write any user configuration. Seeding
    /// scan roots here meant that deleting every root and restarting silently
    /// put one back, because the seed fires whenever the table is empty and
    /// "empty" is indistinguishable from "the user emptied it". Discovery is
    /// offered once, by `seed_default_scan_roots`, and only when asked.
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut conn = Connection::open(path)?;
        schema::migrate(&mut conn)?;
        Ok(Self(Mutex::new(conn)))
    }

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        // A poisoned lock means another thread panicked mid-query. The data on
        // disk is still consistent (SQLite transactions are atomic), so
        // recovering is strictly better than taking the whole app down.
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

// ---------------------------------------------------------------- projects

pub fn list_projects(conn: &Connection) -> Result<Vec<Project>> {
    let sql = format!("SELECT {} FROM projects", Project::COLUMNS);
    let mut stmt = conn.prepare(&sql)?;
    let mut projects: Vec<Project> =
        stmt.query_map([], Project::from_row)?.collect::<Result<_, _>>()?;

    // One extra query beats N per-project lookups.
    let mut tag_stmt = conn.prepare(
        "SELECT pt.project_id, t.name FROM project_tags pt \
         JOIN tags t ON t.id = pt.tag_id ORDER BY t.name COLLATE NOCASE",
    )?;
    let mut by_project: HashMap<i64, Vec<String>> = HashMap::new();
    let rows = tag_stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (pid, name) = row?;
        by_project.entry(pid).or_default().push(name);
    }
    for p in &mut projects {
        if let Some(tags) = by_project.remove(&p.id) {
            p.tags = tags;
        }
    }
    Ok(projects)
}

pub fn get_project(conn: &Connection, id: i64) -> Result<Project> {
    let sql = format!("SELECT {} FROM projects WHERE id = ?1", Project::COLUMNS);
    let mut project = conn
        .query_row(&sql, params![id], Project::from_row)
        .optional()?
        .ok_or_else(|| AppError::not_found("That project"))?;
    let mut stmt = conn.prepare(
        "SELECT t.name FROM project_tags pt JOIN tags t ON t.id = pt.tag_id \
         WHERE pt.project_id = ?1 ORDER BY t.name COLLATE NOCASE",
    )?;
    project.tags = stmt.query_map(params![id], |r| r.get(0))?.collect::<Result<_, _>>()?;
    Ok(project)
}

pub fn project_path(conn: &Connection, id: i64) -> Result<String> {
    conn.query_row("SELECT path FROM projects WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| AppError::not_found("That project"))
}

pub struct NewProject {
    pub name: String,
    pub path: String,
    pub language: Option<String>,
    pub framework: Option<String>,
    pub package_manager: Option<String>,
    pub git_initialized: bool,
    pub git_remote: Option<String>,
}

pub fn insert_project(conn: &Connection, p: NewProject) -> Result<i64> {
    let ts = now();
    conn.execute(
        "INSERT INTO projects (name, path, language, framework, package_manager, \
          git_initialized, git_remote, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![
            p.name,
            p.path,
            p.language,
            p.framework,
            p.package_manager,
            p.git_initialized as i64,
            p.git_remote,
            ts
        ],
    )
    .map_err(|e| match AppError::from(e) {
        e if e.code == Code::AlreadyExists => {
            AppError::new(Code::AlreadyExists, format!("{} is already on your board.", p.name))
        }
        other => other,
    })?;
    Ok(conn.last_insert_rowid())
}

pub fn update_project(conn: &Connection, id: i64, patch: ProjectPatch) -> Result<()> {
    if let Some(name) = patch.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::new(Code::Invalid, "A project needs a name."));
        }
        conn.execute("UPDATE projects SET name = ?2 WHERE id = ?1", params![id, name])?;
    }
    if let Some(notes) = patch.notes {
        conn.execute("UPDATE projects SET notes = ?2 WHERE id = ?1", params![id, notes])?;
    }
    if let Some(fav) = patch.is_favorite {
        conn.execute(
            "UPDATE projects SET is_favorite = ?2 WHERE id = ?1",
            params![id, fav as i64],
        )?;
    }
    if let Some(ide) = patch.default_ide_id {
        conn.execute("UPDATE projects SET default_ide_id = ?2 WHERE id = ?1", params![id, ide])?;
    }
    conn.execute("UPDATE projects SET updated_at = ?2 WHERE id = ?1", params![id, now()])?;
    Ok(())
}

pub fn remove_project(conn: &Connection, id: i64) -> Result<()> {
    let n = conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    if n == 0 {
        return Err(AppError::not_found("That project"));
    }
    Ok(())
}

/// Records an open. Drives both "Recently opened" and the frecency sort.
pub fn touch_project(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "UPDATE projects SET last_opened = ?2, open_count = open_count + 1, updated_at = ?2 \
         WHERE id = ?1",
        params![id, now()],
    )?;
    Ok(())
}

pub fn set_detection(
    conn: &Connection,
    id: i64,
    language: Option<&str>,
    framework: Option<&str>,
    package_manager: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE projects SET language = ?2, framework = ?3, package_manager = ?4, updated_at = ?5 \
         WHERE id = ?1",
        params![id, language, framework, package_manager, now()],
    )?;
    Ok(())
}

/// Refreshes the cached git hints so the next cold start paints correctly.
pub fn set_git_hint(conn: &Connection, id: i64, initialized: bool, remote: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE projects SET git_initialized = ?2, git_remote = ?3 WHERE id = ?1",
        params![id, initialized as i64, remote],
    )?;
    Ok(())
}

pub fn existing_paths(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT path FROM projects")?;
    let rows = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, rusqlite::Error>>()?;
    Ok(rows)
}

// -------------------------------------------------------------------- tags

pub fn list_tags(conn: &Connection) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE")?;
    let rows = stmt
        .query_map([], |r| Ok(Tag { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? }))?
        .collect::<Result<_, rusqlite::Error>>()?;
    Ok(rows)
}

pub fn create_tag(conn: &Connection, name: &str) -> Result<Tag> {
    let name = normalize_tag(name)?;
    conn.execute("INSERT INTO tags (name) VALUES (?1)", params![name]).map_err(|e| {
        match AppError::from(e) {
            e if e.code == Code::AlreadyExists => {
                AppError::new(Code::AlreadyExists, format!("The tag \u{201c}{name}\u{201d} already exists."))
            }
            other => other,
        }
    })?;
    Ok(Tag { id: conn.last_insert_rowid(), name, color: None })
}

pub fn rename_tag(conn: &Connection, id: i64, name: &str) -> Result<()> {
    let name = normalize_tag(name)?;
    conn.execute("UPDATE tags SET name = ?2 WHERE id = ?1", params![id, name])?;
    Ok(())
}

pub fn delete_tag(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_project_tags(conn: &mut Connection, project_id: i64, tag_ids: &[i64]) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM project_tags WHERE project_id = ?1", params![project_id])?;
    {
        let mut stmt =
            tx.prepare("INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?1, ?2)")?;
        for tag_id in tag_ids {
            stmt.execute(params![project_id, tag_id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

fn normalize_tag(name: &str) -> Result<String> {
    let name = name.trim().trim_start_matches('#').trim().to_string();
    if name.is_empty() {
        return Err(AppError::new(Code::Invalid, "A tag needs a name."));
    }
    Ok(name)
}

// --------------------------------------------------------------- launchers

pub fn list_launchers(conn: &Connection, kind: Option<LauncherKind>) -> Result<Vec<Launcher>> {
    let sql = match kind {
        Some(_) => format!(
            "SELECT {} FROM launchers WHERE kind = ?1 ORDER BY detected DESC, name COLLATE NOCASE",
            Launcher::COLUMNS
        ),
        None => format!(
            "SELECT {} FROM launchers ORDER BY kind, detected DESC, name COLLATE NOCASE",
            Launcher::COLUMNS
        ),
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<Launcher> = match kind {
        Some(k) => stmt
            .query_map(params![k.as_str()], Launcher::from_row)?
            .collect::<Result<_, rusqlite::Error>>()?,
        None => stmt.query_map([], Launcher::from_row)?.collect::<Result<_, rusqlite::Error>>()?,
    };
    Ok(rows)
}

pub fn get_launcher(conn: &Connection, id: i64) -> Result<Launcher> {
    let sql = format!("SELECT {} FROM launchers WHERE id = ?1", Launcher::COLUMNS);
    conn.query_row(&sql, params![id], Launcher::from_row)
        .optional()?
        .ok_or_else(|| AppError::not_found("That application"))
}

pub fn upsert_launcher(conn: &Connection, l: &Launcher) -> Result<i64> {
    if l.id > 0 {
        conn.execute(
            "UPDATE launchers SET name = ?2, bundle_id = ?3, exec_path = ?4, args = ?5, \
              enabled = ?6 WHERE id = ?1",
            params![l.id, l.name, l.bundle_id, l.exec_path, l.args, l.enabled as i64],
        )?;
        return Ok(l.id);
    }
    conn.execute(
        "INSERT INTO launchers (kind, name, bundle_id, exec_path, args, platform, detected, enabled) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
         ON CONFLICT(kind, name) DO UPDATE SET \
           bundle_id = COALESCE(excluded.bundle_id, launchers.bundle_id), \
           exec_path = COALESCE(excluded.exec_path, launchers.exec_path)",
        params![
            l.kind.as_str(),
            l.name,
            l.bundle_id,
            l.exec_path,
            l.args,
            l.platform,
            l.detected as i64,
            l.enabled as i64
        ],
    )?;
    Ok(conn.query_row(
        "SELECT id FROM launchers WHERE kind = ?1 AND name = ?2",
        params![l.kind.as_str(), l.name],
        |r| r.get(0),
    )?)
}

/// Drops applications we previously detected but can no longer find, so an
/// uninstalled editor stops being offered. Rows the user configured by hand
/// (`detected = 0`) are never touched.
pub fn prune_detected(conn: &Connection, keep: &[(&str, &str)]) -> Result<()> {
    let mut stmt = conn.prepare("SELECT id, kind, name FROM launchers WHERE detected = 1")?;
    let rows: Vec<(i64, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, rusqlite::Error>>()?;
    drop(stmt);

    for (id, kind, name) in rows {
        if !keep.iter().any(|(k, n)| *k == kind && *n == name) {
            conn.execute("DELETE FROM launchers WHERE id = ?1", params![id])?;
        }
    }
    Ok(())
}

pub fn delete_launcher(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM launchers WHERE id = ?1", params![id])?;
    Ok(())
}

// ------------------------------------------------------------- scan roots

pub fn list_scan_roots(conn: &Connection) -> Result<Vec<ScanRoot>> {
    let mut stmt = conn.prepare("SELECT id, path, depth, enabled FROM scan_roots ORDER BY path")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ScanRoot {
                id: r.get(0)?,
                path: r.get(1)?,
                depth: r.get(2)?,
                enabled: r.get::<_, i64>(3)? != 0,
            })
        })?
        .collect::<Result<_, rusqlite::Error>>()?;
    Ok(rows)
}

pub fn add_scan_root(conn: &Connection, path: &str, depth: i64) -> Result<i64> {
    conn.execute(
        "INSERT OR IGNORE INTO scan_roots (path, depth) VALUES (?1, ?2)",
        params![path, depth.clamp(1, 6)],
    )?;
    Ok(conn.query_row("SELECT id FROM scan_roots WHERE path = ?1", params![path], |r| r.get(0))?)
}

pub fn update_scan_root(conn: &Connection, id: i64, depth: Option<i64>, enabled: Option<bool>) -> Result<()> {
    if let Some(depth) = depth {
        conn.execute("UPDATE scan_roots SET depth = ?2 WHERE id = ?1", params![id, depth.clamp(1, 6)])?;
    }
    if let Some(enabled) = enabled {
        conn.execute("UPDATE scan_roots SET enabled = ?2 WHERE id = ?1", params![id, enabled as i64])?;
    }
    Ok(())
}

pub fn remove_scan_root(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM scan_roots WHERE id = ?1", params![id])?;
    Ok(())
}

// ---------------------------------------------------------------- settings

pub fn get_settings(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(map)
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
        .optional()?)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

// -------------------------------------------------------- project commands

pub fn list_commands(conn: &Connection, project_id: i64) -> Result<Vec<ProjectCommand>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, label, command, position, in_workspace, created_at \
         FROM project_commands WHERE project_id = ?1 ORDER BY position, id",
    )?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            Ok(ProjectCommand {
                id: r.get(0)?,
                project_id: r.get(1)?,
                label: r.get(2)?,
                command: r.get(3)?,
                position: r.get(4)?,
                in_workspace: r.get(5)?,
                created_at: r.get(6)?,
            })
        })?
        .collect::<Result<_, rusqlite::Error>>()?;
    Ok(rows)
}

pub fn get_command(conn: &Connection, id: i64) -> Result<ProjectCommand> {
    conn.query_row(
        "SELECT id, project_id, label, command, position, in_workspace, created_at \
         FROM project_commands WHERE id = ?1",
        params![id],
        |r| {
            Ok(ProjectCommand {
                id: r.get(0)?,
                project_id: r.get(1)?,
                label: r.get(2)?,
                command: r.get(3)?,
                position: r.get(4)?,
                in_workspace: r.get(5)?,
                created_at: r.get(6)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::not_found("That command"))
}

pub fn upsert_command(conn: &Connection, c: &ProjectCommand) -> Result<i64> {
    let label = c.label.trim();
    let command = c.command.trim();
    if label.is_empty() || command.is_empty() {
        return Err(AppError::new(Code::Invalid, "A command needs a name and something to run."));
    }
    if c.id > 0 {
        conn.execute(
            "UPDATE project_commands SET label = ?2, command = ?3, in_workspace = ?4 WHERE id = ?1",
            params![c.id, label, command, c.in_workspace],
        )?;
        return Ok(c.id);
    }
    let next: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM project_commands WHERE project_id = ?1",
        params![c.project_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO project_commands (project_id, label, command, position, in_workspace, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![c.project_id, label, command, next, c.in_workspace, now()],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_command(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM project_commands WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn workspace_commands(conn: &Connection, project_id: i64) -> Result<Vec<ProjectCommand>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, label, command, position, in_workspace, created_at \
         FROM project_commands WHERE project_id = ?1 AND in_workspace = 1 ORDER BY position, id",
    )?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            Ok(ProjectCommand {
                id: r.get(0)?,
                project_id: r.get(1)?,
                label: r.get(2)?,
                command: r.get(3)?,
                position: r.get(4)?,
                in_workspace: r.get(5)?,
                created_at: r.get(6)?,
            })
        })?
        .collect::<Result<_, rusqlite::Error>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique per call: parallel tests must not share a database file.
    fn scratch_db() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static SEQ: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "archboard-db-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::remove_dir_all(&dir).ok();
        dir.join("archboard.db")
    }

    #[test]
    fn opening_the_database_writes_no_user_configuration() {
        // Opening used to seed scan roots whenever the table was empty, which
        // made "I deleted every scan root" and "this is a fresh install" the
        // same state, and quietly undid the former on the next launch.
        let path = scratch_db();
        let db = Db::open(&path).unwrap();
        assert_eq!(list_scan_roots(&db.conn()).unwrap().len(), 0);
    }

    #[test]
    fn deleted_scan_roots_stay_deleted_across_reopen() {
        let path = scratch_db();
        let dir = std::env::temp_dir();
        {
            let db = Db::open(&path).unwrap();
            add_scan_root(&db.conn(), &dir.to_string_lossy(), 3).unwrap();
            let roots = list_scan_roots(&db.conn()).unwrap();
            assert_eq!(roots.len(), 1);
            remove_scan_root(&db.conn(), roots[0].id).unwrap();
        }
        let reopened = Db::open(&path).unwrap();
        assert_eq!(
            list_scan_roots(&reopened.conn()).unwrap().len(),
            0,
            "a root the user removed came back after restart"
        );
    }

    #[test]
    fn migrations_are_idempotent_across_reopen() {
        let path = scratch_db();
        let first = Db::open(&path).unwrap();
        let version: i64 = first
            .conn()
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        drop(first);
        let second = Db::open(&path).unwrap();
        let again: i64 = second
            .conn()
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, again);
        // The column added by migration 3 must exist exactly once and be
        // readable as the bool the model declares.
        second
            .conn()
            .query_row("SELECT COUNT(in_workspace) FROM project_commands", [], |r| {
                r.get::<_, i64>(0)
            })
            .expect("in_workspace column missing after reopen");
    }

    #[test]
    fn foreign_keys_are_enforced_on_this_connection() {
        // project_tags and project_commands rely on ON DELETE CASCADE. If the
        // pragma is off, deleting a project silently orphans its rows.
        let path = scratch_db();
        let db = Db::open(&path).unwrap();
        let on: i64 = db
            .conn()
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(on, 1, "foreign keys are off; cascades will not fire");
    }
}
