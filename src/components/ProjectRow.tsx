import { Ellipsis, Star } from "lucide-react";
import { memo, useEffect, useRef } from "react";

import { BranchBadge, ChangeBadge, Chip, SyncBadge } from "@/components/GitBadge";
import { ProjectMenu } from "@/components/ProjectMenu";
import { Button } from "@/components/ui/button";
import { useActions } from "@/features/projects/useActions";
import { ago, cn, stateOf, tildePath } from "@/lib/format";
import type { AppError, GitStatus, Project } from "@/types";

export interface RowProps {
  project: Project;
  status?: GitStatus;
  error?: AppError;
  selected: boolean;
  onSelect: (id: number) => void;
  onOpen: (project: Project) => void;
  onVisible: (id: number) => void;
  onRemove: (project: Project) => void;
}

function RowImpl({
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

  // Git is read only for rows the user can actually see. A board of a thousand
  // projects therefore costs a thousand database rows and nothing else.
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
      id={`project-${project.id}`}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={() => onSelect(project.id)}
      onDoubleClick={() => onOpen(project)}
      className={cn(
        // Fixed columns so branch, changes and age line up vertically down the
        // whole list: this list is read by scanning a column, not a row.
        // The breakpoints are container queries, because the list narrows when
        // the detail pane opens while the window itself does not.
        "group relative grid h-[46px] cursor-default items-center gap-x-3 rounded-[8px] pl-3 pr-2",
        "grid-cols-[14px_minmax(0,1fr)_78px_24px] transition-colors duration-120",
        "@[560px]:grid-cols-[14px_minmax(0,1fr)_124px_78px_32px_24px]",
        "@[620px]:grid-cols-[14px_minmax(0,1.3fr)_minmax(0,1fr)_124px_78px_32px_24px]",
        selected ? "bg-raised" : "hover:bg-panel",
      )}
    >
      <span className="state-gutter" data-state={status && state !== "clean" ? state : undefined} />

      <button
        className="no-drag shrink-0 text-ink-faint transition-colors hover:text-ink"
        aria-label={project.isFavorite ? "Remove from favorites" : "Add to favorites"}
        onClick={(e) => {
          e.stopPropagation();
          void actions.toggleFavorite(project);
        }}
      >
        <Star
          className={cn("h-3.5 w-3.5", project.isFavorite && "text-ink")}
          strokeWidth={2}
          fill={project.isFavorite ? "currentColor" : "none"}
        />
      </button>

      <div className="flex min-w-0 flex-col justify-center">
        <span className="truncate text-[13px] font-medium leading-tight tracking-[-0.005em]">
          {project.name}
        </span>
        <span className="mono truncate text-[11px] leading-tight text-ink-faint">
          {tildePath(project.path)}
        </span>
      </div>

      <div
        className="hidden min-w-0 items-center gap-1.5 overflow-hidden @[620px]:flex"
        style={{ maskImage: "linear-gradient(to right, black calc(100% - 20px), transparent)" }}
      >
        {stack ? <Chip>{stack}</Chip> : null}
        {status?.remote ? <Chip>{status.remote.service}</Chip> : null}
        {project.tags.slice(0, 2).map((tag) => (
          <Chip key={tag} className="text-ink-faint">
            #{tag}
          </Chip>
        ))}
      </div>

      <div className="hidden min-w-0 items-center gap-2 @[560px]:flex">
        {error ? (
          <span className="mono truncate text-[11.5px] text-alert">unavailable</span>
        ) : status?.initialized ? (
          <>
            <BranchBadge status={status} />
            <SyncBadge status={status} />
          </>
        ) : status ? (
          <span className="mono text-[11.5px] text-ink-faint">no git</span>
        ) : (
          <span className="h-1 w-8 animate-pulse rounded-full bg-line" />
        )}
      </div>

      <div className="flex justify-end">
        {status?.initialized && !error ? <ChangeBadge status={status} /> : null}
      </div>

      <span className="mono hidden text-right text-[11px] text-ink-faint @[560px]:block">
        {ago(project.lastOpened) ?? "—"}
      </span>

      <ProjectMenu project={project} status={status} onRemove={onRemove}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${project.name}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <Ellipsis className="h-3.5 w-3.5" />
        </Button>
      </ProjectMenu>
    </div>
  );
}

export const ProjectRow = memo(RowImpl);
