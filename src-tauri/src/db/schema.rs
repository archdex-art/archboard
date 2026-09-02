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
];

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;

    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        conn.execute_batch(sql)?;
        conn.pragma_update(None, "user_version", (i + 1) as i64)?;
    }
    Ok(())
}
