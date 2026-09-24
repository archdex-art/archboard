use crate::db::models::LauncherKind;

/// A launchable application we know how to recognise.
///
/// Recognition differs by platform because the platforms disagree about what
/// an installed application *is*:
///
/// - macOS ships a bundle, so we match `.app` directory names and read the
///   real identifier out of `Info.plist`.
/// - Windows ships an executable in a per-user or machine-wide program
///   directory, so we match executable names.
/// - Linux ships a binary on `PATH`, usually with a `.desktop` entry beside
///   it, so the command name is the reliable handle.
///
/// An entry only has to describe the platforms it exists on. Xcode has no
/// Windows executable; Windows Terminal has no `.app` bundle.
pub struct Known {
    pub name: &'static str,
    pub kind: LauncherKind,
    /// macOS `.app` bundle names, without the extension.
    pub app_names: &'static [&'static str],
    /// Windows executable names, without `.exe`. Matched under the program
    /// directories and on `PATH`.
    pub exe_names: &'static [&'static str],
    /// Command-line name, resolved to an absolute path if present. This is the
    /// primary handle on Linux and a fallback everywhere else.
    pub shim: Option<&'static str>,
    /// Argument template for shim launches. `{path}` becomes one argv element.
    pub shim_args: &'static [&'static str],
}

const OPEN_PATH: &[&str] = &["{path}"];
const NONE: &[&str] = &[];

pub const CATALOG: &[Known] = &[
    // ------------------------------------------------------------- editors
    Known { name: "Visual Studio Code", kind: LauncherKind::Ide, app_names: &["Visual Studio Code"], exe_names: &["Code"], shim: Some("code"), shim_args: OPEN_PATH },
    Known { name: "VS Code Insiders", kind: LauncherKind::Ide, app_names: &["Visual Studio Code - Insiders"], exe_names: &["Code - Insiders"], shim: Some("code-insiders"), shim_args: OPEN_PATH },
    Known { name: "VSCodium", kind: LauncherKind::Ide, app_names: &["VSCodium"], exe_names: &["VSCodium"], shim: Some("codium"), shim_args: OPEN_PATH },
    Known { name: "Cursor", kind: LauncherKind::Ide, app_names: &["Cursor"], exe_names: &["Cursor"], shim: Some("cursor"), shim_args: OPEN_PATH },
    Known { name: "Windsurf", kind: LauncherKind::Ide, app_names: &["Windsurf", "Devin"], exe_names: &["Windsurf"], shim: Some("windsurf"), shim_args: OPEN_PATH },
    // Google ships two bundles. Only "Antigravity IDE" is the editor: it is
    // the Electron one, it declares 65 document types, and it carries a
    // `bin/antigravity-ide` shim. Plain "Antigravity.app" is the agent
    // surface, declares no document types, and must not be offered as a place
    // to open a folder.
    Known { name: "Antigravity", kind: LauncherKind::Ide, app_names: &["Antigravity IDE"], exe_names: &["Antigravity"], shim: Some("antigravity-ide"), shim_args: OPEN_PATH },
    Known { name: "Zed", kind: LauncherKind::Ide, app_names: &["Zed", "Zed Preview"], exe_names: &["Zed"], shim: Some("zed"), shim_args: OPEN_PATH },
    Known { name: "Sublime Text", kind: LauncherKind::Ide, app_names: &["Sublime Text"], exe_names: &["sublime_text"], shim: Some("subl"), shim_args: OPEN_PATH },
    Known { name: "Nova", kind: LauncherKind::Ide, app_names: &["Nova"], exe_names: NONE, shim: Some("nova"), shim_args: OPEN_PATH },
    Known { name: "Neovim", kind: LauncherKind::Ide, app_names: NONE, exe_names: &["nvim"], shim: Some("nvim"), shim_args: OPEN_PATH },
    Known { name: "Helix", kind: LauncherKind::Ide, app_names: NONE, exe_names: &["hx"], shim: Some("hx"), shim_args: OPEN_PATH },
    Known { name: "Emacs", kind: LauncherKind::Ide, app_names: &["Emacs"], exe_names: &["emacs"], shim: Some("emacs"), shim_args: OPEN_PATH },
    Known { name: "Gnome Text Editor", kind: LauncherKind::Ide, app_names: NONE, exe_names: NONE, shim: Some("gnome-text-editor"), shim_args: OPEN_PATH },
    Known { name: "Kate", kind: LauncherKind::Ide, app_names: NONE, exe_names: NONE, shim: Some("kate"), shim_args: OPEN_PATH },
    // -------------------------------------------------------- JetBrains IDEs
    Known { name: "IntelliJ IDEA", kind: LauncherKind::Ide, app_names: &["IntelliJ IDEA", "IntelliJ IDEA Ultimate", "IntelliJ IDEA Community Edition"], exe_names: &["idea64"], shim: Some("idea"), shim_args: OPEN_PATH },
    Known { name: "PyCharm", kind: LauncherKind::Ide, app_names: &["PyCharm", "PyCharm Professional", "PyCharm Community Edition"], exe_names: &["pycharm64"], shim: Some("pycharm"), shim_args: OPEN_PATH },
    Known { name: "WebStorm", kind: LauncherKind::Ide, app_names: &["WebStorm"], exe_names: &["webstorm64"], shim: Some("webstorm"), shim_args: OPEN_PATH },
    Known { name: "GoLand", kind: LauncherKind::Ide, app_names: &["GoLand"], exe_names: &["goland64"], shim: Some("goland"), shim_args: OPEN_PATH },
    Known { name: "RustRover", kind: LauncherKind::Ide, app_names: &["RustRover"], exe_names: &["rustrover64"], shim: Some("rustrover"), shim_args: OPEN_PATH },
    Known { name: "CLion", kind: LauncherKind::Ide, app_names: &["CLion"], exe_names: &["clion64"], shim: Some("clion"), shim_args: OPEN_PATH },
    Known { name: "Rider", kind: LauncherKind::Ide, app_names: &["Rider"], exe_names: &["rider64"], shim: Some("rider"), shim_args: OPEN_PATH },
    Known { name: "PhpStorm", kind: LauncherKind::Ide, app_names: &["PhpStorm"], exe_names: &["phpstorm64"], shim: Some("phpstorm"), shim_args: OPEN_PATH },
    Known { name: "RubyMine", kind: LauncherKind::Ide, app_names: &["RubyMine"], exe_names: &["rubymine64"], shim: Some("rubymine"), shim_args: OPEN_PATH },
    Known { name: "Android Studio", kind: LauncherKind::Ide, app_names: &["Android Studio"], exe_names: &["studio64"], shim: Some("studio"), shim_args: OPEN_PATH },
    Known { name: "Visual Studio", kind: LauncherKind::Ide, app_names: NONE, exe_names: &["devenv"], shim: None, shim_args: OPEN_PATH },
    Known { name: "Xcode", kind: LauncherKind::Ide, app_names: &["Xcode"], exe_names: NONE, shim: Some("xed"), shim_args: OPEN_PATH },
    // ----------------------------------------------------------- terminals
    Known { name: "Terminal", kind: LauncherKind::Terminal, app_names: &["Terminal"], exe_names: NONE, shim: None, shim_args: NONE },
    Known { name: "iTerm", kind: LauncherKind::Terminal, app_names: &["iTerm", "iTerm2"], exe_names: NONE, shim: None, shim_args: NONE },
    Known { name: "Warp", kind: LauncherKind::Terminal, app_names: &["Warp"], exe_names: &["warp"], shim: None, shim_args: NONE },
    // Windows Terminal takes the working directory itself and then the command
    // to run, so the script is appended by the runner rather than templated.
    Known { name: "Windows Terminal", kind: LauncherKind::Terminal, app_names: NONE, exe_names: &["wt"], shim: Some("wt"), shim_args: &["-d", "{path}"] },
    Known { name: "PowerShell", kind: LauncherKind::Terminal, app_names: NONE, exe_names: &["pwsh", "powershell"], shim: Some("pwsh"), shim_args: &["-WorkingDirectory", "{path}"] },
    Known { name: "Command Prompt", kind: LauncherKind::Terminal, app_names: NONE, exe_names: &["cmd"], shim: Some("cmd"), shim_args: &["/K", "cd /d {path}"] },
    Known { name: "Ghostty", kind: LauncherKind::Terminal, app_names: &["Ghostty"], exe_names: NONE, shim: Some("ghostty"), shim_args: &["--working-directory={path}"] },
    Known { name: "WezTerm", kind: LauncherKind::Terminal, app_names: &["WezTerm"], exe_names: &["wezterm-gui"], shim: Some("wezterm"), shim_args: &["start", "--cwd", "{path}"] },
    Known { name: "kitty", kind: LauncherKind::Terminal, app_names: &["kitty"], exe_names: NONE, shim: Some("kitty"), shim_args: &["--directory", "{path}"] },
    Known { name: "Alacritty", kind: LauncherKind::Terminal, app_names: &["Alacritty"], exe_names: &["alacritty"], shim: Some("alacritty"), shim_args: &["--working-directory", "{path}"] },
    Known { name: "Hyper", kind: LauncherKind::Terminal, app_names: &["Hyper"], exe_names: &["Hyper"], shim: Some("hyper"), shim_args: OPEN_PATH },
    Known { name: "GNOME Terminal", kind: LauncherKind::Terminal, app_names: NONE, exe_names: NONE, shim: Some("gnome-terminal"), shim_args: &["--working-directory={path}"] },
    Known { name: "Konsole", kind: LauncherKind::Terminal, app_names: NONE, exe_names: NONE, shim: Some("konsole"), shim_args: &["--workdir", "{path}"] },
    Known { name: "Xfce Terminal", kind: LauncherKind::Terminal, app_names: NONE, exe_names: NONE, shim: Some("xfce4-terminal"), shim_args: &["--working-directory={path}"] },
    Known { name: "Tilix", kind: LauncherKind::Terminal, app_names: NONE, exe_names: NONE, shim: Some("tilix"), shim_args: &["--working-directory={path}"] },
    Known { name: "xterm", kind: LauncherKind::Terminal, app_names: NONE, exe_names: NONE, shim: Some("xterm"), shim_args: NONE },
];

/// Directories probed for command-line entry points.
///
/// A GUI process does not inherit the user's interactive shell `PATH`, so this
/// list is explicit rather than environmental. `PATH` is still consulted in
/// addition, because package managers and distributions disagree about where
/// binaries belong.
#[cfg(target_os = "macos")]
pub const SHIM_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/local/bin",
];

#[cfg(target_os = "linux")]
pub const SHIM_DIRS: &[&str] = &[
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/local/sbin",
    // Snap and Flatpak export their applications as wrappers here.
    "/snap/bin",
    "/var/lib/flatpak/exports/bin",
];

/// On Windows the program directories are resolved from the environment at
/// runtime, since they are localised and vary by installation drive.
#[cfg(target_os = "windows")]
pub const SHIM_DIRS: &[&str] = &[];

/// Executable suffixes tried when resolving a command name.
#[cfg(target_os = "windows")]
pub const EXE_SUFFIXES: &[&str] = &[".exe", ".cmd", ".bat"];

#[cfg(not(target_os = "windows"))]
pub const EXE_SUFFIXES: &[&str] = &[""];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_two_entries_claim_the_same_bundle_name() {
        // Detection matches on the bundle name, so a duplicate would make
        // which launcher wins depend on catalog order.
        let mut seen = std::collections::HashSet::new();
        for entry in CATALOG {
            for name in entry.app_names {
                assert!(seen.insert(*name), "{name} is claimed by more than one entry");
            }
        }
    }

    #[test]
    fn no_two_entries_claim_the_same_executable() {
        let mut seen = std::collections::HashSet::new();
        for entry in CATALOG {
            for name in entry.exe_names {
                assert!(seen.insert(*name), "{name} is claimed by more than one entry");
            }
        }
    }

    #[test]
    fn only_the_antigravity_editor_is_offered_as_an_editor() {
        // Google ships "Antigravity IDE.app", the editor, and "Antigravity.app",
        // the agent surface. Both are in /Applications on a machine with the
        // product installed, and only the first can open a folder. Adding the
        // bare name here would put a non-editor in the Open With menu.
        let claimed: Vec<&str> =
            CATALOG.iter().flat_map(|k| k.app_names.iter().copied()).collect();
        assert!(claimed.contains(&"Antigravity IDE"));
        assert!(
            !claimed.contains(&"Antigravity"),
            "Antigravity.app is the agent surface, not an editor"
        );
    }

    #[test]
    fn every_entry_can_be_launched_somehow() {
        // A row with no bundle, no executable and no command could be listed
        // but never opened.
        for entry in CATALOG {
            assert!(
                !entry.app_names.is_empty() || !entry.exe_names.is_empty() || entry.shim.is_some(),
                "{} has no way to launch",
                entry.name
            );
        }
    }

    #[test]
    fn editors_receive_the_project_path() {
        // A terminal may take the directory through a flag of its own, but an
        // editor is handed the folder to open and must have somewhere to put
        // it.
        for entry in CATALOG {
            if entry.kind != LauncherKind::Ide || entry.shim.is_none() {
                continue;
            }
            let uses = entry.shim_args.iter().filter(|a| a.contains("{path}")).count();
            assert_eq!(uses, 1, "{} must use {{path}} exactly once", entry.name);
        }
    }

    #[test]
    fn terminal_templates_mention_the_directory_at_most_once() {
        for entry in CATALOG {
            if entry.kind != LauncherKind::Terminal {
                continue;
            }
            let uses = entry.shim_args.iter().filter(|a| a.contains("{path}")).count();
            assert!(uses <= 1, "{} repeats {{path}}", entry.name);
        }
    }

    #[test]
    fn every_platform_has_at_least_one_terminal_and_one_editor() {
        // A platform with no way to open a terminal has no product.
        type Probe = fn(&Known) -> bool;
        let platforms: [(&str, Probe); 3] = [
            ("macOS", |k| !k.app_names.is_empty()),
            ("Windows", |k| !k.exe_names.is_empty()),
            ("Linux", |k| k.shim.is_some()),
        ];
        for (label, has) in platforms {
            assert!(
                CATALOG.iter().any(|k| k.kind == LauncherKind::Ide && has(k)),
                "{label} has no editor"
            );
            assert!(
                CATALOG.iter().any(|k| k.kind == LauncherKind::Terminal && has(k)),
                "{label} has no terminal"
            );
        }
    }
}
