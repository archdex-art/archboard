import { Ellipsis, FolderOpen, Globe, Star, SquareTerminal } from "lucide-react";
import { memo, useEffect, useRef } from "react";

import { BranchBadge, ChangeBadge, Chip, SyncBadge } from "@/components/GitBadge";
import { ProjectMenu } from "@/components/ProjectMenu";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/controls";
import { useActions } from "@/features/projects/useActions";
import { useApp } from "@/stores/app";
import { ago, cn, stateOf, tildePath } from "@/lib/format";
import type { RowProps } from "@/components/ProjectRow";

function CardImpl({
  project,
  status,
  error,
  selected,
  onSelect,
  onOpen,
  onVisible,
  onRemove,
}: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const actions = useActions();
  const launchers = useApp((s) => s.launchers);
  const defaultIde =
    launchers.find((l) => l.kind === "ide" && l.enabled && l.id === project.defaultIdeId) ??
    launchers.find((l) => l.kind === "ide" && l.enabled);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible(project.id);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible, project.id]);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const state = status ? stateOf(status) : "clean";
  const stack = [project.language, project.framework].filter(Boolean).join(" · ");

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(project.id)}
      onDoubleClick={() => onOpen(project)}
      className={cn(
        "group relative flex cursor-default flex-col gap-3 rounded-[10px] border p-3.5",
        "transition-colors duration-120",
        selected ? "border-line-strong bg-raised" : "border-line bg-panel hover:bg-raised",
      )}
    >
      <span className="state-gutter" data-state={status && state !== "clean" ? state : undefined} />

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">
              {project.name}
            </span>
            {project.isFavorite ? (
              <Star className="h-3 w-3 shrink-0 text-ink" strokeWidth={2} fill="currentColor" />
            ) : null}
          </div>
          <div className="mono truncate text-[11px] text-ink-faint">{tildePath(project.path)}</div>
        </div>
        <ProjectMenu project={project} status={status} onRemove={onRemove}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${project.name}`}
            onClick={(e) => e.stopPropagation()}
            className="-mr-1 -mt-1 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <Ellipsis className="h-3.5 w-3.5" />
          </Button>
        </ProjectMenu>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {error ? (
          <span className="mono text-[11.5px] text-alert">folder unavailable</span>
        ) : status?.initialized ? (
          <>
            <BranchBadge status={status} className="max-w-[150px]" />
            <SyncBadge status={status} />
            <ChangeBadge status={status} verbose />
          </>
        ) : status ? (
          <span className="mono text-[11.5px] text-ink-faint">not a git repository</span>
        ) : (
          <span className="h-1 w-16 animate-pulse rounded-full bg-line" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {stack ? <Chip>{stack}</Chip> : null}
        {project.tags.map((tag) => (
          <Chip key={tag}>#{tag}</Chip>
        ))}
        {status?.remote ? <Chip>{status.remote.service}</Chip> : null}
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-line pt-3">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation();
            void actions.openIde(project);
          }}
        >
          Open {defaultIde?.name ?? "IDE"}
        </Button>
        <Tooltip label="Open terminal" shortcut="⌘T">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Open terminal"
            onClick={(e) => {
              e.stopPropagation();
              void actions.openTerminal(project);
            }}
          >
            <SquareTerminal className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
        <Tooltip label="Reveal in Finder">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Reveal in Finder"
            onClick={(e) => {
              e.stopPropagation();
              void actions.openFolder(project);
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
        <Tooltip label={status?.remote ? `Open on ${status.remote.service}` : "No remote"}>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Open git remote"
            disabled={!status?.remote?.webUrl}
            onClick={(e) => {
              e.stopPropagation();
              void actions.openRemote(project);
            }}
          >
            <Globe className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
        <span className="mono ml-auto text-[11px] text-ink-faint">
          {ago(project.lastOpened) ?? "never"}
        </span>
      </div>
    </div>
  );
}

export const ProjectCard = memo(CardImpl);
