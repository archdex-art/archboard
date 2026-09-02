import { describe, expect, test } from "bun:test";

import { compare, frecency, matches, passesFilter } from "@/features/projects/ranking";
import type { GitStatus, Project } from "@/types";

const HOUR = 3600;
const now = () => Math.floor(Date.now() / 1000);

function project(over: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: "AI Assistant",
    path: "/Users/dev/Projects/ai-assistant",
    language: "TypeScript",
    framework: "Next.js",
    packageManager: "pnpm",
    gitInitialized: true,
    gitRemote: null,
    isFavorite: false,
    openCount: 0,
    lastOpened: null,
    notes: null,
    defaultIdeId: null,
    createdAt: 0,
    updatedAt: 0,
    tags: [],
    ...over,
  };
}

function status(over: Partial<GitStatus> = {}): GitStatus {
  return {
    initialized: true,
    branch: "main",
    detached: false,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
    lastCommit: null,
    remote: null,
    fetchedAt: 0,
    ...over,
  };
}

describe("frecency", () => {
  test("ranks an active project above a heavily used but stale one", () => {
    const active = project({ openCount: 2, lastOpened: now() - 10 * 60 });
    const stale = project({ id: 2, openCount: 90, lastOpened: now() - 400 * 24 * HOUR });
    expect(frecency(active)).toBeGreaterThan(frecency(stale));
  });

  test("a project that has never been opened scores nothing", () => {
    expect(frecency(project())).toBe(0);
  });

  test("between equally recent projects, the more used one wins", () => {
    const a = project({ openCount: 1, lastOpened: now() - 30 * 60 });
    const b = project({ id: 2, openCount: 9, lastOpened: now() - 30 * 60 });
    expect(frecency(b)).toBeGreaterThan(frecency(a));
  });
});

describe("search", () => {
  const p = project({ tags: ["work"], path: "/Users/dev/Projects/ai-assistant" });
  const s = status({ branch: "feature/login", remote: {
    raw: "git@github.com:acme/ai-assistant.git",
    host: "github.com",
    service: "GitHub",
    owner: "acme",
    repo: "ai-assistant",
    webUrl: "https://github.com/acme/ai-assistant",
  } });

  test.each([
    ["name", "assist"],
    ["path segment", "projects/ai"],
    ["language", "typescript"],
    ["framework", "next"],
    ["branch", "feature/log"],
    ["remote owner", "acme"],
    ["remote host", "github.com"],
    ["tag", "work"],
  ])("matches on %s", (_label, needle) => {
    expect(matches(p, s, needle)).toBe(true);
  });

  test("does not match unrelated text", () => {
    expect(matches(p, s, "kubernetes")).toBe(false);
  });

  test("searchable fields still work when git has not loaded yet", () => {
    expect(matches(p, undefined, "assist")).toBe(true);
    expect(matches(p, undefined, "feature/log")).toBe(false);
  });
});

describe("filters", () => {
  test("favorites, git and recent select on the project record", () => {
    expect(passesFilter(project({ isFavorite: true }), undefined, "favorites")).toBe(true);
    expect(passesFilter(project(), undefined, "favorites")).toBe(false);
    expect(passesFilter(project({ gitInitialized: false }), undefined, "git")).toBe(false);
    expect(passesFilter(project({ lastOpened: now() }), undefined, "recent")).toBe(true);
    expect(passesFilter(project(), undefined, "recent")).toBe(false);
  });

  test("uncommitted work needs live git state, and conflicts count as dirty", () => {
    expect(passesFilter(project(), status({ modified: 2 }), "dirty")).toBe(true);
    expect(passesFilter(project(), status({ conflicted: 1 }), "dirty")).toBe(true);
    // Drift from the remote is not uncommitted work.
    expect(passesFilter(project(), status({ ahead: 3 }), "dirty")).toBe(false);
    expect(passesFilter(project(), status(), "dirty")).toBe(false);
    // Without a status we cannot claim the project is dirty.
    expect(passesFilter(project(), undefined, "dirty")).toBe(false);
  });

  test("language filters, and Other catches everything unrecognised", () => {
    expect(passesFilter(project({ language: "TypeScript" }), undefined, "lang:TypeScript")).toBe(true);
    expect(passesFilter(project({ language: "Go" }), undefined, "lang:TypeScript")).toBe(false);
    expect(passesFilter(project({ language: "Zig" }), undefined, "lang:Other")).toBe(true);
    expect(passesFilter(project({ language: null }), undefined, "lang:Other")).toBe(true);
    expect(passesFilter(project({ language: "Rust" }), undefined, "lang:Other")).toBe(false);
  });

  test("tag filter matches the exact tag", () => {
    expect(passesFilter(project({ tags: ["work"] }), undefined, "tag:work")).toBe(true);
    expect(passesFilter(project({ tags: ["homework"] }), undefined, "tag:work")).toBe(false);
  });
});

describe("sorting", () => {
  const a = project({ id: 1, name: "Alpha", lastOpened: now() - 5 * HOUR, openCount: 1 });
  const b = project({ id: 2, name: "beta", lastOpened: now() - 30 * 60, openCount: 1 });

  test("name sort is case-insensitive", () => {
    expect(compare(a, b, "name", {})).toBeLessThan(0);
    expect(compare(b, a, "name", {})).toBeGreaterThan(0);
  });

  test("recent sort puts the newest first", () => {
    expect(compare(a, b, "recent", {})).toBeGreaterThan(0);
  });

  test("changes sort ranks by total working-tree changes", () => {
    const git = {
      1: status({ modified: 5 }),
      2: status({ staged: 1, untracked: 1 }),
    };
    expect(compare(a, b, "changes", git)).toBeLessThan(0);
  });

  test("a project with no git reading yet sorts below a clean one", () => {
    expect(compare(a, b, "changes", { 2: status() })).toBeGreaterThan(0);
  });
});
