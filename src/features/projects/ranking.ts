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

export function matches(project: Project, status: GitStatus | undefined, needle: string) {
  const haystack = [
    project.name,
    project.path,
    project.language,
    project.framework,
    project.packageManager,
    status?.branch,
    status?.remote?.host,
    status?.remote?.owner,
    status?.remote?.repo,
    project.gitRemote,
    ...project.tags,
  ];
  return haystack.some((value) => value?.toLowerCase().includes(needle));
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
