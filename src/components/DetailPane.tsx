import {
  FolderOpen,
  Globe,
  RefreshCw,
  Rocket,
  SquareTerminal,
  Star,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { BranchBadge, ChangeBadge, Chip, SyncBadge } from "@/components/GitBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { CommandsBlock } from "@/features/commands/CommandsBlock";
import { useActions } from "@/features/projects/useActions";
import { agoIso, cn, tildePath } from "@/lib/format";
import { api } from "@/lib/ipc";
import { useApp } from "@/stores/app";
import type { Commit, Project, ProjectDetail } from "@/types";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5">
      <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DetailPane({ project, onClose }: { project: Project; onClose: () => void }) {
  const status = useApp((s) => s.git[project.id]);
  const gitError = useApp((s) => s.gitErrors[project.id]);
  const refreshing = useApp((s) => s.refreshing.has(project.id));
  const launchers = useApp((s) => s.launchers);
  const tags = useApp((s) => s.tags);
  const upsertProject = useApp((s) => s.upsertProject);
  const fail = useApp((s) => s.fail);
  const actions = useActions();

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [wsCount, setWsCount] = useState(0);

  useEffect(() => {
    setDetail(null);
    setCommits([]);
    setBranches([]);
    setNotes(project.notes ?? "");
    setWsCount(0);
    let live = true;
    void api
      .projectDetail(project.id)
      .then((d) => live && setDetail(d))
      // The pane's primary read. If this fails the folder is gone or the
      // backend is unreachable, and an empty pane would look like a project
      // with nothing in it.
      .catch((e) => live && fail(e, { detail: tildePath(project.path) }));
    void api
      .gitRecentCommits(project.id, 6)
      .then((c) => live && setCommits(c))
      // These two already answer "git could not tell me" with an empty list,
      // so the only way they reject is the failure projectDetail just
      // reported. One toast per cause, not three.
      .catch(() => {});
    void api
      .gitBranches(project.id)
      .then((b) => live && setBranches(b.slice(0, 8)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [project.id, project.notes, project.path, fail]);

  const ides = launchers.filter((l) => l.kind === "ide" && l.enabled);
  const defaultIde = ides.find((l) => l.id === project.defaultIdeId) ?? ides[0];
  const stack = [project.language, project.framework, project.packageManager].filter(Boolean);

  async function saveNotes() {
    if ((project.notes ?? "") === notes) return;
    try {
      upsertProject(await api.updateProject(project.id, { notes }));
    } catch (e) {
      fail(e);
    }
  }

  async function toggleTag(tagId: number, tagName: string) {
    const next = project.tags.includes(tagName)
      ? tags.filter((t) => project.tags.includes(t.name) && t.id !== tagId).map((t) => t.id)
      : [...tags.filter((t) => project.tags.includes(t.name)).map((t) => t.id), tagId];
    try {
      upsertProject(await api.setProjectTags(project.id, next));
    } catch (e) {
      fail(e);
    }
  }

  return (
    <aside className="flex h-full w-[318px] shrink-0 flex-col overflow-y-auto border-l border-line bg-canvas">
      <div className="sticky top-0 z-10 flex items-start gap-2 bg-canvas px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.015em]">{project.name}</h2>
            <button
              aria-label={project.isFavorite ? "Remove from favorites" : "Add to favorites"}
              className="text-ink-faint transition-colors hover:text-ink"
              onClick={() => void actions.toggleFavorite(project)}
            >
              <Star
                className={cn("h-3.5 w-3.5", project.isFavorite && "text-ink")}
                strokeWidth={2}
                fill={project.isFavorite ? "currentColor" : "none"}
              />
            </button>
          </div>
          <p className="mono mt-0.5 truncate text-[11px] text-ink-faint" title={project.path}>
            {tildePath(project.path)}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5 px-4 pb-4">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          onClick={() => void actions.openIde(project)}
        >
          Open {defaultIde?.name ?? "IDE"}
        </Button>
        {ides.length > 1 ? (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm" aria-label="Open with a different editor">
                ⌄
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>Open with</MenuLabel>
              {ides.map((ide) => (
                <MenuItem key={ide.id} onSelect={() => void actions.openIde(project, ide.id)}>
                  {ide.name}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
        <Button
          variant="secondary"
          size="icon"
          aria-label="Open terminal"
          onClick={() => void actions.openTerminal(project)}
        >
          <SquareTerminal className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Reveal in Finder"
          onClick={() => void actions.openFolder(project)}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Open git remote"
          disabled={!status?.remote?.webUrl}
          onClick={() => void actions.openRemote(project)}
        >
          <Globe className="h-3.5 w-3.5" />
        </Button>
      </div>

      {wsCount > 0 ? (
        <div className="px-4 pb-4">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={async () => {
              try {
                await api.launchWorkspace(project.id);
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Rocket className="h-3.5 w-3.5" />
            Launch workspace
            <span className="ml-auto text-[10.5px] text-ink-faint">
              IDE + {wsCount} {wsCount === 1 ? "command" : "commands"}
            </span>
          </Button>
        </div>
      ) : null}

      <Block title="Technology">
        {stack.length === 0 && !detail?.detection.tags.length ? (
          <p className="text-[12.5px] text-ink-faint">Nothing recognisable at the top level.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {stack.map((item) => (
              <Chip key={item}>{item}</Chip>
            ))}
            {detail?.detection.tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        )}
      </Block>

      <Block title="Git">
        {gitError ? (
          <p className="text-[12.5px] text-alert">{gitError.message}</p>
        ) : !status ? (
          <p className="text-[12.5px] text-ink-faint">Reading repository…</p>
        ) : !status.initialized ? (
          <p className="text-[12.5px] text-ink-dim">This folder is not a git repository.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <BranchBadge status={status} />
              <SyncBadge status={status} />
              <ChangeBadge status={status} verbose />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh git status"
                className="ml-auto"
                onClick={() => void actions.refresh(project)}
              >
                <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
              </Button>
            </div>
            {status.upstream ? (
              <p className="mono text-[11px] text-ink-faint">tracking {status.upstream}</p>
            ) : (
              <p className="mono text-[11px] text-ink-faint">no upstream branch</p>
            )}
            {status.remote ? (
              <button
                className="mono block max-w-full truncate text-left text-[11.5px] text-ink-dim underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
                onClick={() => void actions.openRemote(project)}
              >
                {status.remote.service} · {status.remote.host}/{status.remote.owner}/
                {status.remote.repo}
              </button>
            ) : null}
          </div>
        )}
      </Block>

      {commits.length > 0 ? (
        <Block title="Recent commits">
          <ul className="space-y-2">
            {commits.map((commit) => (
              <li key={commit.sha} className="flex gap-2">
                <span className="mono shrink-0 text-[11px] text-ink-faint">{commit.shortSha}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] leading-tight text-ink-dim">
                    {commit.subject}
                  </p>
                  <p className="text-[11px] text-ink-faint">
                    {commit.author} · {agoIso(commit.date)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {branches.length > 1 ? (
        <Block title="Branches">
          <div className="flex flex-wrap gap-1.5">
            {branches.map((branch) => (
              <Chip key={branch} className={cn(branch === status?.branch && "text-ink")}>
                <span className="mono">{branch}</span>
              </Chip>
            ))}
          </div>
        </Block>
      ) : null}

      {tags.length > 0 ? (
        <Block title="Tags">
          <div className="space-y-1">
            {tags.map((tag) => (
              <label key={tag.id} className="flex h-6 items-center gap-2 text-[12.5px] text-ink-dim">
                <Checkbox
                  checked={project.tags.includes(tag.name)}
                  onCheckedChange={() => void toggleTag(tag.id, tag.name)}
                />
                #{tag.name}
              </label>
            ))}
          </div>
        </Block>
      ) : null}

      <Block title="Commands">
        <CommandsBlock
          projectId={project.id}
          onCommandsChange={(cmds) => setWsCount(cmds.filter((c) => c.inWorkspace).length)}
        />
      </Block>

      <Block title="Notes">
        <Textarea
          rows={3}
          value={notes}
          placeholder="Anything you need to remember next time you open this."
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveNotes()}
        />
      </Block>

      {detail?.readme ? (
        <Block title="Readme">
          <pre className="mono max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-ink-dim">
            {detail.readme.slice(0, 2000)}
          </pre>
        </Block>
      ) : null}
    </aside>
  );
}
