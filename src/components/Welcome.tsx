import { FolderGit2, FolderPlus, Telescope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pretty } from "@/lib/accelerator";

export function Welcome({
  globalShortcut,
  onFind,
  onAdd,
}: {
  globalShortcut: string;
  onFind: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="max-w-sm text-center">
        <FolderGit2 className="mx-auto h-8 w-8 text-ink-faint" strokeWidth={1.25} />
        <h2 className="mt-4 text-[15px] font-semibold tracking-[-0.01em]">
          Welcome to Archboard
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
          Your projects, their git state, one glance.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" size="sm" onClick={onFind}>
            <Telescope className="h-3.5 w-3.5" />
            Find my projects
          </Button>
          <Button variant="secondary" size="sm" onClick={onAdd}>
            <FolderPlus className="h-3.5 w-3.5" />
            Add a project
          </Button>
        </div>
        <p className="mt-5 text-[12px] text-ink-faint">
          Press <kbd className="mono text-ink-dim">{pretty(globalShortcut)}</kbd> from any
          application to summon Archboard.
        </p>
      </div>
    </div>
  );
}
