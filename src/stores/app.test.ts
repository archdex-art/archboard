import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { GitEntry, GitStatus, Project } from "@/types";

// The store reaches the backend through this module and nothing else, so one
// stub is enough to drive it. Declared before the import below, which is why
// this file mocks rather than injects.
const batch = mock(async (_ids: number[], _force?: boolean): Promise<GitEntry[]> => []);

void mock.module("@/lib/ipc", () => ({
  api: { gitStatusBatch: batch },
  toAppError: (e: unknown) => ({ code: "io", message: String(e) }),
  isAppError: () => false,
}));

// Static import cannot work here: the store captures `api` at module scope,
// so the mock above has to be registered before the store is ever loaded.
const { useApp } = await import("@/stores/app");

function project(id: number): Project {
  return {
    id,
    name: `p${id}`,
    path: `/tmp/p${id}`,
    language: null,
    framework: null,
    packageManager: null,
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
  };
}

const status = (): GitStatus => ({
  initialized: true,
  branch: "main",
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  staged: 0,
  modified: 2,
  untracked: 0,
  conflicted: 0,
  lastCommit: null,
  remote: null,
  fetchedAt: 0,
});

beforeEach(() => {
  batch.mockClear();
  useApp.setState({
    projects: [project(1), project(2)],
    git: {},
    gitErrors: {},
    refreshing: new Set(),
    selectedId: null,
    toasts: [],
  });
});

describe("refreshGit", () => {
  test("does not resurrect a project removed while its refresh was in flight", async () => {
    // The realistic sequence: a row scrolls into view, the user removes it
    // before git answers, and the answer arrives for a project that is gone.
    let release: (v: GitEntry[]) => void = () => {};
    batch.mockImplementation(() => new Promise<GitEntry[]>((r) => (release = r)));

    const pending = useApp.getState().refreshGit([1, 2]);
    useApp.getState().dropProject(1);
    release([
      { projectId: 1, status: status(), error: null },
      { projectId: 2, status: status(), error: null },
    ]);
    await pending;

    const { git, projects } = useApp.getState();
    expect(projects.map((p) => p.id)).toEqual([2]);
    expect(git[2]).toBeDefined();
    expect(git[1]).toBeUndefined();
  });

  test("does not resurrect an error either", async () => {
    let release: (v: GitEntry[]) => void = () => {};
    batch.mockImplementation(() => new Promise<GitEntry[]>((r) => (release = r)));

    const pending = useApp.getState().refreshGit([1]);
    useApp.getState().dropProject(1);
    release([
      { projectId: 1, status: null, error: { code: "git_failed", message: "boom" } },
    ]);
    await pending;

    expect(useApp.getState().gitErrors[1]).toBeUndefined();
  });

  test("clears the in-flight marker for every id, including dropped ones", async () => {
    // A stuck marker would make the row refuse to refresh for the rest of the
    // session, because refreshGit skips ids it believes are already running.
    batch.mockImplementation(async () => [
      { projectId: 1, status: status(), error: null },
      { projectId: 2, status: status(), error: null },
    ]);

    await useApp.getState().refreshGit([1, 2]);
    expect(useApp.getState().refreshing.size).toBe(0);
  });

  test("skips ids already refreshing unless forced", async () => {
    batch.mockImplementation(async () => []);
    useApp.setState({ refreshing: new Set([1]) });

    await useApp.getState().refreshGit([1]);
    expect(batch).not.toHaveBeenCalled();

    await useApp.getState().refreshGit([1], true);
    expect(batch).toHaveBeenCalledTimes(1);
  });
});

describe("dropProject", () => {
  test("forgets every per-project map so re-adding starts clean", () => {
    useApp.setState({
      git: { 1: status() },
      gitErrors: { 1: { code: "git_failed", message: "old" } },
      refreshing: new Set([1]),
      selectedId: 1,
    });

    useApp.getState().dropProject(1);

    const s = useApp.getState();
    expect(s.git[1]).toBeUndefined();
    expect(s.gitErrors[1]).toBeUndefined();
    expect(s.refreshing.has(1)).toBe(false);
    expect(s.selectedId).toBeNull();
  });
});
