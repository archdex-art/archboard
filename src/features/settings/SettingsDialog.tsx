import * as Tabs from "@radix-ui/react-tabs";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, FolderPlus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { cn, tildePath } from "@/lib/format";
import { api } from "@/lib/ipc";
import { useApp, type SettingsTab } from "@/stores/app";
import type { Launcher, LauncherKind } from "@/types";

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{title}</div>
        {description ? (
          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">{description}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ setting, fallback = false }: { setting: string; fallback?: boolean }) {
  const value = useApp((s) => s.settings[setting]);
  const saveSetting = useApp((s) => s.saveSetting);
  const checked = value === undefined ? fallback : value === "true";
  return <Switch checked={checked} onCheckedChange={(next) => void saveSetting(setting, String(next))} />;
}

function LauncherList({ kind }: { kind: LauncherKind }) {
  // Selectors must return a stable reference: filtering inside one produces a
  // new array on every store read and spins React forever.
  const allLaunchers = useApp((s) => s.launchers);
  const launchers = useMemo(() => allLaunchers.filter((l) => l.kind === kind), [allLaunchers, kind]);
  const settings = useApp((s) => s.settings);
  const saveSetting = useApp((s) => s.saveSetting);
  const reloadLaunchers = useApp((s) => s.reloadLaunchers);
  const notify = useApp((s) => s.notify);
  const fail = useApp((s) => s.fail);

  const defaultKey = kind === "ide" ? "default_ide_id" : "default_terminal_id";
  const defaultId = Number(settings[defaultKey] ?? 0);
  const [editing, setEditing] = useState<Launcher | null>(null);

  async function save(launcher: Launcher) {
    try {
      await api.upsertLauncher(launcher);
      await reloadLaunchers();
      setEditing(null);
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div className="space-y-1">
      {launchers.length === 0 ? (
        <p className="py-4 text-[12.5px] text-ink-dim">
          Nothing detected. Add one below with the full path to its application.
        </p>
      ) : null}

      {launchers.map((launcher) => (
        <div
          key={launcher.id}
          className="group flex items-center gap-2.5 rounded-[7px] px-2 py-2 hover:bg-panel"
        >
          <Checkbox
            checked={launcher.enabled}
            aria-label={`Show ${launcher.name}`}
            onCheckedChange={(value) => void save({ ...launcher, enabled: value === true })}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[13px]">
              {launcher.name}
              {launcher.detected ? (
                <Check className="h-3 w-3 text-ink-dim" strokeWidth={2.5} />
              ) : null}
            </div>
            <div className="mono truncate text-[11px] text-ink-faint">
              {launcher.bundleId ?? launcher.execPath ?? "not configured"}
            </div>
          </div>

          <button
            className={cn(
              "rounded-[5px] border px-1.5 py-0.5 text-[11px] transition-colors",
              defaultId === launcher.id
                ? "border-line-strong bg-raised text-ink"
                : "border-transparent text-ink-faint opacity-0 hover:text-ink group-hover:opacity-100",
            )}
            onClick={() => void saveSetting(defaultKey, String(launcher.id))}
          >
            {defaultId === launcher.id ? "default" : "make default"}
          </button>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Configure ${launcher.name}`}
            className="opacity-0 group-hover:opacity-100"
            onClick={() => setEditing(launcher)}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          {!launcher.detected ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${launcher.name}`}
              className="opacity-0 group-hover:opacity-100"
              onClick={async () => {
                await api.deleteLauncher(launcher.id);
                await reloadLaunchers();
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      ))}

      <div className="flex gap-2 pt-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await api.detectLaunchers();
              await reloadLaunchers();
              notify({ tone: "info", title: "Rescanned your applications" });
            } catch (e) {
              fail(e);
            }
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Detect again
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setEditing({
              id: 0,
              kind,
              name: "",
              bundleId: null,
              execPath: null,
              args: null,
              platform: "macos",
              detected: false,
              enabled: true,
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add manually
        </Button>
      </div>

      {editing ? (
        <LauncherEditor
          launcher={editing}
          onCancel={() => setEditing(null)}
          onSave={(next) => void save(next)}
        />
      ) : null}
    </div>
  );
}

function LauncherEditor({
  launcher,
  onCancel,
  onSave,
}: {
  launcher: Launcher;
  onCancel: () => void;
  onSave: (launcher: Launcher) => void;
}) {
  const [draft, setDraft] = useState(launcher);

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onCancel()}
      title={launcher.id ? `Configure ${launcher.name}` : "Add an application"}
      description="Archboard opens applications by bundle identifier where it can, and by absolute path otherwise. It never relies on your shell's PATH."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!draft.name.trim()} onClick={() => onSave(draft)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <Input
            value={draft.name}
            placeholder="Cursor"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Bundle identifier" hint="For example com.microsoft.VSCode. Leave empty to use a command.">
          <Input
            value={draft.bundleId ?? ""}
            className="mono"
            placeholder="com.todesktop.230313mzl4w4u92"
            onChange={(e) => setDraft({ ...draft, bundleId: e.target.value || null })}
          />
        </Field>
        <Field label="Executable" hint="Absolute path, e.g. /opt/homebrew/bin/cursor">
          <div className="flex gap-2">
            <Input
              value={draft.execPath ?? ""}
              className="mono"
              placeholder="/opt/homebrew/bin/cursor"
              onChange={(e) => setDraft({ ...draft, execPath: e.target.value || null })}
            />
            <Button
              variant="secondary"
              size="md"
              onClick={async () => {
                const picked = (await open({ multiple: false, title: "Choose an executable" })) as
                  | string
                  | null;
                if (picked) setDraft({ ...draft, execPath: picked });
              }}
            >
              Browse
            </Button>
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function Folders() {
  const scanRoots = useApp((s) => s.scanRoots);
  const reloadScanRoots = useApp((s) => s.reloadScanRoots);
  const fail = useApp((s) => s.fail);

  return (
    <div className="space-y-1">
      <p className="pb-2 text-[12.5px] leading-relaxed text-ink-dim">
        Archboard searches these folders when you ask it to find projects. It looks a few levels
        deep, stops at every repository, and skips dependency and build directories.
      </p>

      {scanRoots.map((root) => (
        <div key={root.id} className="group flex items-center gap-2.5 rounded-[7px] px-2 py-2 hover:bg-panel">
          <Checkbox
            checked={root.enabled}
            aria-label={`Search ${root.path}`}
            onCheckedChange={async (value) => {
              await api.updateScanRoot(root.id, undefined, value === true);
              await reloadScanRoots();
            }}
          />
          <span className="mono min-w-0 flex-1 truncate text-[12px]">{tildePath(root.path)}</span>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            depth
            <input
              type="number"
              min={1}
              max={6}
              value={root.depth}
              onChange={async (e) => {
                await api.updateScanRoot(root.id, Number(e.target.value));
                await reloadScanRoots();
              }}
              className="mono h-6 w-11 rounded-[5px] border border-line bg-panel px-1.5 text-center text-[11.5px] outline-none focus:border-line-strong"
            />
          </label>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Stop searching ${root.path}`}
            className="opacity-0 group-hover:opacity-100"
            onClick={async () => {
              await api.removeScanRoot(root.id);
              await reloadScanRoots();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        onClick={async () => {
          const picked = (await open({ directory: true, multiple: false })) as string | null;
          if (!picked) return;
          try {
            await api.addScanRoot(picked, 3);
            await reloadScanRoots();
          } catch (e) {
            fail(e);
          }
        }}
      >
        <FolderPlus className="h-3.5 w-3.5" />
        Add folder
      </Button>
    </div>
  );
}

const TABS: [SettingsTab, string][] = [
  ["general", "General"],
  ["ides", "Editors"],
  ["terminals", "Terminals"],
  ["folders", "Folders"],
];

export function SettingsDialog({
  open: isOpen,
  onOpenChange,
  tab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
  const theme = useApp((s) => s.settings.theme ?? "dark");
  const saveSetting = useApp((s) => s.saveSetting);
  const reloadLaunchers = useApp((s) => s.reloadLaunchers);

  useEffect(() => {
    if (isOpen) void reloadLaunchers();
  }, [isOpen, reloadLaunchers]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange} width="max-w-2xl" title="Settings">
      <Tabs.Root value={tab} onValueChange={(v) => onTabChange(v as SettingsTab)}>
        <Tabs.List className="mb-1 flex gap-1 border-b border-line">
          {TABS.map(([id, label]) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className={cn(
                "-mb-px border-b px-2.5 pb-2 text-[12.5px] transition-colors",
                "border-transparent text-ink-faint hover:text-ink-dim",
                "data-[state=active]:border-ink data-[state=active]:text-ink",
              )}
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="min-h-[340px] max-h-[60vh] overflow-y-auto pt-1">
          <Tabs.Content value="general">
            <Row title="Appearance" description="Colour marks repository state, whichever you pick.">
              <div className="flex gap-1">
                {(["dark", "light"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => void saveSetting("theme", option)}
                    className={cn(
                      "rounded-[6px] border px-2 py-1 text-[12px] capitalize transition-colors",
                      theme === option
                        ? "border-line-strong bg-raised text-ink"
                        : "border-line text-ink-faint hover:text-ink",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </Row>
            <Row
              title="Refresh git status automatically"
              description="Re-reads visible repositories every minute while the window is focused."
            >
              <Toggle setting="auto_refresh_git" fallback />
            </Row>
            <Row
              title="Initialize git for new projects"
              description="When on, adding a folder without a repository runs git init immediately instead of asking."
            >
              <Toggle setting="auto_init_git" />
            </Row>
          </Tabs.Content>

          <Tabs.Content value="ides">
            <LauncherList kind="ide" />
          </Tabs.Content>
          <Tabs.Content value="terminals">
            <LauncherList kind="terminal" />
          </Tabs.Content>
          <Tabs.Content value="folders">
            <Folders />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </Dialog>
  );
}
