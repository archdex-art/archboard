//! Menu-bar presence.
//!
//! Left click toggles the window; right click opens a small menu. The icon is
//! a template image, so macOS tints it for light and dark menu bars instead of
//! us shipping two assets.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, Emitter};

use crate::window;

pub fn build(app: &App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show Archboard", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit Archboard"))?;
    let menu = Menu::with_items(
        app,
        &[&toggle, &PredefinedMenuItem::separator(app)?, &settings, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        // A template image is a mask: macOS supplies the colour.
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("Archboard")
        // Without this the left click only opens the menu, and there is no
        // way to reach the window in one click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => window::present(app),
            "settings" => {
                window::present(app);
                let _ = app.emit("open-settings", "general");
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
