import { describe, expect, test } from "bun:test";

import { COMMANDS, conflicts, parseOverrides, resolveBindings } from "@/features/shortcuts/registry";

describe("defaults", () => {
  test("no two commands ship on the same combination", () => {
    expect(conflicts(resolveBindings(undefined))).toEqual({});
  });

  test("every default holds a modifier", () => {
    for (const command of COMMANDS) {
      expect(command.accelerator.split("+").length).toBeGreaterThan(1);
    }
  });

  test("command ids are unique", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolveBindings", () => {
  test("an override replaces exactly one default", () => {
    const bindings = resolveBindings(JSON.stringify({ palette: "Alt+P" }));
    expect(bindings.palette).toBe("Alt+P");
    expect(bindings.add).toBe("Super+N");
  });

  test("every command always resolves to something", () => {
    const bindings = resolveBindings(JSON.stringify({ palette: "Alt+P" }));
    for (const command of COMMANDS) {
      expect(bindings[command.id]).toBeTruthy();
    }
  });

  test("a corrupt setting costs the overrides, not the app", () => {
    expect(parseOverrides("not json")).toEqual({});
    expect(parseOverrides("[1,2,3]")).toEqual({});
    expect(parseOverrides(undefined)).toEqual({});
    expect(resolveBindings("not json").palette).toBe("Super+K");
  });
});

describe("conflicts", () => {
  test("reports commands that would shadow each other", () => {
    const clashing = conflicts(resolveBindings(JSON.stringify({ add: "Super+K" })));
    expect(clashing["Super+K"]?.sort()).toEqual(["add", "palette"]);
  });

  test("says nothing when every binding is distinct", () => {
    expect(conflicts(resolveBindings(JSON.stringify({ add: "Alt+N" })))).toEqual({});
  });
});
