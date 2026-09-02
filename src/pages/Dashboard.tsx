import { FolderGit2, Telescope } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProjectCard } from "@/components/ProjectCard";
import { ProjectRow } from "@/components/ProjectRow";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useActions } from "@/features/projects/useActions";
import { useProjectList } from "@/features/projects/useProjectList";
import { tildePath } from "@/lib/format";
import { useApp } from "@/stores/app";
import type { Project } from "@/types";

export function Dashboard({ onAdd, onScan }: { onAdd: () => void; onScan: () => void }) {
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

  // The list always has a cursor, so arrow keys and ⌘T / ⌘I work the instant
  // the window opens. Only ever done once: closing the pane must stay closed.
  const primed = useRef(false);
  useEffect(() => {
    if (primed.current || projects.length === 0) return;
    primed.current = true;
    if (useApp.getState().selectedId === null) select(projects[0].id);
  }, [projects, select]);

  // Keyboard navigation over the visible result set.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (projects.length === 0) return;

      const index = projects.findIndex((p) => p.id === selectedId);
      const move = (delta: number) => {
        e.preventDefault();
        const next = Math.min(Math.max(index + delta, 0), projects.length - 1);
        select(projects[index === -1 ? 0 : next].id);
      };

      if (e.key === "ArrowDown" || e.key === "j") return move(1);
      if (e.key === "ArrowUp" || e.key === "k") return move(-1);

      const project = projects[index];
      if (!project) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void actions.openIde(project);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        void actions.openTerminal(project);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        void actions.openIde(project);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        void actions.refresh(project);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, projects, select, selectedId]);

  if (loaded && projects.length === 0) {
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
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="primary" size="sm" onClick={onAdd}>
                Add project
              </Button>
              <Button variant="secondary" size="sm" onClick={onScan}>
                <Telescope className="h-3.5 w-3.5" />
                Find projects
              </Button>
            </div>
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
        className={
          view === "list"
            ? "@container flex-1 overflow-y-auto px-2 py-2"
            : "@container grid flex-1 grid-cols-[repeat(auto-fill,minmax(268px,1fr))] content-start gap-2.5 overflow-y-auto p-3"
        }
      >
        {projects.map((project) =>
          view === "list" ? (
            <ProjectRow key={project.id} {...shared(project)} />
          ) : (
            <ProjectCard key={project.id} {...shared(project)} />
          ),
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
