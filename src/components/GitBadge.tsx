import { ArrowDown, ArrowUp, GitBranch, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/format";
import type { GitStatus } from "@/types";

/**
 * The visual language of the board. Colour appears here and almost nowhere
 * else: amber for uncommitted work, violet for drift from the remote, red for
 * a conflict. A clean repository is rendered in graphite.
 */

export function BranchBadge({ status, className }: { status: GitStatus; className?: string }) {
  const label = status.detached
    ? `detached ${status.lastCommit?.shortSha ?? ""}`.trim()
    : (status.branch ?? "no commits yet");
  return (
    <span className={cn("mono flex min-w-0 items-center gap-1 text-[11.5px] text-ink-dim", className)}>
      <GitBranch className="h-3 w-3 shrink-0 text-ink-faint" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function ChangeBadge({ status, verbose }: { status: GitStatus; verbose?: boolean }) {
  const changed = status.staged + status.modified + status.untracked;
  if (status.conflicted > 0) {
    return (
      <span className="mono flex items-center gap-1 text-[11.5px] text-alert">
        <TriangleAlert className="h-3 w-3" strokeWidth={2} />
        {status.conflicted} conflicted
      </span>
    );
  }
  if (changed === 0) {
    return <span className="mono text-[11.5px] text-ink-faint">clean</span>;
  }
  if (!verbose) {
    return (
      <span className="mono text-[11.5px] text-signal">
        {changed} changed
      </span>
    );
  }
  return (
    <span className="mono flex items-center gap-2 text-[11.5px] text-signal">
      {status.staged > 0 ? <span title="staged">+{status.staged}</span> : null}
      {status.modified > 0 ? <span title="modified">~{status.modified}</span> : null}
      {status.untracked > 0 ? <span title="untracked">?{status.untracked}</span> : null}
    </span>
  );
}

export function SyncBadge({ status }: { status: GitStatus }) {
  if (status.ahead === 0 && status.behind === 0) return null;
  return (
    <span className="mono flex items-center gap-1.5 text-[11.5px] text-sync">
      {status.ahead > 0 ? (
        <span className="flex items-center">
          <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
          {status.ahead}
        </span>
      ) : null}
      {status.behind > 0 ? (
        <span className="flex items-center">
          <ArrowDown className="h-3 w-3" strokeWidth={2.5} />
          {status.behind}
        </span>
      ) : null}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "signal";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center whitespace-nowrap rounded-[5px] border px-1.5 text-[11px] leading-none",
        tone === "signal"
          ? "border-signal/30 bg-signal-soft text-signal"
          : "border-line bg-raised text-ink-dim",
        className,
      )}
    >
      {children}
    </span>
  );
}
