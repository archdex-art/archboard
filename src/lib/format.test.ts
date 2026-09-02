import { describe, expect, test } from "bun:test";

import { ago, agoIso, stateOf, tildePath } from "@/lib/format";

describe("tildePath", () => {
  test("shortens a home path but leaves everything else alone", () => {
    expect(tildePath("/Users/dev/Projects/api")).toBe("~/Projects/api");
    expect(tildePath("/Users/dev")).toBe("~");
    expect(tildePath("/opt/homebrew/src/api")).toBe("/opt/homebrew/src/api");
    expect(tildePath("/Volumes/Work/api")).toBe("/Volumes/Work/api");
  });
});

describe("ago", () => {
  const now = Math.floor(Date.now() / 1000);

  test.each([
    [now - 5, "just now"],
    [now - 300, "5m"],
    [now - 7200, "2h"],
    [now - 3 * 86_400, "3d"],
    [now - 21 * 86_400, "3w"],
    [now - 200 * 86_400, "6mo"],
    [now - 800 * 86_400, "2y"],
  ])("formats an age compactly", (timestamp, expected) => {
    expect(ago(timestamp)).toBe(expected);
  });

  test("a project that was never opened has no age", () => {
    expect(ago(null)).toBeNull();
    expect(ago(0)).toBeNull();
  });

  test("a future timestamp does not produce a negative age", () => {
    expect(ago(now + 600)).toBe("just now");
  });

  test("agoIso rejects anything git did not give us a date for", () => {
    expect(agoIso(null)).toBeNull();
    expect(agoIso("not a date")).toBeNull();
    expect(agoIso(new Date(Date.now() - 7200_000).toISOString())).toBe("2h");
  });
});

describe("stateOf", () => {
  const clean = { conflicted: 0, staged: 0, modified: 0, untracked: 0, ahead: 0, behind: 0 };

  test("reports the state in the order a developer must deal with it", () => {
    // A conflict outranks everything, even though the tree is also dirty.
    expect(stateOf({ ...clean, conflicted: 1, modified: 4, ahead: 2 })).toBe("conflict");
    // Uncommitted work outranks having drifted from the remote.
    expect(stateOf({ ...clean, modified: 1, ahead: 2 })).toBe("dirty");
    expect(stateOf({ ...clean, untracked: 1 })).toBe("dirty");
    expect(stateOf({ ...clean, staged: 1 })).toBe("dirty");
    expect(stateOf({ ...clean, behind: 3 })).toBe("diverged");
    expect(stateOf(clean)).toBe("clean");
  });
});
