import { describe, expect, test } from "bun:test";

import { groupProjects } from "@/features/projects/useProjectList";
import type { GitStatus, Project } from "@/types";

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

const labels = (groups: { label: string }[]) => groups.map((g) => g.label);

describe("groupProjects by status", () => {
  test("puts work that needs attention first", () => {
    // The ordering is the point: a board is scanned top-down, and the reason
    // to group by status at all is to see unfinished work without looking.
    const dirty = project({ id: 1 });
    const clean = project({ id: 2 });
    const plain = project({ id: 3, gitInitialized: false });

    const groups = groupProjects([clean, plain, dirty], "status", {
      1: status({ modified: 3 }),
      2: status(),
    });

    expect(labels(groups)).toEqual(["Uncommitted work", "Clean", "No git"]);
    expect(groups[0].projects.map((p) => p.id)).toEqual([1]);
  });

  test("counts untracked, staged and conflicted as work in progress", () => {
    const cases: Partial<GitStatus>[] = [
      { modified: 1 },
      { untracked: 1 },
      { staged: 1 },
      { conflicted: 1 },
    ];
    for (const over of cases) {
      const groups = groupProjects([project({ id: 1 })], "status", { 1: status(over) });
      expect(labels(groups)).toEqual(["Uncommitted work"]);
    }
  });

  test("a repository whose status has not arrived yet is not accused of being dirty", () => {
    // Git is read lazily, so an unscrolled row has no status. Guessing "dirty"
    // would light up the group the user relies on for real signal.
    const groups = groupProjects([project({ id: 1 })], "status", {});
    expect(labels(groups)).toEqual(["Clean"]);
  });

  test("being ahead or behind the remote is not uncommitted work", () => {
    const groups = groupProjects([project({ id: 1 })], "status", {
      1: status({ ahead: 2, behind: 1 }),
    });
    expect(labels(groups)).toEqual(["Clean"]);
  });
});

describe("groupProjects by language and directory", () => {
  test("groups by language, alphabetically, with unknowns under Other", () => {
    const groups = groupProjects(
      [
        project({ id: 1, language: "Rust" }),
        project({ id: 2, language: null }),
        project({ id: 3, language: "Go" }),
        project({ id: 4, language: "Rust" }),
      ],
      "language",
      {},
    );

    expect(labels(groups)).toEqual(["Go", "Other", "Rust"]);
    expect(groups[2].projects.map((p) => p.id)).toEqual([1, 4]);
  });

  test("groups by parent folder, shortened to a tilde path", () => {
    const groups = groupProjects(
      [
        project({ id: 1, path: "/Users/dev/Projects/api" }),
        project({ id: 2, path: "/Users/dev/work/client" }),
        project({ id: 3, path: "/Users/dev/Projects/web" }),
      ],
      "directory",
      {},
    );

    expect(labels(groups)).toEqual(["~/Projects", "~/work"]);
    expect(groups[0].projects.map((p) => p.id)).toEqual([1, 3]);
  });

  test("keeps the order the list arrived in within a group", () => {
    // Grouping must not undo the active sort; it only partitions.
    const groups = groupProjects(
      [
        project({ id: 3, language: "Rust" }),
        project({ id: 1, language: "Rust" }),
        project({ id: 2, language: "Rust" }),
      ],
      "language",
      {},
    );
    expect(groups[0].projects.map((p) => p.id)).toEqual([3, 1, 2]);
  });

  test("an empty board produces no groups rather than an empty heading", () => {
    expect(groupProjects([], "language", {})).toEqual([]);
  });
});
