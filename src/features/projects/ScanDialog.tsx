import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPlus, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Chip } from "@/components/GitBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { tildePath } from "@/lib/format";
import { api } from "@/lib/ipc";
import { useApp } from "@/stores/app";
import type { Candidate, ScanProgress } from "@/types";

/**
 * Discovery, with the user in charge of what gets added. The walk is
 * depth-limited and skips dependency directories, and its result is a
 * checklist — nothing lands on the board without being ticked.
 */
export function ScanDialog({ open: isOpen, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const scanRoots = useApp((s) => s.scanRoots);
  const reloadScanRoots = useApp((s) => s.reloadScanRoots);
  const reloadProjects = useApp((s) => s.reloadProjects);
  const notify = useApp((s) => s.notify);
  const fail = useApp((s) => s.fail);

  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unlisten = [
      listen<ScanProgress>("scan:progress", (e) => setProgress(e.payload)),
      listen<Candidate[]>("scan:done", (e) => {
        setScanning(false);
        setCandidates(e.payload);
        // Anything with a repository is worth adding; everything else is opt-in.
        setChosen(
          Object.fromEntries(
            e.payload.filter((c) => !c.alreadyAdded).map((c) => [c.path, c.hasGit]),
          ),
        );
      }),
    ];
    return () => {
      void Promise.all(unlisten).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setCandidates(null);
      setProgress(null);
      setScanning(false);
    }
  }, [isOpen]);

  const selectedPaths = useMemo(
    () => Object.entries(chosen).filter(([, on]) => on).map(([path]) => path),
    [chosen],
  );

  async function startScan() {
    setCandidates(null);
    setProgress(null);
    setScanning(true);
    try {
      await api.scanRoots();
    } catch (e) {
      setScanning(false);
      fail(e);
    }
  }

  async function addRoot() {
    const picked = (await open({ directory: true, multiple: false, title: "Choose a folder to scan" })) as
      | string
      | null;
    if (!picked) return;
    try {
      await api.addScanRoot(picked, 3);
      await reloadScanRoots();
    } catch (e) {
      fail(e);
    }
  }

  const enabledRoots = scanRoots.filter((r) => r.enabled);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
      width="max-w-xl"
      title="Find projects on this Mac"
      description={
        enabledRoots.length === 0
          ? "Add a folder to search. Archboard looks a few levels deep and stops at each repository."
          : `Searching ${enabledRoots.map((r) => tildePath(r.path)).join(", ")}.`
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={addRoot}>
            <FolderPlus className="h-3.5 w-3.5" />
            Add folder
          </Button>
          <div className="flex-1" />
          {candidates ? (
            <>
              <Button variant="secondary" size="sm" onClick={startScan}>
                Search again
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={selectedPaths.length === 0 || adding}
                onClick={async () => {
                  setAdding(true);
                  try {
                    const added = await api.addProjects(selectedPaths);
                    await reloadProjects();
                    notify({
                      tone: "info",
                      title: `Added ${added.length} project${added.length === 1 ? "" : "s"}`,
                    });
                    onOpenChange(false);
                  } catch (e) {
                    fail(e);
                  } finally {
                    setAdding(false);
                  }
                }}
              >
                Add {selectedPaths.length || ""} selected
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={scanning || enabledRoots.length === 0}
              onClick={startScan}
            >
              {scanning ? "Searching…" : "Start search"}
            </Button>
          )}
        </>
      }
    >
      {scanning ? (
        <div className="flex items-center gap-2.5 py-6 text-[12.5px] text-ink-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>
            Found {progress?.found ?? 0} in {progress?.scanned ?? 0} folders
          </span>
          <span className="mono ml-auto max-w-[260px] truncate text-[11px] text-ink-faint">
            {progress?.current ? tildePath(progress.current) : ""}
          </span>
        </div>
      ) : null}

      {candidates ? (
        candidates.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-ink-dim">
            No projects turned up. Try adding another folder to search.
          </p>
        ) : (
          <div className="-mx-1 max-h-[340px] overflow-y-auto px-1">
            <div className="mb-2 flex items-center gap-2 text-[11px] text-ink-faint">
              <span>
                Found {candidates.length} project{candidates.length === 1 ? "" : "s"}
              </span>
              <button
                className="ml-auto underline decoration-line-strong underline-offset-2 hover:text-ink"
                onClick={() =>
                  setChosen(
                    Object.fromEntries(
                      candidates.filter((c) => !c.alreadyAdded).map((c) => [c.path, true]),
                    ),
                  )
                }
              >
                Select all
              </button>
              <button
                className="underline decoration-line-strong underline-offset-2 hover:text-ink"
                onClick={() => setChosen({})}
              >
                Clear
              </button>
            </div>

            {candidates.map((candidate) => (
              <label
                key={candidate.path}
                className="flex h-[42px] items-center gap-2.5 rounded-[7px] px-1.5 hover:bg-raised"
              >
                <Checkbox
                  checked={!!chosen[candidate.path]}
                  disabled={candidate.alreadyAdded}
                  onCheckedChange={(value) =>
                    setChosen((prev) => ({ ...prev, [candidate.path]: value === true }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{candidate.name}</div>
                  <div className="mono truncate text-[11px] text-ink-faint">
                    {tildePath(candidate.path)}
                  </div>
                </div>
                {candidate.language ? <Chip>{candidate.language}</Chip> : null}
                {candidate.hasGit ? <Chip>git</Chip> : null}
                {candidate.alreadyAdded ? (
                  <span className="text-[11px] text-ink-faint">already added</span>
                ) : null}
              </label>
            ))}
          </div>
        )
      ) : null}
    </Dialog>
  );
}
