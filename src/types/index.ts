export type ErrorCode =
  | "not_found"
  | "path_missing"
  | "already_exists"
  | "no_remote"
  | "launcher_missing"
  | "git_failed"
  | "db"
  | "io"
  | "invalid";

/** Mirrors `AppError` in src-tauri/src/error.rs. */
export interface AppError {
  code: ErrorCode;
  message: string;
  hint?: string;
  /** Names a recovery affordance the UI should offer. */
  action?: "configure_launcher" | "open_settings";
  actionArg?: string;
}

export interface Project {
  id: number;
  name: string;
  path: string;
  language: string | null;
  framework: string | null;
  packageManager: string | null;
  gitInitialized: boolean;
  gitRemote: string | null;
  isFavorite: boolean;
  openCount: number;
  lastOpened: number | null;
  notes: string | null;
  defaultIdeId: number | null;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

export interface Commit {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  subject: string;
}

export interface Remote {
  raw: string;
  host: string;
  service: string;
  owner: string | null;
  repo: string | null;
  webUrl: string | null;
}

export interface GitStatus {
  initialized: boolean;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  conflicted: number;
  lastCommit: Commit | null;
  remote: Remote | null;
  fetchedAt: number;
}

export interface GitEntry {
  projectId: number;
  status: GitStatus | null;
  error: AppError | null;
}

export interface Detection {
  language: string | null;
  framework: string | null;
  packageManager: string | null;
  tags: string[];
  hasGit: boolean;
}

export interface ProjectDetail {
  project: Project;
  detection: Detection;
  readme: string | null;
}

export interface AddOutcome {
  project: Project;
  needsGitInit: boolean;
}

export type LauncherKind = "ide" | "terminal";

export interface Launcher {
  id: number;
  kind: LauncherKind;
  name: string;
  bundleId: string | null;
  execPath: string | null;
  args: string | null;
  platform: string;
  detected: boolean;
  enabled: boolean;
}

export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export interface ScanRoot {
  id: number;
  path: string;
  depth: number;
  enabled: boolean;
}

export interface Candidate {
  name: string;
  path: string;
  language: string | null;
  framework: string | null;
  packageManager: string | null;
  hasGit: boolean;
  alreadyAdded: boolean;
}

export interface ScanProgress {
  scanned: number;
  found: number;
  current: string;
  done: boolean;
}

export interface ProjectPatch {
  name?: string;
  notes?: string;
  isFavorite?: boolean;
  defaultIdeId?: number | null;
}
