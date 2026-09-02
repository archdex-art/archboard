import { describe, expect, test } from "bun:test";

import { fromEvent, matches, pretty, requiresModifier } from "@/lib/accelerator";

/** A KeyboardEvent-shaped object; only the fields the parser reads. */
function key(
  code: string,
  mods: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {},
  keyValue?: string,
) {
  return {
    code,
    key: keyValue ?? code,
    metaKey: !!mods.meta,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
  } as KeyboardEvent;
}

describe("fromEvent", () => {
  test("reads the physical key, not the character the modifiers produced", () => {
    // macOS reports `˚` for Alt+K and `!` for Shift+1. Using event.key here
    // would produce an accelerator that never matches again.
    expect(fromEvent(key("KeyK", { alt: true }, "˚"))).toBe("Alt+K");
    expect(fromEvent(key("Digit1", { shift: true }, "!"))).toBe("Shift+1");
  });

  test("emits modifiers in Apple's order regardless of which were held first", () => {
    expect(fromEvent(key("KeyP", { meta: true, shift: true, alt: true, ctrl: true }))).toBe(
      "Control+Alt+Shift+Super+P",
    );
  });

  test.each([
    ["Space", "Super+Space"],
    ["Enter", "Super+Enter"],
    ["Comma", "Super+Comma"],
    ["Backslash", "Super+Backslash"],
    ["ArrowLeft", "Super+Left"],
    ["F5", "Super+F5"],
  ])("maps %s", (code, expected) => {
    expect(fromEvent(key(code, { meta: true }))).toBe(expected);
  });

  test("a lone modifier is not a shortcut", () => {
    for (const k of ["Meta", "Control", "Alt", "Shift"]) {
      expect(fromEvent(key("MetaLeft", { meta: true }, k))).toBeNull();
    }
  });

  test("an unmapped key is rejected rather than guessed at", () => {
    expect(fromEvent(key("Lang1", { meta: true }))).toBeNull();
  });
});

describe("matches", () => {
  test("requires the modifiers to be exactly right", () => {
    expect(matches(key("KeyK", { meta: true }), "Super+K")).toBe(true);
    // An extra modifier is a different shortcut, not a looser match.
    expect(matches(key("KeyK", { meta: true, shift: true }), "Super+K")).toBe(false);
    expect(matches(key("KeyK", {}), "Super+K")).toBe(false);
    expect(matches(key("KeyJ", { meta: true }), "Super+K")).toBe(false);
  });

  test("distinguishes bindings that share a key", () => {
    const event = key("KeyF", { meta: true, shift: true });
    expect(matches(event, "Super+F")).toBe(false);
    expect(matches(event, "Super+Shift+F")).toBe(true);
  });
});

describe("pretty", () => {
  test("draws the combination the way macOS does", () => {
    expect(pretty("Super+K")).toBe("⌘K");
    expect(pretty("Super+Shift+F")).toBe("⇧⌘F");
    expect(pretty("Control+Alt+Shift+Super+P")).toBe("⌃⌥⇧⌘P");
    expect(pretty("Alt+K")).toBe("⌥K");
    expect(pretty("Super+Comma")).toBe("⌘,");
    expect(pretty("Super+Enter")).toBe("⌘↵");
  });

  test("round-trips whatever fromEvent produced", () => {
    const accelerator = fromEvent(key("KeyT", { meta: true, shift: true }))!;
    expect(pretty(accelerator)).toBe("⇧⌘T");
  });
});

describe("requiresModifier", () => {
  test("a bare key would be swallowed app-wide", () => {
    expect(requiresModifier("K")).toBe(true);
    expect(requiresModifier("Super+K")).toBe(false);
  });
});
