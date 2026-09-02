mod commands;
mod db;
mod detect;
mod error;
mod git;
mod launcher;
mod runner;
mod scan;
mod shortcut;
mod tray;
mod window;

use tauri::Manager;

use db::Db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            // Remembers size and position across launches. The window is
            // created hidden so it never flashes at the default geometry, and
            // we show it ourselves below once the state has been restored.
            //
            // VISIBLE is deliberately excluded: the plugin would otherwise
            // persist "hidden" and, if the app ever died before the window was
            // shown, restore it hidden forever with no way back.
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(shortcut::Registered::default())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let db = Db::open(&dir.join("archboard.db"))?;
            app.manage(db);

            let handle = app.handle();
            tray::build(app)?;

            // A saved binding that has since been taken by another app must
            // not stop the application from starting.
            if let Err(e) = shortcut::restore(handle) {
                eprintln!("archboard: global shortcut not restored: {e}");
            }

            let dock = {
                let db = handle.state::<Db>();
                let conn = db.conn();
                db::get_setting(&conn, "show_dock_icon")?.map(|v| v == "true").unwrap_or(true)
            };
            window::set_dock_visible(handle, dock);

            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
                window.set_focus()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // With a menu-bar icon and a global hotkey, the red button should
            // put the window away rather than end the session. Quit stays
            // available from the tray menu and the app menu.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_project,
            commands::project_detail,
            commands::add_project,
            commands::add_projects,
            commands::remove_project,
            commands::update_project,
            commands::set_favorite,
            commands::touch_project,
            commands::redetect_project,
            commands::git_status,
            commands::git_status_batch,
            commands::git_init,
            commands::git_recent_commits,
            commands::git_branches,
            commands::detect_launchers,
            commands::list_launchers,
            commands::upsert_launcher,
            commands::delete_launcher,
            commands::open_in_ide,
            commands::open_terminal,
            commands::open_folder,
            commands::open_remote,
            commands::list_tags,
            commands::create_tag,
            commands::rename_tag,
            commands::delete_tag,
            commands::set_project_tags,
            commands::list_scan_roots,
            commands::add_scan_root,
            commands::update_scan_root,
            commands::remove_scan_root,
            commands::scan_roots,
            commands::get_settings,
            commands::set_setting,
            commands::set_global_shortcut,
            commands::hide_window,
            commands::set_dock_visible,
            commands::list_commands,
            commands::upsert_command,
            commands::delete_command,
            commands::run_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running archboard");
}
