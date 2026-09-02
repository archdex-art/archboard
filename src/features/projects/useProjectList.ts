import { useMemo } from "react";

import { stateOf } from "@/lib/format";
import { useApp, type FilterId, type SortMode } from "@/stores/app";
import type { GitStatus, Project } from "@/types";

/**
 * zoxide's frecency: how often a project is opened, weighted by how recently.
 * Three projects in active rotation float to the top without any manual
 * pinning, which is what a launcher needs at three hundred entries.
 */
function frecency(project: Project) {
  if (!project.lastOpened) return 0;
  const ageHours = (Date.now() / 1000 - project.lastOpened) / 3600;
  const decay = ageHours < 1 ? 4 : ageHours < 24 ? 2 : ageHours < 168 ? 0.5 : 0.25;
  return (project.openCount + 1) * decay;
}

function matches(project: Project, status: GitStatus | undefined, needle: string) {
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

function passesFilter(project: Project, status: GitStatus | undefined, filter: FilterId) {
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

function compare(a: Project, b: Project, sort: SortMode, git: Record<number, GitStatus>) {
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

export function useProjectList() {
  const projects = useApp((s) => s.projects);
  const git = useApp((s) => s.git);
  const query = useApp((s) => s.query);
  const filter = useApp((s) => s.filter);
  const sort = useApp((s) => s.sort);

  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = projects.filter(
      (p) => passesFilter(p, git[p.id], filter) && (!needle || matches(p, git[p.id], needle)),
    );
    // Favorites lead every ordering except an explicit alphabetical sort.
    return filtered.sort((a, b) => {
      if (sort !== "name" && a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return compare(a, b, sort, git);
    });
  }, [projects, git, query, filter, sort]);
}

/** Counts shown next to each sidebar filter. */
export function useFilterCounts() {
  const projects = useApp((s) => s.projects);
  const git = useApp((s) => s.git);

  return useMemo(() => {
    const languages: Record<string, number> = {};
    let favorites = 0;
    let recent = 0;
    let repos = 0;
    let dirty = 0;
    let other = 0;

    for (const project of projects) {
      if (project.isFavorite) favorites += 1;
      if (project.lastOpened) recent += 1;
      if (project.gitInitialized) repos += 1;
      const status = git[project.id];
      if (status && (stateOf(status) === "dirty" || stateOf(status) === "conflict")) dirty += 1;
      if (project.language && KNOWN_LANGUAGES.includes(project.language)) {
        languages[project.language] = (languages[project.language] ?? 0) + 1;
      } else {
        other += 1;
      }
    }
    return { total: projects.length, favorites, recent, repos, dirty, languages, other };
  }, [projects, git]);
}
