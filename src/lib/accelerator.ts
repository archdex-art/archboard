/**
 * Accelerators, in the one vocabulary the whole app uses.
 *
 * The token spelling is Tauri's (`Super`, `Alt`, `Control`, `Shift` + a key),
 * so the same string can be handed to the global-shortcut plugin or matched
 * against a browser `KeyboardEvent` without translation.
 */

/** Keys that only ever modify another key. */
export const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

/** Apple's canonical modifier order, with the glyph each one is drawn as. */
const MODIFIERS: [token: string, glyph: string, held: (e: KeyboardEvent) => boolean][] = [
  ["Control", "\u2303", (e) => e.ctrlKey],
  ["Alt", "\u2325", (e) => e.altKey],
  ["Shift", "\u21e7", (e) => e.shiftKey],
  ["Super", "\u2318", (e) => e.metaKey],
];

/** Glyphs for keys that have one, so bindings read like the menu bar. */
const KEY_GLYPHS: Record<string, string> = {
  Enter: "\u21b5",
  Space: "\u2423",
  Backspace: "\u232b",
  Escape: "\u238b",
  Tab: "\u21e5",
  Up: "\u2191",
  Down: "\u2193",
  Left: "\u2190",
  Right: "\u2192",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
};

/**
 * The physical key, independent of layout and of any character the modifiers
 * would have produced. `event.key` is unusable here: on macOS, Alt+K reports
 * `˚`, and Shift+1 reports `!`.
 */
function keyFromCode(code: string): string | null {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const named: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    NumpadEnter: "Enter",
    Escape: "Escape",
    Backspace: "Backspace",
    Tab: "Tab",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Backslash: "Backslash",
    Minus: "Minus",
    Equal: "Equal",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Backquote: "Backquote",
  };
  return named[code] ?? null;
}

/**
 * Builds an accelerator from a key event, or returns null when the event is
 * not one — a lone modifier, or an unmapped key.
 */
export function fromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = keyFromCode(e.code);
  if (!key) return null;
  const held = MODIFIERS.filter(([, , test]) => test(e)).map(([token]) => token);
  return [...held, key].join("+");
}

/**
 * Reorders modifiers into Apple's canonical order.
 *
 * Accelerators arrive from two places: `fromEvent`, which is always canonical,
 * and hand-written defaults, which are not. Normalising on the way in means a
 * default spelled `Super+Shift+F` still matches the `Shift+Super+F` the
 * keyboard produces, instead of silently never firing.
 */
export function normalize(accelerator: string): string {
  const parts = accelerator.split("+");
  const key = parts[parts.length - 1] ?? "";
  const held = new Set(parts.slice(0, -1));
  const ordered = MODIFIERS.filter(([token]) => held.has(token)).map(([token]) => token);
  return [...ordered, key].join("+");
}

/** True when the event is exactly this accelerator — no extra modifiers. */
export function matches(e: KeyboardEvent, accelerator: string): boolean {
  const pressed = fromEvent(e);
  return pressed !== null && pressed === normalize(accelerator);
}

/** `Super+Shift+K` → `⇧⌘K`, in the order macOS prints modifiers. */
export function pretty(accelerator: string): string {
  const parts = normalize(accelerator).split("+");
  const key = parts[parts.length - 1] ?? "";
  const held = new Set(parts.slice(0, -1));
  const glyphs = MODIFIERS.filter(([token]) => held.has(token)).map(([, glyph]) => glyph);
  return glyphs.join("") + (KEY_GLYPHS[key] ?? key);
}

/** Accelerators that would swallow an ordinary keypress across the whole app. */
export function requiresModifier(accelerator: string): boolean {
  return accelerator.split("+").length < 2;
}
