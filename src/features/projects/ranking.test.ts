import { describe, expect, test } from "bun:test";

import fuzzysort from "fuzzysort";

import {
  SEARCH_KEYS,
  SEARCH_THRESHOLD,
  compare,
  frecency,
  passesFilter,
  searchable,
  weighQuery,
} from "@/features/projects/ranking";
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

/** Runs a query the way the dashboard and the palette both do. */
function search(query: string, rows: { project: Project; status?: GitStatus }[]) {
  const targets = rows.map((r) => searchable(r.project, r.status));
  return fuzzysort
    .go(query, targets, {
      keys: SEARCH_KEYS as unknown as string[],
      threshold: SEARCH_THRESHOLD,
      limit: 0,
      scoreFn: (result) => weighQuery(result) * (result.obj.project.isFavorite ? 1.08 : 1),
    })
    .map((result) => result.obj.project.name);
}

describe("search", () => {
  const remote = {
    raw: "git@github.com:acme/ai-assistant.git",
    host: "github.com",
    service: "GitHub",
    owner: "acme",
    repo: "ai-assistant",
    webUrl: "https://github.com/acme/ai-assistant",
  };
  const rows = [
    {
      project: project({ id: 1, name: "AI Assistant", tags: ["work"] }),
      status: status({ branch: "feature/login", remote }),
    },
    {
      project: project({
        id: 2,
        name: "Portfolio",
        path: "/Users/dev/Projects/portfolio",
        language: "JavaScript",
        framework: "Astro",
        packageManager: "bun",
      }),
      status: status({ branch: "main" }),
    },
    {
      project: project({
        id: 3,
        name: "Telemetry API",
        path: "/Users/dev/work/telemetry-api",
        language: "Python",
        framework: "FastAPI",
        packageManager: "uv",
      }),
    },
  ];

  test("finds a project from a subsequence, which substring search could not", () => {
    // The whole point of the upgrade: none of these are substrings of the name.
    expect(search("aiast", rows)).toContain("AI Assistant");
    expect(search("tlmtry", rows)).toContain("Telemetry API");
    expect(search("prtfl", rows)).toContain("Portfolio");
  });

  test.each([
    ["exact name", "Portfolio", "Portfolio"],
    ["path segment", "telemetry-api", "Telemetry API"],
    ["language", "python", "Telemetry API"],
    ["framework", "astro", "Portfolio"],
    ["branch", "feature/login", "AI Assistant"],
    ["remote owner", "acme", "AI Assistant"],
    ["service", "github", "AI Assistant"],
    ["tag", "work", "AI Assistant"],
  ])("matches on %s", (_label, query, expected) => {
    expect(search(query, rows)[0]).toBe(expected);
  });

  test("a hit in the name outranks the same text appearing in a path", () => {
    const byName = project({ id: 10, name: "beacon", path: "/Users/dev/Projects/beacon" });
    const byPath = project({ id: 11, name: "Widgets", path: "/Users/dev/beacon-tools/widgets" });
    const ranked = search("beacon", [{ project: byPath }, { project: byName }]);
    expect(ranked[0]).toBe("beacon");
  });

  test("a favorite edges out an equally good match", () => {
    const plain = project({ id: 20, name: "runner", path: "/a/runner" });
    const starred = project({ id: 21, name: "runner", path: "/b/runner", isFavorite: true });
    expect(search("runner", [{ project: plain }, { project: starred }])[0]).toBe("runner");
    const ranked = fuzzysort.go(
      "runner",
      [searchable(plain, undefined), searchable(starred, undefined)],
      {
        keys: SEARCH_KEYS as unknown as string[],
        threshold: SEARCH_THRESHOLD,
        limit: 0,
        scoreFn: (r) => weighQuery(r) * (r.obj.project.isFavorite ? 1.08 : 1),
      },
    );
    expect(ranked[0].obj.project.isFavorite).toBe(true);
  });

  test("nonsense matches nothing rather than everything", () => {
    expect(search("kubernetes", rows)).toEqual([]);
    expect(search("zzzzzzzz", rows)).toEqual([]);
  });

  test("searchable fields degrade gracefully before git has loaded", () => {
    const rowsWithoutGit = rows.map((r) => ({ project: r.project }));
    expect(search("assistant", rowsWithoutGit)).toContain("AI Assistant");
    expect(search("feature/login", rowsWithoutGit)).toEqual([]);
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
