use crate::db::models::LauncherKind;

/// A launchable application we know how to recognise.
///
/// Apps are matched by the name of the `.app` bundle on disk; the bundle
/// identifier is then read from that bundle's `Info.plist` rather than
/// hardcoded, because identifiers vary in casing and vendors change them.
pub struct Known {
    pub name: &'static str,
    pub kind: LauncherKind,
    /// `.app` bundle names to look for, without the extension.
    pub app_names: &'static [&'static str],
    /// Command-line shim, resolved to an absolute path if present.
    pub shim: Option<&'static str>,
    /// Argument template for shim launches. `{path}` becomes one argv element.
    pub shim_args: &'static [&'static str],
}

const OPEN_PATH: &[&str] = &["{path}"];

pub const CATALOG: &[Known] = &[
    // ------------------------------------------------------------- editors
    Known { name: "Visual Studio Code", kind: LauncherKind::Ide, app_names: &["Visual Studio Code"], shim: Some("code"), shim_args: OPEN_PATH },
    Known { name: "VS Code Insiders", kind: LauncherKind::Ide, app_names: &["Visual Studio Code - Insiders"], shim: Some("code-insiders"), shim_args: OPEN_PATH },
    Known { name: "Cursor", kind: LauncherKind::Ide, app_names: &["Cursor"], shim: Some("cursor"), shim_args: OPEN_PATH },
    Known { name: "Windsurf", kind: LauncherKind::Ide, app_names: &["Windsurf", "Devin"], shim: Some("windsurf"), shim_args: OPEN_PATH },
    // Google ships two bundles. Only "Antigravity IDE" is the editor: it is
    // the Electron one, it declares 65 document types, and it carries a
    // `bin/antigravity-ide` shim. Plain "Antigravity.app" is the agent
    // surface, declares no document types, and must not be offered as a place
    // to open a folder.
    Known { name: "Antigravity", kind: LauncherKind::Ide, app_names: &["Antigravity IDE"], shim: Some("antigravity-ide"), shim_args: OPEN_PATH },
    Known { name: "Zed", kind: LauncherKind::Ide, app_names: &["Zed", "Zed Preview"], shim: Some("zed"), shim_args: OPEN_PATH },
    Known { name: "Sublime Text", kind: LauncherKind::Ide, app_names: &["Sublime Text"], shim: Some("subl"), shim_args: OPEN_PATH },
    Known { name: "Nova", kind: LauncherKind::Ide, app_names: &["Nova"], shim: Some("nova"), shim_args: OPEN_PATH },
    Known { name: "Neovim", kind: LauncherKind::Ide, app_names: &[], shim: Some("nvim"), shim_args: OPEN_PATH },
    // -------------------------------------------------------- JetBrains IDEs
    Known { name: "IntelliJ IDEA", kind: LauncherKind::Ide, app_names: &["IntelliJ IDEA", "IntelliJ IDEA Ultimate", "IntelliJ IDEA Community Edition"], shim: Some("idea"), shim_args: OPEN_PATH },
    Known { name: "PyCharm", kind: LauncherKind::Ide, app_names: &["PyCharm", "PyCharm Professional", "PyCharm Community Edition"], shim: Some("pycharm"), shim_args: OPEN_PATH },
    Known { name: "WebStorm", kind: LauncherKind::Ide, app_names: &["WebStorm"], shim: Some("webstorm"), shim_args: OPEN_PATH },
    Known { name: "GoLand", kind: LauncherKind::Ide, app_names: &["GoLand"], shim: Some("goland"), shim_args: OPEN_PATH },
    Known { name: "RustRover", kind: LauncherKind::Ide, app_names: &["RustRover"], shim: Some("rustrover"), shim_args: OPEN_PATH },
    Known { name: "CLion", kind: LauncherKind::Ide, app_names: &["CLion"], shim: Some("clion"), shim_args: OPEN_PATH },
    Known { name: "Rider", kind: LauncherKind::Ide, app_names: &["Rider"], shim: Some("rider"), shim_args: OPEN_PATH },
    Known { name: "PhpStorm", kind: LauncherKind::Ide, app_names: &["PhpStorm"], shim: Some("phpstorm"), shim_args: OPEN_PATH },
    Known { name: "RubyMine", kind: LauncherKind::Ide, app_names: &["RubyMine"], shim: Some("rubymine"), shim_args: OPEN_PATH },
    Known { name: "Android Studio", kind: LauncherKind::Ide, app_names: &["Android Studio"], shim: Some("studio"), shim_args: OPEN_PATH },
    Known { name: "Xcode", kind: LauncherKind::Ide, app_names: &["Xcode"], shim: Some("xed"), shim_args: OPEN_PATH },
    // ----------------------------------------------------------- terminals
    Known { name: "Terminal", kind: LauncherKind::Terminal, app_names: &["Terminal"], shim: None, shim_args: &[] },
    Known { name: "iTerm", kind: LauncherKind::Terminal, app_names: &["iTerm", "iTerm2"], shim: None, shim_args: &[] },
    Known { name: "Warp", kind: LauncherKind::Terminal, app_names: &["Warp"], shim: None, shim_args: &[] },
    Known { name: "Ghostty", kind: LauncherKind::Terminal, app_names: &["Ghostty"], shim: Some("ghostty"), shim_args: &["--working-directory={path}"] },
    Known { name: "WezTerm", kind: LauncherKind::Terminal, app_names: &["WezTerm"], shim: Some("wezterm"), shim_args: &["start", "--cwd", "{path}"] },
    Known { name: "kitty", kind: LauncherKind::Terminal, app_names: &["kitty"], shim: Some("kitty"), shim_args: &["--directory", "{path}"] },
    Known { name: "Alacritty", kind: LauncherKind::Terminal, app_names: &["Alacritty"], shim: Some("alacritty"), shim_args: &["--working-directory", "{path}"] },
    Known { name: "Hyper", kind: LauncherKind::Terminal, app_names: &["Hyper"], shim: Some("hyper"), shim_args: OPEN_PATH },
];

/// Directories probed for CLI shims. A GUI process does not inherit the user's
/// interactive shell PATH, so this list is explicit rather than environmental.
pub const SHIM_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/local/bin",
];

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
        // A row with neither a bundle to find nor a shim to run could be
        // detected but never opened.
        for entry in CATALOG {
            assert!(
                !entry.app_names.is_empty() || entry.shim.is_some(),
                "{} has no way to launch",
                entry.name
            );
        }
    }

    #[test]
    fn shim_arguments_place_the_path_exactly_once() {
        for entry in CATALOG {
            if entry.shim.is_none() {
                continue;
            }
            let uses = entry.shim_args.iter().filter(|a| a.contains("{path}")).count();
            assert_eq!(uses, 1, "{} must use {{path}} exactly once", entry.name);
        }
    }
}
