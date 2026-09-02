import { TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { useApp } from "@/stores/app";

/**
 * Failures never disappear on their own, and they always say what to do next.
 * Confirmations fade out after a couple of seconds.
 */
export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[340px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto animate-rise rounded-[10px] border bg-panel p-3 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9)]",
            toast.tone === "error" ? "border-alert/35" : "border-line-strong",
          )}
        >
          <div className="flex items-start gap-2.5">
            {toast.tone === "error" ? (
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-alert" strokeWidth={2} />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug">{toast.title}</p>
              {toast.detail ? (
                <p className="mt-1 text-[12px] leading-snug text-ink-dim">{toast.detail}</p>
              ) : null}
              {toast.action ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => {
                    toast.action?.run();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </Button>
              ) : null}
            </div>
            <button
              aria-label="Dismiss"
              className="shrink-0 text-ink-faint transition-colors hover:text-ink"
              onClick={() => dismiss(toast.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
