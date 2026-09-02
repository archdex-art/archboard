import { create } from "zustand";

import { api, toAppError } from "@/lib/ipc";
import type { AppError, GitStatus, Launcher, Project, ScanRoot, Tag } from "@/types";

export type FilterId =
  | "all"
  | "favorites"
  | "recent"
  | "git"
  | "dirty"
  | `lang:${string}`
  | `tag:${string}`;

export type SortMode = "frecency" | "recent" | "name" | "changes";
export type ViewMode = "list" | "grid";
export type SettingsTab = "general" | "ides" | "terminals" | "folders";

export interface Toast {
  id: number;
  tone: "error" | "info";
  title: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

interface AppState {
  projects: Project[];
  git: Record<number, GitStatus>;
  gitErrors: Record<number, AppError>;
  refreshing: Set<number>;
  launchers: Launcher[];
  tags: Tag[];
  scanRoots: ScanRoot[];
  settings: Record<string, string>;
  loaded: boolean;

  query: string;
  filter: FilterId;
  sort: SortMode;
  view: ViewMode;
  selectedId: number | null;
  settingsTab: SettingsTab | null;
  toasts: Toast[];

  bootstrap: () => Promise<void>;
  reloadProjects: () => Promise<void>;
  reloadLaunchers: () => Promise<void>;
  reloadTags: () => Promise<void>;
  reloadScanRoots: () => Promise<void>;

  upsertProject: (project: Project) => void;
  dropProject: (id: number) => void;
  refreshGit: (ids: number[], force?: boolean) => Promise<void>;

  setQuery: (query: string) => void;
  setFilter: (filter: FilterId) => void;
  setSort: (sort: SortMode) => void;
  setView: (view: ViewMode) => void;
  select: (id: number | null) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  saveSetting: (key: string, value: string) => Promise<void>;

  notify: (toast: Omit<Toast, "id">) => void;
  fail: (error: unknown, extra?: Partial<Toast>) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  projects: [],
  git: {},
  gitErrors: {},
  refreshing: new Set(),
  launchers: [],
  tags: [],
  scanRoots: [],
  settings: {},
  loaded: false,

  query: "",
  filter: "all",
  sort: "frecency",
  view: "list",
  selectedId: null,
  settingsTab: null,
  toasts: [],

  async bootstrap() {
    try {
      // The board paints from SQLite alone; git and app detection follow.
      const [projects, tags, settings] = await Promise.all([
        api.listProjects(),
        api.listTags(),
        api.getSettings(),
      ]);
      set({
        projects,
        tags,
        settings,
        loaded: true,
        sort: (settings.sort as SortMode) ?? "frecency",
        view: (settings.view as ViewMode) ?? "list",
      });
      const [launchers, scanRoots] = await Promise.all([
        api.detectLaunchers(),
        api.listScanRoots(),
      ]);
      set({ launchers, scanRoots, settings: await api.getSettings() });
    } catch (e) {
      set({ loaded: true });
      get().fail(e);
    }
  },

  async reloadProjects() {
    try {
      set({ projects: await api.listProjects() });
    } catch (e) {
      get().fail(e);
    }
  },

  async reloadLaunchers() {
    try {
      set({ launchers: await api.listLaunchers() });
    } catch (e) {
      get().fail(e);
    }
  },

  async reloadTags() {
    try {
      set({ tags: await api.listTags() });
    } catch (e) {
      get().fail(e);
    }
  },

  async reloadScanRoots() {
    try {
      set({ scanRoots: await api.listScanRoots() });
    } catch (e) {
      get().fail(e);
    }
  },

  upsertProject(project) {
    set((s) => {
      const index = s.projects.findIndex((p) => p.id === project.id);
      if (index === -1) return { projects: [...s.projects, project] };
      const projects = s.projects.slice();
      projects[index] = project;
      return { projects };
    });
  },

  dropProject(id) {
    set((s) => {
      const git = { ...s.git };
      delete git[id];
      return {
        projects: s.projects.filter((p) => p.id !== id),
        git,
        selectedId: s.selectedId === id ? null : s.selectedId,
      };
    });
  },

  async refreshGit(ids, force = false) {
    const pending = force ? ids : ids.filter((id) => !get().refreshing.has(id));
    if (pending.length === 0) return;
    set((s) => ({ refreshing: new Set([...s.refreshing, ...pending]) }));
    try {
      const entries = await api.gitStatusBatch(pending, force);
      set((s) => {
        const git = { ...s.git };
        const gitErrors = { ...s.gitErrors };
        for (const entry of entries) {
          if (entry.status) {
            git[entry.projectId] = entry.status;
            delete gitErrors[entry.projectId];
          } else if (entry.error) {
            gitErrors[entry.projectId] = entry.error;
          }
        }
        const refreshing = new Set(s.refreshing);
        for (const id of pending) refreshing.delete(id);
        return { git, gitErrors, refreshing };
      });
    } catch (e) {
      set((s) => {
        const refreshing = new Set(s.refreshing);
        for (const id of pending) refreshing.delete(id);
        return { refreshing };
      });
      get().fail(e);
    }
  },

  setQuery: (query) => set({ query }),
  setFilter: (filter) => set({ filter }),
  setSort(sort) {
    set({ sort });
    void get().saveSetting("sort", sort);
  },
  setView(view) {
    set({ view });
    void get().saveSetting("view", view);
  },
  select: (selectedId) => set({ selectedId }),
  openSettings: (tab = "general") => set({ settingsTab: tab }),
  closeSettings: () => set({ settingsTab: null }),

  async saveSetting(key, value) {
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
    try {
      await api.setSetting(key, value);
    } catch (e) {
      get().fail(e);
    }
  },

  notify(toast) {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    // Errors stay until dismissed; confirmations get out of the way.
    if (toast.tone !== "error") {
      setTimeout(() => get().dismiss(id), 2600);
    }
  },

  fail(error, extra) {
    const appError = toAppError(error);
    get().notify({
      tone: "error",
      title: appError.message,
      detail: appError.hint,
      ...extra,
    });
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
