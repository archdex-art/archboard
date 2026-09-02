use rusqlite::Row;
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub language: Option<String>,
    pub framework: Option<String>,
    pub package_manager: Option<String>,
    /// Last-known hint for instant first paint. Live git state always wins.
    pub git_initialized: bool,
    pub git_remote: Option<String>,
    pub is_favorite: bool,
    pub open_count: i64,
    pub last_opened: Option<i64>,
    pub notes: Option<String>,
    pub default_ide_id: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
}

impl Project {
    pub const COLUMNS: &'static str = "id, name, path, language, framework, package_manager, \
         git_initialized, git_remote, is_favorite, open_count, last_opened, notes, \
         default_ide_id, created_at, updated_at";

    pub fn from_row(row: &Row<'_>) -> Result<Self, rusqlite::Error> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            language: row.get(3)?,
            framework: row.get(4)?,
            package_manager: row.get(5)?,
            git_initialized: row.get::<_, i64>(6)? != 0,
            git_remote: row.get(7)?,
            is_favorite: row.get::<_, i64>(8)? != 0,
            open_count: row.get(9)?,
            last_opened: row.get(10)?,
            notes: row.get(11)?,
            default_ide_id: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
            tags: Vec::new(),
        })
    }
}

/// Partial update. `None` means "leave alone"; the double option on `notes`
/// lets the UI clear a value explicitly.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub notes: Option<String>,
    pub is_favorite: Option<bool>,
    pub default_ide_id: Option<Option<i64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LauncherKind {
    Ide,
    Terminal,
}

impl LauncherKind {
    pub fn as_str(self) -> &'static str {
        match self {
            LauncherKind::Ide => "ide",
            LauncherKind::Terminal => "terminal",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Launcher {
    #[serde(default)]
    pub id: i64,
    pub kind: LauncherKind,
    pub name: String,
    /// macOS bundle identifier — the reliable, PATH-independent launch route.
    pub bundle_id: Option<String>,
    /// Absolute executable path. Relative names are rejected: a GUI app does
    /// not inherit the user's shell PATH.
    pub exec_path: Option<String>,
    /// JSON array of argument templates; `{path}` is substituted verbatim as a
    /// single argv element. Never shell-parsed.
    pub args: Option<String>,
    #[serde(default = "default_platform")]
    pub platform: String,
    #[serde(default)]
    pub detected: bool,
    #[serde(default = "yes")]
    pub enabled: bool,
}

fn default_platform() -> String {
    "macos".into()
}
fn yes() -> bool {
    true
}

impl Launcher {
    pub const COLUMNS: &'static str =
        "id, kind, name, bundle_id, exec_path, args, platform, detected, enabled";

    pub fn from_row(row: &Row<'_>) -> Result<Self, rusqlite::Error> {
        let kind: String = row.get(1)?;
        Ok(Self {
            id: row.get(0)?,
            kind: if kind == "terminal" { LauncherKind::Terminal } else { LauncherKind::Ide },
            name: row.get(2)?,
            bundle_id: row.get(3)?,
            exec_path: row.get(4)?,
            args: row.get(5)?,
            platform: row.get(6)?,
            detected: row.get::<_, i64>(7)? != 0,
            enabled: row.get::<_, i64>(8)? != 0,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRoot {
    #[serde(default)]
    pub id: i64,
    pub path: String,
    pub depth: i64,
    #[serde(default = "yes")]
    pub enabled: bool,
}
