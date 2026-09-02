pub mod catalog;

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::db::models::{Launcher, LauncherKind};
use crate::error::{AppError, Code, Result};
use catalog::{CATALOG, SHIM_DIRS};

/// Directories searched for installed applications, in priority order.
#[cfg(target_os = "macos")]
fn app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/Applications/Utilities"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("Applications"));
        // JetBrains Toolbox keeps its IDEs here.
        dirs.push(home.join("Applications/JetBrains Toolbox"));
    }
    dirs
}

#[cfg(not(target_os = "macos"))]
fn app_dirs() -> Vec<PathBuf> {
    Vec::new()
}

/// Reads the real bundle identifier out of an app bundle. Identifiers are never
/// hardcoded: vendors change them and their casing is not guessable.
#[cfg(target_os = "macos")]
fn bundle_id_of(app: &Path) -> Option<String> {
    let plist = plist::Value::from_file(app.join("Contents/Info.plist")).ok()?;
    plist.as_dictionary()?.get("CFBundleIdentifier")?.as_string().map(str::to_string)
}

#[cfg(not(target_os = "macos"))]
fn bundle_id_of(_app: &Path) -> Option<String> {
    None
}

fn find_shim(name: &str) -> Option<String> {
    SHIM_DIRS.iter().map(|d| Path::new(d).join(name)).find(|p| p.is_file()).map(|p| p.to_string_lossy().into_owned())
}

/// Scans the application directories once and returns everything recognised.
pub fn detect() -> Vec<Launcher> {
    // name (lowercased, no ".app") -> full bundle path
    let mut installed: std::collections::HashMap<String, PathBuf> = std::collections::HashMap::new();
    for dir in app_dirs() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            if let Some(stem) = name.strip_suffix(".app") {
                installed.entry(stem.to_ascii_lowercase()).or_insert(path);
            }
        }
    }

    let mut found = Vec::new();
    for known in CATALOG {
        let bundle = known
            .app_names
            .iter()
            .find_map(|n| installed.get(&n.to_ascii_lowercase()))
            .map(|p| p.as_path());
        let bundle_id = bundle.and_then(bundle_id_of);
        let exec_path = known.shim.and_then(find_shim);

        // An entry that ships as an application must have that application
        // present. Apple leaves stubs like /usr/bin/xed on every Mac, and
        // offering "Xcode" on a machine without Xcode is a promise we cannot
        // keep. Shim-only entries (a CLI editor) are judged on the shim alone.
        let installed_here =
            if known.app_names.is_empty() { exec_path.is_some() } else { bundle_id.is_some() };
        if !installed_here {
            continue;
        }
        found.push(Launcher {
            id: 0,
            kind: known.kind,
            name: known.name.to_string(),
            bundle_id,
            exec_path,
            args: (!known.shim_args.is_empty())
                .then(|| serde_json::to_string(known.shim_args).unwrap_or_default()),
            platform: std::env::consts::OS.to_string(),
            detected: true,
            enabled: true,
        });
    }
    found
}

/// Xcode wants the project or workspace, not the enclosing folder. Everything
/// else is happiest with the directory itself.
fn resolve_target(launcher: &Launcher, dir: &Path) -> PathBuf {
    let is_xcode = launcher.bundle_id.as_deref() == Some("com.apple.dt.Xcode")
        || launcher.name == "Xcode";
    if !is_xcode {
        return dir.to_path_buf();
    }
    let mut project = None;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            match path.extension().and_then(|e| e.to_str()) {
                Some("xcworkspace") => return path, // A workspace wins outright.
                Some("xcodeproj") => project = Some(path),
                _ => {}
            }
        }
    }
    project.unwrap_or_else(|| dir.to_path_buf())
}

fn missing(launcher: &Launcher) -> AppError {
    AppError::new(Code::LauncherMissing, format!("Could not open {}.", launcher.name))
        .hint(format!(
            "{} is configured, but Archboard could not find its application or command.",
            launcher.name
        ))
        .action("configure_launcher", launcher.id.to_string())
}

/// Launches `launcher` against `dir`.
///
/// Every argument is passed as a separate argv element. No shell is involved at
/// any point, so nothing in a project's path or metadata can become a command.
pub fn launch(launcher: &Launcher, dir: &Path) -> Result<()> {
    if !dir.is_dir() {
        return Err(AppError::new(
            Code::PathMissing,
            format!("{} is gone. It may have been moved or deleted.", dir.display()),
        ));
    }
    let target = resolve_target(launcher, dir);

    // Preferred route: LaunchServices by bundle identifier. Independent of
    // PATH, and it does not require Apple Events permission.
    #[cfg(target_os = "macos")]
    if let Some(bundle_id) = launcher.bundle_id.as_deref() {
        let status = Command::new("/usr/bin/open")
            .arg("-b")
            .arg(bundle_id)
            .arg(&target)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output();
        match status {
            Ok(out) if out.status.success() => return Ok(()),
            Ok(out) => {
                // Fall through to the shim, but keep the reason if that fails too.
                let detail = String::from_utf8_lossy(&out.stderr).trim().to_string();
                if launcher.exec_path.is_none() {
                    return Err(AppError::new(
                        Code::LauncherMissing,
                        format!("Could not open {}.", launcher.name),
                    )
                    .hint(if detail.is_empty() {
                        format!("macOS could not start {}. It may have been moved or uninstalled.", launcher.name)
                    } else {
                        detail
                    })
                    .action("configure_launcher", launcher.id.to_string()));
                }
            }
            Err(e) => {
                if launcher.exec_path.is_none() {
                    return Err(AppError::new(Code::Io, e.to_string()));
                }
            }
        }
    }

    let Some(exec) = launcher.exec_path.as_deref() else {
        return Err(missing(launcher));
    };
    let exec_path = Path::new(exec);
    if !exec_path.is_absolute() {
        return Err(AppError::new(
            Code::Invalid,
            format!("{} needs an absolute path to its executable.", launcher.name),
        )
        .hint("Applications launched by Archboard do not inherit your shell's PATH.")
        .action("configure_launcher", launcher.id.to_string()));
    }
    if !exec_path.is_file() {
        return Err(missing(launcher));
    }

    let template: Vec<String> = launcher
        .args
        .as_deref()
        .and_then(|a| serde_json::from_str(a).ok())
        .unwrap_or_else(|| vec!["{path}".to_string()]);
    let target = target.to_string_lossy().into_owned();
    let args: Vec<String> = template.iter().map(|a| a.replace("{path}", &target)).collect();

    Command::new(exec_path)
        .args(&args)
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            AppError::new(Code::LauncherMissing, format!("Could not open {}.", launcher.name))
                .hint(e.to_string())
                .action("configure_launcher", launcher.id.to_string())
        })?;
    Ok(())
}

/// Chooses which launcher to use: the explicit one, else the project's own
/// default, else the global default, else the first enabled one of that kind.
pub fn resolve(
    conn: &rusqlite::Connection,
    kind: LauncherKind,
    explicit: Option<i64>,
    project_default: Option<i64>,
) -> Result<Launcher> {
    let setting_key = match kind {
        LauncherKind::Ide => "default_ide_id",
        LauncherKind::Terminal => "default_terminal_id",
    };
    let global = crate::db::get_setting(conn, setting_key)?.and_then(|v| v.parse::<i64>().ok());

    for candidate in [explicit, project_default, global].into_iter().flatten() {
        if let Ok(l) = crate::db::get_launcher(conn, candidate) {
            if l.enabled {
                return Ok(l);
            }
        }
    }

    crate::db::list_launchers(conn, Some(kind))?
        .into_iter()
        .find(|l| l.enabled)
        .ok_or_else(|| {
            let (what, where_) = match kind {
                LauncherKind::Ide => ("editor", "Settings \u{203a} Editors"),
                LauncherKind::Terminal => ("terminal", "Settings \u{203a} Terminals"),
            };
            AppError::new(Code::LauncherMissing, format!("No {what} is set up yet."))
                .hint(format!("Add one in {where_}."))
                .action("open_settings", match kind {
                    LauncherKind::Ide => "ides",
                    LauncherKind::Terminal => "terminals",
                })
        })
}
