import { invoke } from "@tauri-apps/api/core";

import type {
  AddOutcome,
  AppError,
  Candidate,
  Commit,
  GitEntry,
  GitStatus,
  Launcher,
  LauncherKind,
  Project,
  ProjectDetail,
  ProjectPatch,
  ScanRoot,
  Tag,
} from "@/types";

/** True for the structured errors the Rust layer returns. */
export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

/**
 * Anything that escapes the backend still has to read like a sentence. A raw
 * `TypeError` is a fact about our code, not something the reader can act on,
 * so it moves to the hint and a plain sentence takes its place.
 */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  const detail = value instanceof Error ? value.message : String(value);
  return {
    code: "io",
    message: "Archboard could not reach its backend.",
    hint: detail || undefined,
  };
}

const call = <T,>(cmd: string, args?: Record<string, unknown>) =>
  invoke<T>(cmd, args).catch((e) => {
    throw toAppError(e);
  });

export const api = {
  // projects
  listProjects: () => call<Project[]>("list_projects"),
  getProject: (id: number) => call<Project>("get_project", { id }),
  projectDetail: (id: number) => call<ProjectDetail>("project_detail", { id }),
  addProject: (path: string, name?: string) => call<AddOutcome>("add_project", { path, name }),
  addProjects: (paths: string[]) => call<Project[]>("add_projects", { paths }),
  removeProject: (id: number) => call<void>("remove_project", { id }),
  updateProject: (id: number, patch: ProjectPatch) => call<Project>("update_project", { id, patch }),
  setFavorite: (id: number, favorite: boolean) => call<Project>("set_favorite", { id, favorite }),
  touchProject: (id: number) => call<Project>("touch_project", { id }),
  redetectProject: (id: number) => call<Project>("redetect_project", { id }),

  // git
  gitStatus: (id: number, force = false) => call<GitStatus>("git_status", { id, force }),
  gitStatusBatch: (ids: number[], force = false) =>
    call<GitEntry[]>("git_status_batch", { ids, force }),
  gitInit: (id: number) => call<GitStatus>("git_init", { id }),
  gitRecentCommits: (id: number, count = 8) => call<Commit[]>("git_recent_commits", { id, count }),
  gitBranches: (id: number) => call<string[]>("git_branches", { id }),

  // launchers
  detectLaunchers: () => call<Launcher[]>("detect_launchers"),
  listLaunchers: (kind?: LauncherKind) => call<Launcher[]>("list_launchers", { kind }),
  upsertLauncher: (launcher: Launcher) => call<Launcher>("upsert_launcher", { launcher }),
  deleteLauncher: (id: number) => call<void>("delete_launcher", { id }),
  openInIde: (id: number, launcherId?: number) => call<void>("open_in_ide", { id, launcherId }),
  openTerminal: (id: number, launcherId?: number) => call<void>("open_terminal", { id, launcherId }),
  openFolder: (id: number) => call<void>("open_folder", { id }),
  openRemote: (id: number) => call<string>("open_remote", { id }),

  // tags
  listTags: () => call<Tag[]>("list_tags"),
  createTag: (name: string) => call<Tag>("create_tag", { name }),
  renameTag: (id: number, name: string) => call<void>("rename_tag", { id, name }),
  deleteTag: (id: number) => call<void>("delete_tag", { id }),
  setProjectTags: (id: number, tagIds: number[]) => call<Project>("set_project_tags", { id, tagIds }),

  // scanning
  listScanRoots: () => call<ScanRoot[]>("list_scan_roots"),
  addScanRoot: (path: string, depth?: number) => call<ScanRoot[]>("add_scan_root", { path, depth }),
  updateScanRoot: (id: number, depth?: number, enabled?: boolean) =>
    call<ScanRoot[]>("update_scan_root", { id, depth, enabled }),
  removeScanRoot: (id: number) => call<ScanRoot[]>("remove_scan_root", { id }),
  scanRoots: () => call<void>("scan_roots"),

  // window and global shortcut
  setGlobalShortcut: (accelerator: string | null) =>
    call<void>("set_global_shortcut", { accelerator }),
  hideWindow: () => call<void>("hide_window"),
  setDockVisible: (visible: boolean) => call<void>("set_dock_visible", { visible }),

  // settings
  getSettings: () => call<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) => call<void>("set_setting", { key, value }),
};

export type { Candidate };
