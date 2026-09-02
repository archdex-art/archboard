# Archboard

A desktop dashboard for every code project on your Mac.

**Find a project → see its state → open terminal, IDE, or Git remote in one click.**

Built with Tauri v2, Rust, React, TypeScript, Tailwind, and SQLite.

---

## What it does

- **Live Git state, read from the repository** — branch, ahead/behind, staged, modified, untracked, conflicts, last commit, remote. Never cached truth: the database stores metadata, Git answers for itself.
- **One-click context switching** — open the project in any installed editor, a terminal already `cd`'d to the folder, Finder, or its page on GitHub/GitLab/Bitbucket/Azure DevOps.
- **Project detection** — language, framework, and package manager from the top-level manifest. 23 markers, no recursion, nothing executed.
- **Discovery** — point it at `~/Projects` and it finds the repositories, then asks before adding any of them.
- **Always one keystroke away** — `⌥K` from any application summons Archboard; press it again to dismiss. It also lives in the menu bar, and can drop out of the Dock entirely.
- **Keyboard-first, and rebindable** — `⌘K` palette, `⌘N` add, `⌘T` terminal, `⌘I` editor, `⌘R` refresh, `↑↓`/`j k` to move, `↵` to open. Every command above can be re-recorded in Settings › Shortcuts; only the navigation keys are fixed.
- Favorites, tags, notes, per-project default editor, frecency sorting.

### The global shortcut

`⌥K` is registered by default and can be re-recorded or turned off in Settings. It deliberately avoids `⌘Space` (Spotlight), `⌥Space` (Raycast and Alfred) and a global `⌘K`, which would steal the key from every editor and chat app you use.

macOS asks for **no permissions** for this. Ordinary shortcuts go through Carbon's `RegisterEventHotKey`, which needs neither Accessibility nor Input Monitoring; only media keys would take the event-tap path that prompts, so Archboard refuses to bind them. If a combination is already taken, registration fails with a message instead of silently doing nothing, and the previous binding is restored.

Closing the window hides it, since the app is reachable from the menu bar and the shortcut. Quit from the tray menu or `⌘Q`.

## Design

One rule governs the palette: **colour marks state, never decoration.**

A board of clean repositories renders entirely in graphite. Amber means you left work uncommitted, violet means your branch has drifted from its remote, red means something needs a decision. Each row carries a two-pixel gutter on its leading edge that stays invisible until the repository is dirty — so unfinished work is the only colour on the screen.

Human labels are set in IBM Plex Sans; machine truth — paths, branch names, hashes, counts — is always JetBrains Mono.

## Running it

```bash
bun install
bun run tauri dev      # development
bun run check          # typecheck + 36 frontend tests
bun run dmg            # Archboard.app and a styled .dmg
```

Requires Rust, Bun, and a local `git`. Backend tests: `cargo test --manifest-path src-tauri/Cargo.toml` (11 tests covering the porcelain parser, remote URLs, stack detection and the discovery walk).

`bun run dmg` rather than `tauri build` because Tauri skips the DMG's Finder styling whenever `CI=true`, and it exports `APPLE_SIGNING_IDENTITY=-` for the ad-hoc signature that Apple Silicon requires in order to run a binary at all.

## Installing a build

Builds are **ad-hoc signed and not notarized** — there is no Apple Developer ID on this project. macOS will refuse to open the app the first time.

The fastest way through, and what the installer window tells you:

```bash
xattr -dr com.apple.quarantine /Applications/Archboard.app
```

If you would rather not use the terminal, macOS 15 and later require this exact sequence — **the old right-click → Open shortcut no longer works**:

1. Drag Archboard to Applications and double-click it.
2. macOS blocks it. Click **Done**.
3. Open **System Settings › Privacy & Security**, scroll to **Security**.
4. Next to *"Archboard was blocked…"*, click **Open Anyway** and authenticate.

Copy the app into `/Applications` before launching it. Running it from the mounted disk image triggers App Translocation, which puts it at a randomised read-only path.

To sign properly, set `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` — locally as environment variables, or as repository secrets, where [`.github/workflows/release.yml`](.github/workflows/release.yml) already reads them.

Tag a release with `git tag v0.1.0 && git push --tags`; the workflow builds a universal binary and opens a draft release with the `.dmg` attached.

> Homebrew is not an option. As of 1 September 2026 the `homebrew/cask` tap requires every cask to pass Gatekeeper, and `--no-quarantine` was removed in Homebrew 5.0.0.

## Architecture

```
src/                          src-tauri/src/
├── components/               ├── commands/    typed IPC surface
├── pages/                    ├── db/          rusqlite + migrations
├── features/                 ├── git/         porcelain v2, TTL cache
│   ├── projects/             ├── detect/      marker → stack matrix
│   └── settings/             ├── launcher/    app detection + launching
├── hooks, lib, types         └── scan/        bounded discovery walk
└── stores/
```

Everything OS-specific lives in Rust. The frontend talks to it through typed commands and never sees a path it can turn into a command.

See [`PLAN.md`](./PLAN.md) for the full architecture, database schema, command API, and the prior-art research behind the design.

## Security

- No command string ever crosses the IPC boundary. The frontend passes a project id; Rust resolves the path from SQLite.
- Every launch is `std::process::Command` with an argument array. No shell, no interpolation.
- Manifests are read as text for substring matching. Never parsed as code, never executed — adding or scanning a project runs nothing.
- Every Git invocation is scoped with `-C <that project's path>`. `git init` always requires explicit confirmation.
- Capabilities are limited to opening a folder picker, a URL, and a Finder reveal.

## Scope

Deliberately not included: commit/push/pull UI, branch management, diff viewer, Docker controls, task runners, hosting-provider APIs, cloud sync. Archboard opens projects; your editor and terminal do the rest.

Windows and Linux are not implemented. The seam exists — `platform` on every launcher row, OS specifics isolated behind `#[cfg]` in `launcher/` — but no stub files pretend otherwise.
