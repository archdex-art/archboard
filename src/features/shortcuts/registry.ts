import { normalize } from "@/lib/accelerator";

/**
 * Every rebindable command in the app, in one place.
 *
 * Navigation keys — arrows, `j`/`k`, `Escape` — are deliberately absent. They
 * are structural rather than preferences, and rebinding them would leave the
 * list with no way to move.
 */
export interface Command {
  id: string;
  label: string;
  /** Grouping in the settings list. */
  group: "Application" | "Project";
  accelerator: string;
  /** True when the command acts on whichever project is selected. */
  needsSelection?: boolean;
}

export const COMMANDS: readonly Command[] = [
  { id: "palette", label: "Search projects", group: "Application", accelerator: "Super+K" },
  { id: "add", label: "Add project", group: "Application", accelerator: "Super+N" },
  { id: "find", label: "Focus the filter field", group: "Application", accelerator: "Super+F" },
  { id: "scan", label: "Find projects on this Mac", group: "Application", accelerator: "Super+Shift+F" },
  { id: "settings", label: "Open settings", group: "Application", accelerator: "Super+Comma" },
  { id: "view", label: "Switch between list and cards", group: "Application", accelerator: "Super+Backslash" },

  { id: "open-ide", label: "Open in editor", group: "Project", accelerator: "Super+I", needsSelection: true },
  { id: "open-terminal", label: "Open terminal", group: "Project", accelerator: "Super+T", needsSelection: true },
  { id: "open-folder", label: "Reveal in Finder", group: "Project", accelerator: "Super+Shift+O", needsSelection: true },
  { id: "open-remote", label: "Open git remote", group: "Project", accelerator: "Super+Shift+G", needsSelection: true },
  { id: "refresh", label: "Refresh git status", group: "Project", accelerator: "Super+R", needsSelection: true },
  { id: "favorite", label: "Toggle favorite", group: "Project", accelerator: "Super+D", needsSelection: true },
] as const;

export type CommandId = (typeof COMMANDS)[number]["id"];

/** Settings key holding the user's overrides, as `{ commandId: accelerator }`. */
export const OVERRIDES_KEY = "shortcut_overrides";

export function parseOverrides(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupt value should cost the user their overrides, not the app.
    return {};
  }
  // `typeof [] === "object"`, so arrays have to be excluded explicitly, and
  // only string values are usable as accelerators.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** The effective binding for every command, defaults merged with overrides. */
export function resolveBindings(raw: string | undefined): Record<string, string> {
  const overrides = parseOverrides(raw);
  const bindings: Record<string, string> = {};
  for (const command of COMMANDS) {
    // Normalised so a hand-written default and a recorded override are always
    // comparable, whichever order their modifiers were written in.
    bindings[command.id] = normalize(overrides[command.id] ?? command.accelerator);
  }
  return bindings;
}

/**
 * Command ids that share an accelerator. Two commands on one key means the
 * second never fires, so the UI has to say so.
 */
export function conflicts(bindings: Record<string, string>): Record<string, string[]> {
  const byAccelerator: Record<string, string[]> = {};
  for (const [id, accelerator] of Object.entries(bindings)) {
    (byAccelerator[accelerator] ??= []).push(id);
  }
  const clashing: Record<string, string[]> = {};
  for (const [accelerator, ids] of Object.entries(byAccelerator)) {
    if (ids.length > 1) clashing[accelerator] = ids;
  }
  return clashing;
}
