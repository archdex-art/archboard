# Archboard — Architecture

> **One-click project context switching — select a project, open its IDE, terminal, folder, and Git remote.**

macOS-first. Tauri v2 + Rust + React + TypeScript + Tailwind + shadcn-style Radix primitives + SQLite.

This is the as-built document: the design that was implemented, the prior art it came from, and the decisions that were measured rather than assumed.

---

## 1. Prior art — what exists and what it misses

| Tool | Model | Misses |
|---|---|---|
| [JetBrains Toolbox](https://www.jetbrains.com/toolbox-app/) (Projects tab) | Desktop launcher, recent-projects list per IDE | **Zero git awareness.** No branch, no dirty count. JetBrains IDEs only. |
| [VS Code Project Manager](https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager) | `projects.json` + auto-discovery over base folders with a depth cap, tags, favorites | Lives inside VS Code. Cannot open a *different* editor. No live git state. |
| [Raycast Git Repos](https://www.raycast.com/moored/git-repos) | Keyboard-first list, `⌘K` action panel, frecency, background index | Constrained to Raycast's list UI. No dashboard, no detail view, no persisted metadata. |
| GitHub Desktop / Fork / Tower | Best-in-class live git status on a repo list | Full git clients, not launchers. Will not open your editor. |
| [Microsoft Dev Home](https://learn.microsoft.com/en-us/windows/dev-home/) | Widget dashboard, repo list | **Remote-only** git (PRs/Actions via API), ignores local dirty state. Windows. Deprecated. |
| `ghq` + `zoxide` + [`sesh`](https://github.com/joshmedeski/sesh) | Frecency fuzzy-jump, session orchestration | Terminal-only, config-file driven, no visual state. |

**The gap:** nothing combines a visual dashboard, live *local* git state, and launching any editor or terminal. Toolbox has the dashboard without git. Raycast has git without the dashboard. Dev Home has the wrong git.

**Patterns taken:** Raycast's action panel (`Enter` = primary, `⌘K` = everything else), Project Manager's hybrid discovery (scan roots *plus* manual adds), zoxide's frecency, Starship's rule of never blocking a frame on git.

**Traps avoided:** a startup scan of `~` that freezes the UI; remote-only git state while fourteen files sit uncommitted locally; hardcoding a single editor.

---

## 2. Decisions that go against common advice

Each of these was verified, not assumed.

1. **Shell out to `git`. No `git2`, no `gix`.** The "process spawns are too slow" claim is false at this access pattern: **200 concurrent `git status --porcelain=v2 --branch` spawns took 0.20 s at 8 workers** (~1 ms amortised). Only visible rows are refreshed, capped at 8 in flight, behind a 60 s TTL. Shelling out also removes a C toolchain from the build.
2. **One call gets everything.** `git status --porcelain=v2 --branch --untracked-files=normal` returns branch, upstream, ahead/behind *and* per-file states together. The parser tolerates a missing `branch.upstream`/`branch.ab` and `branch.head = (detached)`.
3. **Bundle identifiers are read from disk, never guessed.** WebStorm is `com.jetbrains.WebStorm` — capital W. Applications are found by enumerating `/Applications`, `~/Applications` and the JetBrains Toolbox directory and reading each `Info.plist`.
4. **An entry that ships as an `.app` must have that `.app`.** Apple leaves `/usr/bin/xed` on every Mac; offering "Xcode" on a machine without Xcode is a promise the app cannot keep.
5. **A blanket skip of hidden directories is wrong.** A dotfiles repository is a real project. Hidden directories are allowed at depth 1 of a scan root and skipped below it.
6. **`osascript` is avoidable.** `open -b <bundle-id> <dir>` goes through LaunchServices: no Apple Events, no Automation permission prompt.
7. **A Tauri GUI app does not inherit the shell `$PATH`.** `code .` fails in a bundled build. Launching goes through `open -b`, or an absolute shim resolved at detection time.
8. **Own SQLite in Rust.** `rusqlite` behind typed commands, not `tauri-plugin-sql`: the background scanner needs the same connection, and no SQL should live in the frontend.
9. **A global hotkey costs no permission — I was wrong about this twice.** I twice claimed `tauri-plugin-global-shortcut` would trigger an Accessibility prompt. Reading `global-hotkey`'s macOS backend settles it: ordinary shortcuts go through Carbon `RegisterEventHotKey` (`platform_impl/macos/mod.rs:117`), which needs no permission and delivers while the app is in the background. The `CGEventTapCreate` call in the same file belongs to `start_watching_media_keys` and only runs for media keys — which is why Archboard refuses to bind them. `⌘K` stays an in-window listener; `⌥K` is the global one.
10. **The window's visibility is not persisted.** `tauri-plugin-window-state` would otherwise save "hidden" and, if the app died before showing, restore it hidden forever. `StateFlags::all() - VISIBLE`, and `setup` shows the window itself.

---

## 3. Architecture

```
React (presentation and local UI state)
   │  invoke()  — typed wrappers in src/lib/ipc.ts, one per command
   │  listen()  — scan:progress, scan:done
   ▼
Rust (all I/O, all OS specifics, all trust decisions)
   ├─ db/        rusqlite in tauri::State — projects, tags, launchers, settings
   ├─ git/       spawn real git, parse porcelain v2, TTL cache, Semaphore(8)
   ├─ detect/    marker table → language / framework / package manager
   ├─ launcher/  Info.plist scan + launching via argv arrays
   ├─ scan/      depth-capped walk that stops at every repository
   └─ commands/  35 thin #[tauri::command]s, validation, error mapping
```

**The frontend never sees a path it can influence into a command.** Launching takes a `project_id`; Rust resolves the path from SQLite. There is no `run_command(String)` in the API surface.

**SQLite stores metadata, never git truth.** No `branch` or `dirty_count` columns. `git_initialized` and `git_remote` are persisted only as last-known hints for first paint and are overwritten by the live read.

### Rendering contract
- The dashboard paints from SQLite alone — instant, no git, no filesystem.
- Git state is fetched when a row scrolls into view, coalesced into one `git_status_batch` per frame, 60 s TTL, `Semaphore(8)` in Rust.
- Search is debounced 120 ms and ranked in memory.
- Scanning streams `scan:progress`; results appear as they arrive.
- **Columns are prioritised by what they earn.** The list narrows when the detail pane opens, so columns drop in reverse order of value: stack chips first, then the age, and the branch survives to a very narrow list because it is the reason the list exists. An earlier ordering hid branch, stack and age at the *default* window size with the pane open — the app's whole purpose, invisible out of the box.
- **Branch names are truncated from the middle.** Real branches look like `fix/honcho-plugin-pydantic-validation`; clipping from the right leaves `fix/honcho-plu…`, which is the half every branch shares. `fix/ho…idation` keeps the type and the distinguishing words.
- **The age column falls back to the last commit** when a project has never been opened from Archboard. "Never" is true and useless; the commit date is already loaded.
- **Not virtualized, and measured rather than assumed.** Rendering the real row markup with the real compiled CSS in Chrome: scrolling costs ~1 µs at every size, because scroll is a compositor translate that never relayouts. Full relayout — what a window resize or opening the detail pane triggers — costs 2.9 ms at 500 rows, 5.7 ms at 1,000, **14.7 ms at 2,000** and 36 ms at 5,000. The first frame-budget miss lands near **1,500 rows**. That is the number that would justify `@tanstack/react-virtual`; virtualizing sooner would cost native `scrollIntoView` keyboard navigation and the per-row `IntersectionObserver` for nothing.

---

## 4. Database

`~/Library/Application Support/com.archboard.desktop/archboard.db`, WAL, `foreign_keys=ON`.
Migrations are an append-only `&[&str]` driven by `PRAGMA user_version`. No migration crate.

- **`projects`** — id, name, path (unique, canonicalised), language, framework, package_manager, git_initialized, git_remote, is_favorite, open_count, last_opened, notes, default_ide_id, created_at, updated_at. Indexed on last_opened, is_favorite, language.
- **`tags`** — id, name (unique, `COLLATE NOCASE`), color.
- **`project_tags`** — composite primary key, cascading deletes.
- **`launchers`** — id, kind (`ide` | `terminal`), name, bundle_id, exec_path, args (JSON argv template), platform, detected, enabled. Unique on (kind, name).
- **`scan_roots`** — id, path, depth, enabled.
- **`settings`** — key/value.

Editors and terminals share one table because they are the same shape; two near-identical tables would mean two copies of the same logic. `open_count` exists for frecency.

---

## 5. Search ranking

Substring matching was replaced with [fuzzysort](https://github.com/farzher/fuzzysort) 4.0.2 (17.5 KB minified, zero dependencies, returns match positions for highlighting).

Fields are weighted so that a hit in the name beats the same text appearing in a path; the best single field wins rather than the sum, so one strong hit beats several weak ones:

| field | weight | | field | weight |
|---|---|---|---|---|
| name | 1.00 | | language | 0.60 |
| tags | 0.90 | | package manager | 0.55 |
| folder | 0.85 | | branch | 0.50 |
| path | 0.70 | | remote | 0.45 |
| framework | 0.65 | | | |

Favorites get a 1.08× multiplier — a star is a standing instruction about what matters.

**Threshold 0.2, measured.** Contiguous matches score 0.75–0.95; heavy abbreviations (`aiast` → "AI Assistant") land near 0.30. A non-subsequence scores nothing at all, so a low threshold admits abbreviations without admitting noise.

**Frecency** is `(1 + log₂(1 + open_count)) × decay`, decay being 4 / 2 / 0.5 / 0.25 by age. Frequency is damped logarithmically on purpose: multiplying by the raw count let a project opened ninety times last year outrank one opened ten minutes ago, which is backwards for a launcher.

---

## 6. Git integration

- `Command::new("git").arg("-C").arg(path)` — argv array, never a shell string; 5 s timeout; `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, `GIT_PAGER=cat` so a background read can never open an editor, a pager or a credential prompt.
- Counts come from porcelain line prefixes: `1`/`2` (tracked, XY columns split staged from modified), `?` (untracked), `u` (conflicted).
- Commit: `log -1 --format=%H%x00%an%x00%aI%x00%s`, NUL-separated because subjects contain anything.
- `git init` runs only from an explicit confirmation. The `auto_init_git` setting pre-answers that dialog; there is no silent-init path.

**Remote URLs** are parsed by hand (~40 lines, one table) rather than by a crate, because SCP-style parsing is a split and no crate knows the Azure `_git` mapping.

| input | web URL |
|---|---|
| `git@github.com:u/r.git` | `https://github.com/u/r` |
| `git@gitlab.com:group/sub/r.git` | `https://gitlab.com/group/sub/r` (subgroups preserved) |
| `git@ssh.dev.azure.com:v3/org/proj/repo` | `https://dev.azure.com/org/proj/_git/repo` |
| `ssh://git@host:2222/u/r.git` | `https://host/u/r` (port dropped) |
| `/srv/git/repo.git` | none — local remotes are not clickable |

Host label comes from the hostname. **Never assume GitHub.**

---

## 7. Detection

A static table; adding a stack is adding one row. **Top-level `read_dir` only — never recursive, never executed.** 24 markers covering JS/TS, Deno, Rust, Go, Python, Java/Kotlin, Swift, .NET, Ruby, PHP, C/C++, Dart and Elixir, with lockfiles resolving the package manager.

Frameworks are inferred by substring-matching the one manifest already identified, capped at 64 KB. The needles are quoted (`"react"`, not `react`) so that `preact` and `react-native` cannot be misread — there is a test for exactly that.

Cost: one `read_dir` plus at most one file read.

---

## 8. Security

**A repository is untrusted input, and git is a program it can configure.**
Archboard never builds a command from project metadata — every git and launcher
call is an argv array. That turned out not to be enough. Git reads the
repository's own `.git/config`, and several settings name a *program*:
`core.fsmonitor` is executed by `git status`. A folder unpacked from a tarball
could therefore run code the moment it was added to the board, and again on
every sixty-second refresh. Verified locally with Archboard's exact argv, then
fixed by passing hardening `-c` overrides on every invocation — command-line
config outranks repository config — and covered by a test that drives the real
`git` binary against a repository that tries it.

**Credentials are not copied out of the repository.** `git remote get-url`
returns whatever is in `.git/config`, including `https://user:token@host/...`.
The userinfo is stripped before the remote is stored or sent to the frontend:
the database is not a place the user expects to keep secrets.

| Risk | Mitigation |
|---|---|
| Arbitrary command execution | No command string crosses IPC. The frontend passes ids; Rust resolves them. |
| Shell injection | `std::process::Command` with argv arrays. No `sh -c`, no `format!` into a command. |
| Malicious project metadata | Manifests are read as text for substring matching. Never parsed as code, never executed. No lifecycle scripts. |
| Stale or traversed paths | Canonicalised on insert, re-verified before every launch and every git call. |
| Git blast radius | Every invocation is `-C <that project's path>`. `git init` requires confirmation. |
| Capability creep | `dialog:allow-open`, `opener:allow-open-url`, `opener:allow-reveal-item-in-dir`, `window-state:default`. No shell plugin, no fs plugin. |

---

## 9. Distribution

There is no Apple Developer ID, so builds are ad-hoc signed (`codesign -s -`), which Apple Silicon requires in order to execute a binary at all but which does not satisfy Gatekeeper.

- macOS 15 removed the right-click → Open bypass. First launch requires either `xattr -dr com.apple.quarantine`, or System Settings › Privacy & Security › **Open Anyway**. The DMG background says so.
- Homebrew is not available as a route: `--no-quarantine` was removed in Homebrew 5.0.0, and from 1 September 2026 the `homebrew/cask` tap requires every cask to pass Gatekeeper.
- Tauri passes `--skip-jenkins` to `bundle_dmg.sh` whenever `CI=true`, which silently disables the DMG's Finder styling. `TAURI_BUNDLER_DMG_IGNORE_CI=true` opts back in; `bun run dmg` sets it.

---

## 10. Menu-bar behaviour

- **Default `⌥K`**, avoiding `⌘Space` (Spotlight), `⌥Space` (Raycast, Alfred) and a global `⌘K`, which would take the key away from every editor and chat app. Re-recordable, and the recorder rejects a bare key because that would swallow it system-wide.
- **A rejected binding never leaves the user with none.** The backend registers the new accelerator *before* saving it and puts the previous one back if the OS says the combination is taken.
- **Showing needs three calls, in order:** `AppHandle::show` (which maps to `activateIgnoringOtherApps:`), then `window.show()`, then `window.set_focus()`. A background app calling `set_focus` alone raises the window without taking keyboard focus.
- **Closing hides.** Once an app has a menu-bar icon, the red button ending the session is wrong; `CloseRequested` is intercepted and quit stays on the tray menu.
- **The tray icon is a template image** — a black-on-transparent mask that macOS tints for light and dark menu bars, rather than two assets and a theme observer.
- **One accelerator vocabulary.** `src/lib/accelerator.ts` owns the spelling (`Super`, `Alt`, `Control`, `Shift` + a physical key), so the same string can be handed to the global-shortcut plugin, matched against a `KeyboardEvent`, or drawn as `⇧⌘F`. Accelerators are read from `event.code`, never `event.key`: macOS reports `˚` for Alt+K and `!` for Shift+1, so a binding recorded from `event.key` would never match again.
- **Modifier order is normalised on comparison.** Defaults are hand-written and recordings are machine-generated; without canonicalising, a default spelled `Super+Shift+F` never matches the `Shift+Super+F` the keyboard produces. Three shipped defaults were dead this way until a test caught it.
- **Hide-on-blur is deliberately not implemented.** Our own native folder picker blurs the window, so the launcher would vanish mid-interaction. It needs a dialog-open guard to be safe, and it is not worth that for a behaviour not everyone wants.

---

## 11. Accessibility

Audited with axe-core against the built app, in both themes: **0 violations, 32 passes**.

The audit found two real defects. The quiet text layer sat at **2.97:1** — that is not quiet, it is unreadable — so the three text levels were re-derived against the lightest surface each appears on and now measure 14:1 / 7.1:1 / 4.6:1 in dark and 15.7:1 / 7.1:1 / 4.7:1 in light. Every accent already passed. The app also had no top-level heading; there is now a visually hidden `h1` inside the banner landmark.

Beyond the audit: the project list is a real `listbox` with `aria-activedescendant` tracking the keyboard cursor, the palette is a `combobox` with `aria-controls` and `aria-selected` options, every icon-only control carries an `aria-label`, focus is always visible, and `prefers-reduced-motion` collapses every transition.

---

## 12. Saved commands

A project can keep commands the user has typed — `bun run dev`, `make test` — and run one in their terminal, in that folder.

The line this stays on: **Archboard hands off and forgets.** It does not own the process, capture output, show logs, or offer to stop anything. That is the difference between a launcher action and a task runner, and it is why there is no output pane.

- **Nothing is ever derived from the project's own files.** Reading `package.json` scripts and offering to run them would let a repository choose what executes on this machine. The text is what the user typed, and it runs because they clicked it now.
- **How it runs.** A throwaway `0700` script is written to the temp directory: it marks itself started, `cd`s to the project with the path single-quoted, runs the command verbatim, then `exec`s a login shell so the window stays somewhere useful. Terminals with a command-line tool are given the script directly; the rest are handed it through `open -b`.
- **The window is left alive on purpose.** After the command, the script `exec`s a login shell in the project, so output survives and the user is somewhere useful. The cost is Terminal's "terminate running processes?" prompt on close, since the shell is not the one it started. Closing the window instead would take a short command's output with it, which is the worse of the two.
- **Capability is proven, not assumed.** Verified here: Terminal.app executes a `.command` file, and **Warp does not** — `open` still exits 0. So the runner waits for the script's own marker and, if it never appears, says which terminal refused rather than leaving the user staring at a window where nothing happened.

### Workspace launch

A command can be marked as part of the **workspace**: one click then opens the editor and runs every marked command, each in its own terminal window.

This is the one thing the category does not do. Raycast opens an editor; `sesh` opens a terminal; neither restores a working state. "Open the editor *and* start the dev server *and* start the test watcher" is the action a developer actually performs at the start of a session, and it was three clicks and two windows of typing.

It reuses the launch path above rather than growing a second one: the same script, the same proof-of-execution timeout, the same hands-off rule. A workspace launch is `open IDE` followed by N ordinary command runs, and it touches `last_opened` exactly once. Unmarked commands are untouched — the marked set is a filter over commands the user already wrote, not a new kind of thing to author.

---

## 13. Grouping

The list can be partitioned by language, parent folder, or git status, with a sticky heading and count per group.

**Status is the mode that earns the feature.** `Uncommitted work` sorts above `Clean` above `No git`, which puts unfinished work at the top of the board without the user searching for it — the same question the amber gutter answers per row, answered for the whole list at once.

- **Grouping partitions, it never re-sorts.** Order within a group is whatever the active sort produced. Grouping that quietly reordered rows would make the sort control a lie.
- **A row whose git status has not loaded is `Clean`, not dirty.** Status is read lazily as rows scroll into view, so an unvisited row has nothing. Guessing "dirty" would fill the one group that exists for real signal with rows that merely have not been read yet.
- **Ahead/behind is not uncommitted work.** Diverging from a remote is a sync fact, not unfinished editing, and it stays out of the group people scan for "what did I leave open".

---

## 14. First run

An empty board with two buttons is a correct empty state and a poor introduction: it explains neither what the app is for nor that it has a global shortcut.

The first launch shows a single sentence — *your projects, their git state, one glance* — the two things a new user can do, and the hotkey. **Find my projects** seeds the developer directories that actually exist on this Mac (`~/Projects`, `~/Developer`, `~/Code`, `~/dev`, `~/Desktop`, `~/Work`, `~/repos`, `~/src`) and opens the scan sheet. Nothing is added without the checklist: discovery is still a proposal.

First run is `no projects and never onboarded` — not just the absent setting. An existing board with an old database is not a new user, and must never be shown a welcome screen over the top of their own projects.

---

## 15. Out of scope

Commit/push/pull UI, branch management, diff viewer, Docker controls, build/run panes, hosting-provider APIs, cloud sync, team collaboration. Archboard's job ends the moment your editor opens; a launcher that grows a git client becomes a slow launcher and a bad git client.

Windows and Linux are not implemented. The seam exists — a `platform` column and OS specifics isolated behind `#[cfg]` in `launcher/` — and no stub files pretend otherwise.
