//! Showing, hiding and toggling the main window.
//!
//! Once an app lives in the menu bar, "closed" has to mean hidden rather than
//! quit, and the global hotkey has to be able to pull the window in front of
//! whatever the user was doing.

use tauri::{AppHandle, Manager, WebviewWindow};

pub const MAIN: &str = "main";

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

/// Brings the window forward *and* takes keyboard focus.
///
/// On macOS a background application calling `set_focus` alone raises the
/// window without stealing focus, so the app itself has to be activated first
/// — `AppHandle::show` maps to `activateIgnoringOtherApps:`.
pub fn present(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = main_window(app) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        let _ = window.hide();
    }
}

/// Hotkey and tray-click behaviour: visible and focused means dismiss,
/// anything else means bring it to the front.
pub fn toggle(app: &AppHandle) {
    let showing = main_window(app)
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false);

    if showing {
        hide(app);
    } else {
        present(app);
    }
}

/// Removes or restores the Dock icon. Switching is applied immediately by
/// AppKit; no restart is needed.
#[cfg(target_os = "macos")]
pub fn set_dock_visible(app: &AppHandle, visible: bool) {
    let policy = if visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    };
    let _ = app.set_activation_policy(policy);
}

#[cfg(not(target_os = "macos"))]
pub fn set_dock_visible(_app: &AppHandle, _visible: bool) {}
