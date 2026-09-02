import { useMemo } from "react";

import { stateOf } from "@/lib/format";
import { compare, matches, passesFilter } from "@/features/projects/ranking";
import { useApp } from "@/stores/app";
import { KNOWN_LANGUAGES } from "@/features/projects/ranking";

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
