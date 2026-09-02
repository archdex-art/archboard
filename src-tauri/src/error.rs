use serde::Serialize;

/// Machine-readable failure kind. The UI switches on this to decide which
/// recovery affordance to render, so every variant must map to something a
/// person can actually do.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Code {
    NotFound,
    PathMissing,
    AlreadyExists,
    NoRemote,
    LauncherMissing,
    GitFailed,
    Db,
    Io,
    Invalid,
}

/// Errors always carry a human sentence plus, where one exists, a concrete
/// next step. `action` names a UI affordance (e.g. `configure_launcher`).
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: Code,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_arg: Option<String>,
}

impl AppError {
    pub fn new(code: Code, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), hint: None, action: None, action_arg: None }
    }

    pub fn hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    pub fn action(mut self, action: &str, arg: impl Into<String>) -> Self {
        self.action = Some(action.to_string());
        self.action_arg = Some(arg.into());
        self
    }

    pub fn not_found(what: impl std::fmt::Display) -> Self {
        Self::new(Code::NotFound, format!("{what} no longer exists in Archboard."))
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::new(Code::NotFound, "That record no longer exists."),
            rusqlite::Error::SqliteFailure(f, _) if f.extended_code == 2067 || f.extended_code == 1555 => {
                AppError::new(Code::AlreadyExists, "That entry already exists.")
            }
            other => AppError::new(Code::Db, format!("Database error: {other}")),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::new(Code::Io, e.to_string())
    }
}

pub type Result<T, E = AppError> = std::result::Result<T, E>;
