//! Pure ranking, matching and filtering rules for the project list.
//! Kept free of React so the search and sort contracts can be tested directly.

import { stateOf } from "@/lib/format";
import type { FilterId, SortMode } from "@/stores/app";
import type { GitStatus, Project } from "@/types";

/**
 * Frecency, after zoxide: how often a project is opened, weighted by how
 * recently. Three projects in active rotation float to the top without any
 * manual pinning, which is what a launcher needs at three hundred entries.
 *
 * Frequency is damped logarithmically on purpose. Counting opens linearly
 * lets a project you hammered for a month last year outrank the one you
 * opened ten minutes ago, which is precisely backwards for a launcher: the
 * question it answers is "what am I working on now".
 */
export function frecency(project: Project) {
  if (!project.lastOpened) return 0;
  const ageHours = (Date.now() / 1000 - project.lastOpened) / 3600;
  const decay = ageHours < 1 ? 4 : ageHours < 24 ? 2 : ageHours < 168 ? 0.5 : 0.25;
  return (1 + Math.log2(1 + project.openCount)) * decay;
}

/**
 * Fields a query can hit, and how much a hit is worth.
 *
 * A launcher lives or dies on this ordering: typing `api` must surface the
 * project *called* api before every project whose path merely contains it.
 * Weights multiply fuzzysort's 0..1 score, and the best single field wins
 * rather than the sum, so one strong hit beats several weak ones.
 */
const FIELDS = [
  { key: "name", weight: 1 },
  { key: "tagText", weight: 0.9 },
  { key: "folder", weight: 0.85 },
  { key: "path", weight: 0.7 },
  { key: "framework", weight: 0.65 },
  { key: "language", weight: 0.6 },
  { key: "packageManager", weight: 0.55 },
  { key: "branch", weight: 0.5 },
  { key: "remote", weight: 0.45 },
] as const;

export const SEARCH_KEYS = FIELDS.map((f) => f.key);
const WEIGHTS = FIELDS.map((f) => f.weight);

/**
 * How loose an abbreviation may be. Measured, not guessed: contiguous matches
 * score 0.75-0.95, while heavy abbreviations like `aiast` -> "AI Assistant"
 * land around 0.30. Non-subsequences score nothing at all, so a low threshold
 * admits abbreviations without admitting noise.
 */
export const SEARCH_THRESHOLD = 0.2;

/** The flattened, searchable view of a project. */
export interface Searchable {
  project: Project;
  name: string;
  /** Last path segment: people search for the folder, not the whole path. */
  folder: string;
  path: string;
  language: string;
  framework: string;
  packageManager: string;
  branch: string;
  remote: string;
  tagText: string;
}

export function searchable(project: Project, status: GitStatus | undefined): Searchable {
  const remote = status?.remote;
  return {
    project,
    name: project.name,
    folder: project.path.slice(project.path.lastIndexOf("/") + 1),
    path: project.path,
    language: project.language ?? "",
    framework: project.framework ?? "",
    packageManager: project.packageManager ?? "",
    branch: status?.branch ?? "",
    remote: remote
      ? [remote.service, remote.host, remote.owner, remote.repo].filter(Boolean).join(" ")
      : (project.gitRemote ?? ""),
    tagText: project.tags.join(" "),
  };
}

/**
 * Combines fuzzysort's per-field results into one score. `results` is indexed
 * in the same order as `SEARCH_KEYS`; a field that did not match is `null`.
 */
export function weighQuery(results: ReadonlyArray<{ score: number } | null>) {
  let best = 0;
  for (let i = 0; i < results.length; i += 1) {
    const score = results[i]?.score ?? 0;
    if (score > 0) best = Math.max(best, score * WEIGHTS[i]);
  }
  return best;
}

export function passesFilter(project: Project, status: GitStatus | undefined, filter: FilterId) {
  if (filter === "all") return true;
  if (filter === "favorites") return project.isFavorite;
  if (filter === "recent") return project.lastOpened !== null;
  if (filter === "git") return project.gitInitialized;
  if (filter === "dirty") return status ? stateOf(status) === "dirty" || stateOf(status) === "conflict" : false;
  if (filter.startsWith("lang:")) {
    const language = filter.slice(5);
    if (language === "Other") {
      return !KNOWN_LANGUAGES.includes(project.language ?? "");
    }
    return project.language === language;
  }
  if (filter.startsWith("tag:")) return project.tags.includes(filter.slice(4));
  return true;
}

export const KNOWN_LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Rust",
  "Go",
  "Java",
  "Kotlin",
  "Swift",
  "C#",
  "Ruby",
  "PHP",
];

export function compare(a: Project, b: Project, sort: SortMode, git: Record<number, GitStatus>) {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    case "recent":
      return (b.lastOpened ?? 0) - (a.lastOpened ?? 0);
    case "changes": {
      const count = (p: Project) => {
        const s = git[p.id];
        return s ? s.staged + s.modified + s.untracked + s.conflicted : -1;
      };
      return count(b) - count(a);
    }
    default:
      return frecency(b) - frecency(a) || a.name.localeCompare(b.name);
  }
}
