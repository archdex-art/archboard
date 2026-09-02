import * as Primitive from "@radix-ui/react-dialog";
import fuzzysort from "fuzzysort";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BranchBadge, ChangeBadge } from "@/components/GitBadge";
import { useActions } from "@/features/projects/useActions";
import {
  SEARCH_KEYS,
  SEARCH_THRESHOLD,
  searchable,
  weighQuery,
} from "@/features/projects/ranking";
import { cn, tildePath } from "@/lib/format";
import { useApp } from "@/stores/app";
import type { GitStatus, Project } from "@/types";

type Command = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

/**
 * ⌘K. Deliberately an in-window listener rather than a system-wide hotkey:
 * registering a global shortcut on macOS costs an Accessibility permission
 * prompt, and the window is already focused when you reach for this.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onAdd,
  onScan,
  onSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: () => void;
  onScan: () => void;
  onSettings: () => void;
}) {
  const projects = useApp((s) => s.projects);
  const git = useApp((s) => s.git);
  const select = useApp((s) => s.select);
  const actions = useActions();

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  const needle = query.trim();
  const lowered = needle.toLowerCase();

  const matches = useMemo(() => {
    const rows = projects.map((p) => searchable(p, git[p.id]));
    if (!needle) {
      // No query: the palette is a recency list.
      return rows
        .sort((a, b) => (b.project.lastOpened ?? 0) - (a.project.lastOpened ?? 0))
        .slice(0, 40)
        .map((row) => ({ project: row.project, nameHits: null as readonly number[] | null }));
    }
    return fuzzysort
      .go(needle, rows, {
        keys: SEARCH_KEYS as unknown as string[],
        threshold: SEARCH_THRESHOLD,
        limit: 40,
        scoreFn: (result) => weighQuery(result) * (result.obj.project.isFavorite ? 1.08 : 1),
      })
      .map((result) => ({
        project: result.obj.project,
        // Index 0 is `name`; its matched characters get emphasised.
        nameHits: (result[0]?.indexes as readonly number[] | undefined) ?? null,
      }));
  }, [projects, git, needle]);

  const commands = useMemo<Command[]>(() => {
    const all: Command[] = [
      { id: "add", label: "Add project…", hint: "⌘N", run: onAdd },
      { id: "scan", label: "Find projects on this Mac…", run: onScan },
      { id: "settings", label: "Open settings", hint: "⌘,", run: onSettings },
    ];
    return lowered ? all.filter((c) => c.label.toLowerCase().includes(lowered)) : all;
  }, [lowered, onAdd, onScan, onSettings]);

  const rows = useMemo(
    () => [
      ...matches.map((match) => ({ kind: "project" as const, ...match })),
      ...commands.map((command) => ({ kind: "command" as const, command })),
    ],
    [matches, commands],
  );

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  function activate(index: number) {
    const row = rows[index];
    if (!row) return;
    onOpenChange(false);
    if (row.kind === "command") {
      row.command.run();
      return;
    }
    select(row.project.id);
    void actions.openIde(row.project);
  }

  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px] animate-fade" />
        <Primitive.Content
          aria-label="Search projects"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              activate(cursor);
            }
          }}
          className="fixed left-1/2 top-[14%] z-[70] w-[560px] max-w-[calc(100vw-3rem)] -translate-x-1/2 animate-rise overflow-hidden rounded-[12px] border border-line-strong bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
        >
          <Primitive.Title className="sr-only">Search projects</Primitive.Title>
          <div className="flex items-center gap-2.5 border-b border-line px-3.5">
            <Search className="h-4 w-4 shrink-0 text-ink-faint" />
            <input
              autoFocus
              value={query}
              spellCheck={false}
              role="combobox"
              aria-expanded
              aria-controls="palette-results"
              aria-autocomplete="list"
              aria-activedescendant={rows.length > 0 ? `palette-row-${cursor}` : undefined}
              aria-label="Search projects and commands"
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              placeholder="Jump to a project…"
              className="h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>

          <div
            ref={listRef}
            id="palette-results"
            role="listbox"
            aria-label="Results"
            className="max-h-[380px] overflow-y-auto p-1.5"
          >
            {rows.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[12.5px] text-ink-faint">
                Nothing matches “{query}”.
              </p>
            ) : null}

            {rows.map((row, index) => {
              const active = index === cursor;
              const key = row.kind === "project" ? `p${row.project.id}` : `c${row.command.id}`;
              return (
                <div
                  key={key}
                  id={`palette-row-${index}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => activate(index)}
                  className={cn(
                    "flex h-[38px] cursor-default items-center gap-3 rounded-[7px] px-2.5",
                    active ? "bg-raised" : "",
                  )}
                >
                  {row.kind === "project" ? (
                    <ProjectRowLine
                      project={row.project}
                      status={git[row.project.id]}
                      nameHits={row.nameHits}
                    />
                  ) : (
                    <>
                      <span className="flex-1 truncate text-[13px] text-ink-dim">
                        {row.command.label}
                      </span>
                      {row.command.hint ? (
                        <span className="mono text-[11px] text-ink-faint">{row.command.hint}</span>
                      ) : null}
                    </>
                  )}
                  {active ? (
                    <CornerDownLeft className="h-3 w-3 shrink-0 text-ink-faint" strokeWidth={2} />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[11px] text-ink-faint">
            <span className="mono">↑↓</span> navigate
            <span className="mono">↵</span> open in editor
            <span className="mono">esc</span> close
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

/** Emphasises the characters the query actually matched. */
function Highlighted({ text, hits }: { text: string; hits: readonly number[] | null }) {
  if (!hits || hits.length === 0) return <>{text}</>;
  const marked = new Set(hits);
  return (
    <>
      {Array.from(text, (char, i) =>
        marked.has(i) ? (
          <mark key={i} className="bg-transparent font-semibold text-ink">
            {char}
          </mark>
        ) : (
          <span key={i}>{char}</span>
        ),
      )}
    </>
  );
}

function ProjectRowLine({
  project,
  status,
  nameHits,
}: {
  project: Project;
  status?: GitStatus;
  nameHits: readonly number[] | null;
}) {
  return (
    <>
      <span className="truncate text-[13px] font-medium text-ink-dim">
        <Highlighted text={project.name} hits={nameHits} />
      </span>
      <span className="mono flex-1 truncate text-[11px] text-ink-faint">
        {tildePath(project.path)}
      </span>
      {status?.initialized ? (
        <span className="flex shrink-0 items-center gap-2.5">
          <BranchBadge status={status} className="max-w-[110px]" />
          <ChangeBadge status={status} />
        </span>
      ) : null}
    </>
  );
}
