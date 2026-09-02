mod commands;
mod db;
mod detect;
mod error;
mod git;
mod launcher;
mod scan;

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
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let db = Db::open(&dir.join("archboard.db"))?;
            app.manage(db);

            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
                window.set_focus()?;
            }
            Ok(())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running archboard");
}
