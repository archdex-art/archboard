import { ProjectCard } from "@/components/ProjectCard";
import { ProjectRow } from "@/components/ProjectRow";
import type { ProjectGroup } from "@/features/projects/useProjectList";
import type { ViewMode } from "@/stores/app";
import type { AppError, GitStatus, Project } from "@/types";

interface GroupedListProps {
  groups: ProjectGroup[];
  view: ViewMode;
  selectedId: number | null;
  git: Record<number, GitStatus>;
  gitErrors: Record<number, AppError>;
  onSelect: (id: number) => void;
  onOpen: (project: Project) => void;
  onVisible: (id: number) => void;
  onRemove: (project: Project) => void;
}

export function GroupedList({
  groups,
  view,
  selectedId,
  git,
  gitErrors,
  onSelect,
  onOpen,
  onVisible,
  onRemove,
}: GroupedListProps) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.label}>
          <div className="sticky top-0 z-[5] border-b border-line/50 bg-canvas px-3 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              {group.label}
            </span>
            <span className="ml-1.5 text-[10px] text-ink-faint/60">
              {group.projects.length}
            </span>
          </div>
          {view === "list" ? (
            <div>
              {group.projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  status={git[project.id]}
                  error={gitErrors[project.id]}
                  selected={project.id === selectedId}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onVisible={onVisible}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-2.5 p-3">
              {group.projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  status={git[project.id]}
                  error={gitErrors[project.id]}
                  selected={project.id === selectedId}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onVisible={onVisible}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
