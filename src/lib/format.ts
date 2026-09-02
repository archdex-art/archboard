import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HOME = "/Users/";

/** `/Users/me/Projects/api` → `~/Projects/api`, so paths stay scannable. */
export function tildePath(path: string) {
  if (!path.startsWith(HOME)) return path;
  const rest = path.slice(HOME.length);
  const slash = rest.indexOf("/");
  return slash === -1 ? "~" : `~${rest.slice(slash)}`;
}

const UNITS: [limit: number, seconds: number, label: string][] = [
  [60, 1, "s"],
  [3600, 60, "m"],
  [86_400, 3600, "h"],
  [604_800, 86_400, "d"],
  [2_629_800, 604_800, "w"],
  [31_557_600, 2_629_800, "mo"],
  [Infinity, 31_557_600, "y"],
];

/** Compact age for a unix timestamp in seconds: `5m`, `2h`, `3d`. */
export function ago(unixSeconds: number | null | undefined) {
  if (!unixSeconds) return null;
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (delta < 45) return "just now";
  const [, seconds, label] = UNITS.find(([limit]) => delta < limit) ?? UNITS[UNITS.length - 1];
  return `${Math.floor(delta / seconds)}${label}`;
}

/** Same idea, for the ISO 8601 dates git hands back. */
export function agoIso(iso: string | null | undefined) {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : ago(Math.floor(parsed / 1000));
}

export type StateKind = "clean" | "dirty" | "diverged" | "conflict" | "untracked-repo";

/**
 * Reduces a git status to the single thing worth colouring. Conflicts outrank
 * uncommitted work, which outranks drift from the remote — the order in which
 * a developer has to deal with them.
 */
export function stateOf(status: {
  conflicted: number;
  staged: number;
  modified: number;
  untracked: number;
  ahead: number;
  behind: number;
}): StateKind {
  if (status.conflicted > 0) return "conflict";
  if (status.staged + status.modified + status.untracked > 0) return "dirty";
  if (status.ahead + status.behind > 0) return "diverged";
  return "clean";
}
