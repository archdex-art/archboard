import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { tildePath } from "@/lib/format";
import { api } from "@/lib/ipc";
import { useApp } from "@/stores/app";
import type { Project } from "@/types";

export interface AddProjectFlow {
  start: () => Promise<void>;
  element: ReactNode;
}

/**
 * Native folder picker → validate → detect → store. If the folder is not a
 * repository, the user is asked before anything is written to it: Archboard
 * never runs `git init` on its own unless that has been switched on in
 * settings.
 */
export function useAddProject(): AddProjectFlow {
  const upsertProject = useApp((s) => s.upsertProject);
  const select = useApp((s) => s.select);
  const refreshGit = useApp((s) => s.refreshGit);
  const notify = useApp((s) => s.notify);
  const fail = useApp((s) => s.fail);
  const autoInit = useApp((s) => s.settings.auto_init_git === "true");

  const [pending, setPending] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    let picked: string | null;
    try {
      picked = (await open({ directory: true, multiple: false, title: "Choose a project folder" })) as
        | string
        | null;
    } catch (e) {
      fail(e);
      return;
    }
    if (!picked) return;

    try {
      const { project, needsGitInit } = await api.addProject(picked);
      upsertProject(project);
      select(project.id);
      void refreshGit([project.id], true);

      if (!needsGitInit) return;
      if (autoInit) {
        await api.gitInit(project.id);
        void refreshGit([project.id], true);
        notify({ tone: "info", title: `Initialized a git repository in ${project.name}` });
        return;
      }
      setPending(project);
    } catch (e) {
      fail(e);
    }
  }, [autoInit, fail, notify, refreshGit, select, upsertProject]);

  const element = pending ? (
    <Dialog
      open
      onOpenChange={(next) => !next && setPending(null)}
      title="Git repository not detected"
      description={
        <>
          <span className="mono block break-all text-ink-dim">{tildePath(pending.path)}</span>
          <span className="mt-2 block">
            Initializing runs <span className="mono text-ink">git init</span> in this folder. Nothing
            is committed and no files are changed.
          </span>
        </>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
            Not now
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.gitInit(pending.id);
                upsertProject(await api.getProject(pending.id));
                void refreshGit([pending.id], true);
                notify({ tone: "info", title: `Initialized a git repository in ${pending.name}` });
                setPending(null);
              } catch (e) {
                fail(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Initialize git
          </Button>
        </>
      }
    />
  ) : null;

  return { start, element };
}
