import { FolderGit2, Telescope } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GroupedList } from "@/components/GroupedList";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectRow } from "@/components/ProjectRow";
import { Welcome } from "@/components/Welcome";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useActions } from "@/features/projects/useActions";
import { useGroupedProjects, useProjectList } from "@/features/projects/useProjectList";
import { useShortcuts } from "@/features/shortcuts/useShortcuts";
import { pretty } from "@/lib/accelerator";
import { tildePath } from "@/lib/format";
import { useApp } from "@/stores/app";
import type { Project } from "@/types";

export function Dashboard({ onAdd, onScan, onFirstRunScan }: { onAdd: () => void; onScan: () => void; onFirstRunScan: () => void }) {
  const projects = useProjectList();
  const git = useApp((s) => s.git);
  const gitErrors = useApp((s) => s.gitErrors);
  const view = useApp((s) => s.view);
  const query = useApp((s) => s.query);
  const filter = useApp((s) => s.filter);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const refreshGit = useApp((s) => s.refreshGit);
  const loaded = useApp((s) => s.loaded);
  const firstRun = useApp((s) => s.firstRun);
  const setFirstRunDone = useApp((s) => s.setFirstRunDone);
  const globalShortcut = useApp((s) => s.settings.global_shortcut ?? "Alt+K");
  const actions = useActions();

  const [pendingRemoval, setPendingRemoval] = useState<Project | null>(null);

  // Rows report themselves as they scroll into view; the ids are coalesced into
  // one batched call per frame so a fast scroll costs a single round trip.
  const queued = useRef<number[]>([]);
  const timer = useRef<number | null>(null);
  const onVisible = useCallback(
    (id: number) => {
      queued.current.push(id);
      if (timer.current !== null) return;
      timer.current = window.setTimeout(() => {
        const ids = queued.current;
        queued.current = [];
        timer.current = null;
        void refreshGit(ids);
      }, 40);
    },
    [refreshGit],
  );

  const openDefault = useCallback((project: Project) => void actions.openIde(project), [actions]);

  const groups = useGroupedProjects(projects);

  // Arrow keys have to walk what the eye sees. Grouping re-partitions the list,
  // so the rendered order is the groups concatenated — stepping through the
  // flat sort instead makes the cursor jump between distant rows.
  const ordered = useMemo(
    () => (groups ? groups.flatMap((group) => group.projects) : projects),
    [groups, projects],
  );

  // The list always has a cursor, so arrow keys and ⌘T / ⌘I work the instant
  // the window opens. Only ever done once: closing the pane must stay closed.
  const primed = useRef(false);
  useEffect(() => {
    if (primed.current || ordered.length === 0) return;
    primed.current = true;
    if (useApp.getState().selectedId === null) select(ordered[0].id);
  }, [ordered, select]);

  // Navigation is structural, not a preference: arrows and j/k are fixed, and
  // Enter opens whatever the cursor is on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))) return;
      if (ordered.length === 0) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const index = ordered.findIndex((p) => p.id === selectedId);
      const move = (delta: number) => {
        e.preventDefault();
        const next = Math.min(Math.max(index + delta, 0), ordered.length - 1);
        select(ordered[index === -1 ? 0 : next].id);
      };

      if (e.key === "ArrowDown" || e.key === "j") return move(1);
      if (e.key === "ArrowUp" || e.key === "k") return move(-1);

      const project = ordered[index];
      if (project && e.key === "Enter") {
        e.preventDefault();
        void actions.openIde(project);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, ordered, select, selectedId]);

  // Everything that acts on the selected project, through bindings the user
  // can change.
  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;
  useShortcuts({
    "open-ide": () => selectedProject && void actions.openIde(selectedProject),
    "open-terminal": () => selectedProject && void actions.openTerminal(selectedProject),
    "open-folder": () => selectedProject && void actions.openFolder(selectedProject),
    "open-remote": () => selectedProject && void actions.openRemote(selectedProject),
    refresh: () => selectedProject && void actions.refresh(selectedProject),
    favorite: () => selectedProject && void actions.toggleFavorite(selectedProject),
  });

  if (!loaded) {
    // Placeholder rows rather than an empty void: the board is about to have
    // content, and a flash of "your board is empty" would be a lie.
    return (
      <div className="flex-1 space-y-1 px-2 py-2" aria-busy="true" aria-label="Loading projects">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-[46px] items-center gap-3 rounded-[8px] px-3">
            <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-full bg-line" />
            <div className="flex-1 space-y-1.5">
              <span className="block h-2.5 w-40 animate-pulse rounded-full bg-line" />
              <span className="block h-2 w-64 animate-pulse rounded-full bg-line/60" />
            </div>
            <span className="h-2 w-16 animate-pulse rounded-full bg-line" />
          </div>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    if (firstRun) {
      return (
        <Welcome
          globalShortcut={globalShortcut}
          onFind={() => { void setFirstRunDone(); onFirstRunScan(); }}
          onAdd={() => { void setFirstRunDone(); onAdd(); }}
        />
      );
    }
    const empty = query || filter !== "all";
    return (
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="max-w-sm text-center">
          <FolderGit2 className="mx-auto h-6 w-6 text-ink-faint" strokeWidth={1.5} />
          <h2 className="mt-3 text-[14px] font-semibold tracking-[-0.01em]">
            {empty ? "Nothing matches that" : "Your board is empty"}
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">
            {empty
              ? "Try a different search, or clear the filter in the sidebar."
              : "Add a project folder, or let Archboard find the repositories already on this Mac."}
          </p>
          {!empty ? (
            <>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="primary" size="sm" onClick={onAdd}>
                  Add project
                </Button>
                <Button variant="secondary" size="sm" onClick={onScan}>
                  <Telescope className="h-3.5 w-3.5" />
                  Find projects
                </Button>
              </div>
              <p className="mt-5 text-[12px] text-ink-faint">
                Press <kbd className="mono text-ink-dim">{pretty(globalShortcut)}</kbd> from any
                application to summon Archboard.
              </p>
            </>
          ) : null}
        </div>
      </div>
    );
  }
  const shared = (project: Project) => ({
    project,
    status: git[project.id],
    error: gitErrors[project.id],
    selected: project.id === selectedId,
    onSelect: select,
    onOpen: openDefault,
    onVisible,
    onRemove: setPendingRemoval,
  });

  return (
    <>
      <div
        role="listbox"
        aria-label="Projects"
        tabIndex={0}
        aria-activedescendant={selectedId !== null ? `project-${selectedId}` : undefined}
        className={
          groups
            ? // No padding above the first row: a sticky heading pins to the
              // scrollport edge, and any top padding leaves a strip where the
              // row underneath shows through above the heading.
              "@container flex-1 overflow-y-auto px-2 pb-2 outline-none"
            : view === "list"
              ? "@container flex-1 overflow-y-auto px-2 py-2 outline-none"
              : "@container grid flex-1 grid-cols-[repeat(auto-fill,minmax(268px,1fr))] content-start gap-2.5 overflow-y-auto p-3 outline-none"
        }
      >
        {groups ? (
          <GroupedList
            groups={groups}
            view={view}
            selectedId={selectedId}
            git={git}
            gitErrors={gitErrors}
            onSelect={select}
            onOpen={openDefault}
            onVisible={onVisible}
            onRemove={setPendingRemoval}
          />
        ) : (
          projects.map((project) =>
            view === "list" ? (
              <ProjectRow key={project.id} {...shared(project)} />
            ) : (
              <ProjectCard key={project.id} {...shared(project)} />
            ),
          )
        )}
      </div>

      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={(next) => !next && setPendingRemoval(null)}
        title={`Remove ${pendingRemoval?.name ?? ""} from Archboard?`}
        description={
          <>
            The folder stays exactly where it is. Only Archboard's entry is deleted.
            <span className="mono mt-2 block break-all text-ink-faint">
              {pendingRemoval ? tildePath(pendingRemoval.path) : ""}
            </span>
          </>
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (pendingRemoval) void actions.remove(pendingRemoval);
                setPendingRemoval(null);
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </>
  );
}
