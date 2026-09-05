use rusqlite::Connection;

use crate::error::Result;

/// Ordered, append-only migration list. Index + 1 is the resulting
/// `user_version`; never edit or reorder an entry that has shipped.
const MIGRATIONS: &[&str] = &[
    // 1 — initial schema
    r#"
CREATE TABLE projects (
  id              INTEGER PRIMARY KEY,
  name            TEXT    NOT NULL,
  path            TEXT    NOT NULL UNIQUE,
  language        TEXT,
  framework       TEXT,
  package_manager TEXT,
  git_initialized INTEGER NOT NULL DEFAULT 0,
  git_remote      TEXT,
  is_favorite     INTEGER NOT NULL DEFAULT 0,
  open_count      INTEGER NOT NULL DEFAULT 0,
  last_opened     INTEGER,
  notes           TEXT,
  default_ide_id  INTEGER REFERENCES launchers(id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_projects_last_opened ON projects(last_opened DESC);
CREATE INDEX idx_projects_favorite    ON projects(is_favorite);
CREATE INDEX idx_projects_language    ON projects(language);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT
);

CREATE TABLE project_tags (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);
CREATE INDEX idx_project_tags_tag ON project_tags(tag_id);

CREATE TABLE launchers (
  id        INTEGER PRIMARY KEY,
  kind      TEXT    NOT NULL CHECK (kind IN ('ide','terminal')),
  name      TEXT    NOT NULL,
  bundle_id TEXT,
  exec_path TEXT,
  args      TEXT,
  platform  TEXT    NOT NULL DEFAULT 'macos',
  detected  INTEGER NOT NULL DEFAULT 0,
  enabled   INTEGER NOT NULL DEFAULT 1,
  UNIQUE (kind, name)
);

CREATE TABLE scan_roots (
  id      INTEGER PRIMARY KEY,
  path    TEXT    NOT NULL UNIQUE,
  depth   INTEGER NOT NULL DEFAULT 3,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#,
    // 2 — saved per-project commands
    r#"
CREATE TABLE project_commands (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL,
  command    TEXT    NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_project_commands_project ON project_commands(project_id, position);
    "#,
    // 3 — workspace flag on saved commands
    r#"
ALTER TABLE project_commands ADD COLUMN in_workspace INTEGER NOT NULL DEFAULT 0;
"#,
];

pub fn migrate(conn: &mut Connection) -> Result<()> {
    // These three cannot run inside a transaction, and are settings rather
    // than schema, so they are applied every open.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    apply(conn, MIGRATIONS)
}

/// Applies every migration the database has not seen yet.
///
/// One transaction per migration, covering both the statements and the version
/// bump. Without it a migration that fails half way leaves its early
/// statements applied and `user_version` unchanged, so the next launch replays
/// them, hits "table already exists", and the database can never be opened
/// again — an unrecoverable failure caused by trying to recover.
fn apply(conn: &mut Connection, migrations: &[&str]) -> Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in migrations.iter().enumerate().skip(version as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failing_migration_rolls_back_and_leaves_the_database_openable() {
        let mut conn = Connection::open_in_memory().unwrap();
        let good = "CREATE TABLE a (id INTEGER PRIMARY KEY);";
        // Creates a table, then fails. Without a transaction the table would
        // survive, the version would stay at 1, and the retry would collide.
        let bad = "CREATE TABLE b (id INTEGER PRIMARY KEY); SELECT nonexistent_fn();";

        assert!(apply(&mut conn, &[good, bad]).is_err());

        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 1, "the migration that succeeded should be recorded");

        let leaked: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE name = 'b'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(leaked, 0, "the failed migration left a table behind");

        // The retry must now be able to make progress rather than colliding.
        let fixed = "CREATE TABLE b (id INTEGER PRIMARY KEY);";
        apply(&mut conn, &[good, fixed]).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 2);
    }

    #[test]
    fn every_shipped_migration_applies_to_a_fresh_database() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply(&mut conn, MIGRATIONS).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version as usize, MIGRATIONS.len());
    }

    #[test]
    fn migrating_an_older_database_adds_only_what_is_missing() {
        // A version-1 database, as shipped before saved commands existed.
        let mut conn = Connection::open_in_memory().unwrap();
        apply(&mut conn, &MIGRATIONS[..1]).unwrap();
        apply(&mut conn, MIGRATIONS).unwrap();
        conn.query_row("SELECT COUNT(in_workspace) FROM project_commands", [], |r| {
            r.get::<_, i64>(0)
        })
        .expect("upgrade from v1 did not produce the current schema");
    }
}
