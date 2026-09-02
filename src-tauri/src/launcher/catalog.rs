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
