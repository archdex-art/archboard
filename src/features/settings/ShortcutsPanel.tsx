import { RotateCcw, TriangleAlert } from "lucide-react";
import { useCallback, useMemo } from "react";

import { ShortcutRecorder } from "@/features/settings/ShortcutRecorder";
import {
  COMMANDS,
  OVERRIDES_KEY,
  conflicts,
  parseOverrides,
  resolveBindings,
} from "@/features/shortcuts/registry";
import { Button } from "@/components/ui/button";
import { requiresModifier } from "@/lib/accelerator";
import { useApp } from "@/stores/app";

export function ShortcutsPanel() {
  const raw = useApp((s) => s.settings[OVERRIDES_KEY]);
  const saveSetting = useApp((s) => s.saveSetting);
  const notify = useApp((s) => s.notify);

  const bindings = useMemo(() => resolveBindings(raw), [raw]);
  const clashing = useMemo(() => conflicts(bindings), [bindings]);

  const rebind = useCallback(
    async (id: string, accelerator: string | null) => {
      if (accelerator && requiresModifier(accelerator)) {
        notify({
          tone: "error",
          title: "That shortcut needs a modifier.",
          detail: "A bare key would be swallowed everywhere in the app.",
        });
        return;
      }
      const next = parseOverrides(raw);
      if (accelerator) next[id] = accelerator;
      else delete next[id];
      await saveSetting(OVERRIDES_KEY, JSON.stringify(next));
    },
    [notify, raw, saveSetting],
  );

  const overrides = parseOverrides(raw);
  const groups = ["Application", "Project"] as const;

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-relaxed text-ink-dim">
        Arrow keys, <span className="mono">j</span>/<span className="mono">k</span> and{" "}
        <span className="mono">↵</span> move and open the selection. Those are fixed; everything
        below can be changed.
      </p>

      {groups.map((group) => (
        <section key={group}>
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {group}
          </h3>
          {COMMANDS.filter((c) => c.group === group).map((command) => {
            const accelerator = bindings[command.id];
            const clash = clashing[accelerator]?.length > 1;
            const changed = overrides[command.id] !== undefined;
            return (
              <div
                key={command.id}
                className="group flex items-center gap-3 border-b border-line py-2 last:border-0"
              >
                <span className="flex-1 text-[13px]">{command.label}</span>
                {clash ? (
                  <span
                    className="flex items-center gap-1 text-[11px] text-alert"
                    title="Another command uses this combination; only one of them will fire."
                  >
                    <TriangleAlert className="h-3 w-3" strokeWidth={2} />
                    in use twice
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Reset ${command.label} to its default`}
                  disabled={!changed}
                  className={changed ? "" : "invisible"}
                  onClick={() => void rebind(command.id, null)}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <ShortcutRecorder
                  value={accelerator}
                  onRecord={(next) => void rebind(command.id, next)}
                />
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
