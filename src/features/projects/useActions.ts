import { useCallback, useMemo } from "react";

import { api, toAppError } from "@/lib/ipc";
import { useApp, type SettingsTab, type Toast } from "@/stores/app";
import type { Project } from "@/types";

/**
 * Turns a launcher failure into a button that goes somewhere useful, so
 * "Could not open Cursor" is always followed by "Configure Cursor".
 */
function recovery(
  error: unknown,
  tab: SettingsTab,
  openSettings: (tab?: SettingsTab) => void,
): Partial<Toast> {
  const app = toAppError(error);
  if (app.action !== "configure_launcher" && app.action !== "open_settings") return {};
  return { action: { label: "Open settings", run: () => openSettings(tab) } };
}

/**
 * Every way a project can be opened, with the failure handling attached.
 * Components call these directly so no launch path can silently do nothing.
 */
export function useActions() {
  const upsertProject = useApp((s) => s.upsertProject);
  const refreshGit = useApp((s) => s.refreshGit);
  const notify = useApp((s) => s.notify);
  const fail = useApp((s) => s.fail);
  const openSettings = useApp((s) => s.openSettings);

  const afterOpen = useCallback(
    async (id: number) => {
      try {
        upsertProject(await api.getProject(id));
      } catch {
        // The open succeeded; a stale timestamp is not worth a second error.
      }
    },
    [upsertProject],
  );

  return useMemo(
    () => ({
      async openIde(project: Project, launcherId?: number) {
        try {
          await api.openInIde(project.id, launcherId);
          await afterOpen(project.id);
        } catch (e) {
          fail(e, recovery(e, "ides", openSettings));
        }
      },

      async openTerminal(project: Project, launcherId?: number) {
        try {
          await api.openTerminal(project.id, launcherId);
          await afterOpen(project.id);
        } catch (e) {
          fail(e, recovery(e, "terminals", openSettings));
        }
      },

      async openFolder(project: Project) {
        try {
          await api.openFolder(project.id);
        } catch (e) {
          fail(e);
        }
      },

      async openRemote(project: Project) {
        try {
          await api.openRemote(project.id);
        } catch (e) {
          fail(e);
        }
      },

      async toggleFavorite(project: Project) {
        try {
          upsertProject(await api.setFavorite(project.id, !project.isFavorite));
        } catch (e) {
          fail(e);
        }
      },

      async copyPath(project: Project) {
        await navigator.clipboard.writeText(project.path);
        notify({ tone: "info", title: "Path copied" });
      },

      async refresh(project: Project) {
        await refreshGit([project.id], true);
      },

      async remove(project: Project) {
        try {
          await api.removeProject(project.id);
          useApp.getState().dropProject(project.id);
          notify({ tone: "info", title: `Removed ${project.name} from Archboard` });
        } catch (e) {
          fail(e);
        }
      },
    }),
    [afterOpen, fail, notify, openSettings, refreshGit, upsertProject],
  );
}
