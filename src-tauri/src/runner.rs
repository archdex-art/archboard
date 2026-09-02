//! Saved per-project commands.
//!
//! Archboard hands a command to the user's terminal and forgets about it. It
//! does not own the process, capture output, or offer to stop it — that is
//! what the terminal is for, and a launcher that grows a process manager
//! becomes a worse version of the tool it is launching.
//!
//! Commands are authored by the user and stored as typed. Nothing is ever
//! derived from a project's own files: reading `package.json` to discover
//! scripts would mean a repository could choose what runs on this machine.

use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::db::models::Launcher;
use crate::error::{AppError, Code, Result};

/// How long to wait for the terminal to prove it actually ran the script.
const PROOF_TIMEOUT: Duration = Duration::from_millis(2500);

/// Writes the throwaway script that the terminal will execute.
///
/// The script marks itself as started, so we can tell the difference between a
/// terminal that ran it and one that merely opened. It then hands the session
/// to an interactive shell in the project directory, leaving the user
/// somewhere useful rather than closing the window.
fn write_script(dir: &Path, command: &str, marker: &Path) -> Result<PathBuf> {
    let mut path = std::env::temp_dir();
    path.push(format!("archboard-run-{}.command", std::process::id()));

    let script = format!(
        "#!/bin/sh\n\
         : > {marker}\n\
         cd {dir} || exit 1\n\
         clear\n\
         {command}\n\
         exec \"${{SHELL:-/bin/sh}}\" -l\n",
        marker = shell_quote(&marker.to_string_lossy()),
        dir = shell_quote(&dir.to_string_lossy()),
        command = command,
    );

    let mut file = std::fs::File::create(&path)?;
    file.write_all(script.as_bytes())?;
    // Readable and executable by this user only: it is about to be run.
    file.set_permissions(std::fs::Permissions::from_mode(0o700))?;
    Ok(path)
}

/// Single-quotes a value for `sh`. Only the path is quoted — the command is
/// the user's own text and is passed through verbatim, exactly as if they had
/// typed it at their prompt.
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// Runs `command` inside `dir` using `terminal`.
pub fn run(terminal: &Launcher, dir: &Path, command: &str) -> Result<()> {
    if command.trim().is_empty() {
        return Err(AppError::new(Code::Invalid, "That command is empty."));
    }
    if !dir.is_dir() {
        return Err(AppError::new(
            Code::PathMissing,
            format!("{} is gone. It may have been moved or deleted.", dir.display()),
        ));
    }

    let marker = std::env::temp_dir().join(format!("archboard-ran-{}", std::process::id()));
    std::fs::remove_file(&marker).ok();
    let script = write_script(dir, command, &marker)?;

    // A terminal with a command-line interface can be told to run the script
    // directly, which is unambiguous.
    if let Some(exec) = terminal.exec_path.as_deref() {
        if Path::new(exec).is_file() {
            let template: Vec<String> = terminal
                .args
                .as_deref()
                .and_then(|a| serde_json::from_str::<Vec<String>>(a).ok())
                .unwrap_or_default();
            // Reuse the launcher's own argument shape, swapping the directory
            // template for the script we want executed.
            let mut args: Vec<String> = template
                .iter()
                .map(|a| a.replace("{path}", &dir.to_string_lossy()))
                .collect();
            args.push("-e".into());
            args.push(script.to_string_lossy().into_owned());

            Command::new(exec)
                .args(&args)
                .current_dir(dir)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| AppError::new(Code::LauncherMissing, e.to_string()))?;
            return Ok(());
        }
    }

    // Otherwise hand the script to the terminal application. Terminal.app
    // executes `.command` files; some terminals only open them.
    let bundle_id = terminal.bundle_id.as_deref().ok_or_else(|| {
        AppError::new(Code::LauncherMissing, format!("{} cannot run commands.", terminal.name))
            .action("open_settings", "terminals")
    })?;

    Command::new("/usr/bin/open")
        .arg("-b")
        .arg(bundle_id)
        .arg(&script)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| AppError::new(Code::Io, e.to_string()))?;

    // `open` reports success as long as the application launched, even when it
    // ignored the file, so wait for the script's own evidence instead.
    let deadline = Instant::now() + PROOF_TIMEOUT;
    while Instant::now() < deadline {
        if marker.exists() {
            std::fs::remove_file(&marker).ok();
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(60));
    }

    Err(
        AppError::new(Code::LauncherMissing, format!("{} did not run the command.", terminal.name))
            .hint(format!(
                "{} opens folders but will not execute a script. Choose Terminal, or a terminal \
                 with a command-line tool, for saved commands.",
                terminal.name
            ))
            .action("open_settings", "terminals"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_paths_so_a_space_or_quote_cannot_break_out() {
        assert_eq!(shell_quote("/tmp/plain"), "'/tmp/plain'");
        assert_eq!(shell_quote("/tmp/with space"), "'/tmp/with space'");
        // The classic escape: a single quote must not end the quoting.
        assert_eq!(shell_quote("/tmp/it's"), r"'/tmp/it'\''s'");
        assert_eq!(shell_quote("/tmp/$(whoami)"), "'/tmp/$(whoami)'");
    }

    #[test]
    fn the_script_cds_before_running_and_survives_afterwards() {
        let dir = std::env::temp_dir();
        let marker = dir.join("archboard-test-marker");
        let path = write_script(&dir, "echo hello", &marker).unwrap();
        let body = std::fs::read_to_string(&path).unwrap();

        assert!(body.starts_with("#!/bin/sh\n"));
        assert!(body.contains(&format!("cd '{}' || exit 1", dir.to_string_lossy())));
        assert!(body.contains("echo hello"));
        // Leaves the user at a prompt in the project rather than closing.
        assert!(body.contains("exec \"${SHELL:-/bin/sh}\" -l"));
        // Owner-only, because it is about to be executed.
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o700);
        std::fs::remove_file(&path).ok();
    }
}
