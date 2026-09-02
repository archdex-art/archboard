import { RotateCw } from "lucide-react";
import type { FallbackProps } from "react-error-boundary";

import { Button } from "@/components/ui/button";

/**
 * Shown instead of a blank window when a render throws. This is not
 * hypothetical: a single bad store selector once took the whole tree down, and
 * a desktop app that goes black gives the user nothing to act on.
 */
export function RecoveryScreen({ error, resetErrorBoundary }: FallbackProps) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-canvas px-8">
      <div className="w-full max-w-lg">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Archboard hit a problem</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
          The window stopped drawing. Your projects are safe — everything lives in the database, and
          nothing on disk was touched.
        </p>

        <pre className="mono mt-3 max-h-52 overflow-auto rounded-[8px] border border-line bg-panel p-3 text-[11px] leading-relaxed text-ink-faint">
          {detail}
        </pre>

        <div className="mt-4 flex gap-2">
          <Button variant="primary" size="sm" onClick={resetErrorBoundary}>
            <RotateCw className="h-3.5 w-3.5" />
            Reload the board
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(detail)}
          >
            Copy details
          </Button>
        </div>
      </div>
    </div>
  );
}
