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
- **Keyboard-first** — `⌘K` palette, `⌘N` add, `⌘T` terminal, `⌘I` editor, `⌘R` refresh, `↑↓`/`j k` to move, `↵` to open.
- Favorites, tags, notes, per-project default editor, frecency sorting.

## Design

One rule governs the palette: **colour marks state, never decoration.**

A board of clean repositories renders entirely in graphite. Amber means you left work uncommitted, violet means your branch has drifted from its remote, red means something needs a decision. Each row carries a two-pixel gutter on its leading edge that stays invisible until the repository is dirty — so unfinished work is the only colour on the screen.

Human labels are set in IBM Plex Sans; machine truth — paths, branch names, hashes, counts — is always JetBrains Mono.

## Running it

```bash
bun install
bun run tauri dev      # development
bun run tauri build    # produces Archboard.app
```

Requires Rust, Bun, and a local `git`.

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
