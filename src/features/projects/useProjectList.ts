import { useMemo } from "react";
import fuzzysort from "fuzzysort";

import { stateOf } from "@/lib/format";
import {
  KNOWN_LANGUAGES,
  SEARCH_KEYS,
  SEARCH_THRESHOLD,
  compare,
  passesFilter,
  searchable,
  weighQuery,
  type Searchable,
} from "@/features/projects/ranking";
import { useApp } from "@/stores/app";

export function useProjectList() {
  const projects = useApp((s) => s.projects);
  const git = useApp((s) => s.git);
  const query = useApp((s) => s.query);
  const filter = useApp((s) => s.filter);
  const sort = useApp((s) => s.sort);

  return useMemo(() => {
    const eligible = projects.filter((p) => passesFilter(p, git[p.id], filter));
    const needle = query.trim();

    if (needle) {
      // Relevance replaces the chosen sort while searching: when you have typed
      // a query, the best match is the answer, not the most recently opened.
      const rows: Searchable[] = eligible.map((p) => searchable(p, git[p.id]));
      return fuzzysort
        .go(needle, rows, {
          keys: SEARCH_KEYS as unknown as string[],
          threshold: SEARCH_THRESHOLD,
          limit: 0,
          scoreFn: (result) => {
            const base = weighQuery(result);
            // A favorite is a standing instruction about what matters.
            return base * (result.obj.project.isFavorite ? 1.08 : 1);
          },
        })
        .map((result) => result.obj.project);
    }

    // Favorites lead every ordering except an explicit alphabetical sort.
    return eligible.sort((a, b) => {
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
