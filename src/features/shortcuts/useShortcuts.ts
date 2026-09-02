import { useEffect, useMemo, useRef } from "react";

import { matches } from "@/lib/accelerator";
import { OVERRIDES_KEY, resolveBindings, type CommandId } from "@/features/shortcuts/registry";
import { useApp } from "@/stores/app";

export type Handlers = Partial<Record<CommandId, () => void>>;

/** The effective accelerator for every command. */
export function useBindings() {
  const raw = useApp((s) => s.settings[OVERRIDES_KEY]);
  return useMemo(() => resolveBindings(raw), [raw]);
}

/**
 * Binds the given handlers to their accelerators for as long as the component
 * is mounted.
 *
 * The listener is registered once and reads the current handlers through a ref,
 * because handlers are rebuilt on every render — re-subscribing each time would
 * add and remove a window listener on every git refresh.
 */
export function useShortcuts(handlers: Handlers) {
  const bindings = useBindings();
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal a keystroke from a field the user is typing in.
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }

      for (const [id, accelerator] of Object.entries(bindings)) {
        if (!matches(e, accelerator)) continue;
        const handler = latest.current[id as CommandId];
        if (!handler) continue;
        e.preventDefault();
        handler();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bindings]);
}
