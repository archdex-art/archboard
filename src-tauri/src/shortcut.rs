//! The global hotkey.
//!
//! Registration goes through Carbon's `RegisterEventHotKey`, which needs no
//! Accessibility permission and delivers while the app is in the background.
//! (Only *media* keys take the CoreGraphics event-tap path that would prompt,
//! which is why media keys are rejected below.)

use std::str::FromStr;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::error::{AppError, Code, Result};
use crate::window;

/// The accelerator currently registered, so it can be released on change.
#[derive(Default)]
pub struct Registered(pub Mutex<Option<Shortcut>>);

pub const SETTING_KEY: &str = "global_shortcut";
pub const SETTING_ENABLED: &str = "global_shortcut_enabled";
/// Avoids Spotlight (`Cmd+Space`), Raycast and Alfred (`Alt+Space`), and does
/// not hijack the in-app `Cmd+K` that every other editor also uses.
pub const DEFAULT_ACCELERATOR: &str = "Alt+K";

fn parse(accelerator: &str) -> Result<Shortcut> {
    // A media key would silently switch the backend to a CoreGraphics event
    // tap, which *does* require Accessibility. Refuse rather than surprise.
    let lowered = accelerator.to_ascii_lowercase();
    if ["media", "audio", "play", "track", "volume"].iter().any(|k| lowered.contains(k)) {
        return Err(AppError::new(Code::Invalid, "Media keys cannot be used as a shortcut.")
            .hint("macOS would ask for Accessibility access. Pick an ordinary key combination."));
    }

    Shortcut::from_str(accelerator).map_err(|_| {
        AppError::new(Code::Invalid, format!("{accelerator} is not a valid shortcut."))
            .hint("Hold one or more modifiers and press a key.")
    })
}

/// Releases whatever is registered. Safe to call when nothing is.
pub fn clear(app: &AppHandle) {
    let state = app.state::<Registered>();
    let mut current = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(previous) = current.take() {
        let _ = app.global_shortcut().unregister(previous);
    }
}

/// Registers `accelerator`, replacing any previous binding.
///
/// A combination already owned by the system or another app fails here rather
/// than silently doing nothing, so the UI can say so.
pub fn apply(app: &AppHandle, accelerator: &str) -> Result<()> {
    let shortcut = parse(accelerator)?;
    clear(app);

    let handle = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            // Both press and release are delivered; acting on both would
            // toggle the window twice per keystroke.
            if event.state == ShortcutState::Pressed {
                window::toggle(&handle);
            }
        })
        .map_err(|e| {
            AppError::new(Code::Invalid, format!("{accelerator} is already in use."))
                .hint(format!("Another application holds this combination. ({e})"))
        })?;

    let state = app.state::<Registered>();
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(shortcut);
    Ok(())
}

/// Restores the saved binding at startup. A failure here is reported to the
/// frontend on demand rather than blocking launch.
pub fn restore(app: &AppHandle) -> Result<()> {
    let (enabled, accelerator) = {
        let db = app.state::<crate::db::Db>();
        let conn = db.conn();
        let enabled = crate::db::get_setting(&conn, SETTING_ENABLED)?
            .map(|v| v == "true")
            .unwrap_or(true);
        let accelerator = crate::db::get_setting(&conn, SETTING_KEY)?
            .unwrap_or_else(|| DEFAULT_ACCELERATOR.to_string());
        (enabled, accelerator)
    };

    if enabled {
        apply(app, &accelerator)?;
    }
    Ok(())
}
