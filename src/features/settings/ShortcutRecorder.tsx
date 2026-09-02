import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MODIFIER_KEYS, fromEvent, pretty, requiresModifier } from "@/lib/accelerator";
import { cn } from "@/lib/format";

/**
 * Captures the next key combination the user presses.
 *
 * Recording runs on the capture phase so the app's own shortcuts do not fire
 * while a new one is being chosen — otherwise pressing ⌘K to rebind it would
 * open the palette instead.
 */
export function ShortcutRecorder({
  value,
  disabled,
  onRecord,
}: {
  value: string;
  disabled?: boolean;
  onRecord: (accelerator: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        setHint(null);
        return;
      }
      // Wait for a real key while the user is still reaching for modifiers.
      if (MODIFIER_KEYS.has(e.key)) return;

      const accelerator = fromEvent(e);
      if (!accelerator) {
        setHint("Unsupported key.");
        return;
      }
      if (requiresModifier(accelerator)) {
        setHint("Hold a modifier.");
        return;
      }
      setRecording(false);
      setHint(null);
      onRecord(accelerator);
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onRecord]);

  return (
    <div className="flex items-center gap-2">
      {hint ? <span className="text-[11px] text-signal">{hint}</span> : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        aria-label={recording ? "Press the new shortcut" : `Change shortcut, currently ${value}`}
        onClick={() => {
          setHint(null);
          setRecording((r) => !r);
        }}
        className={cn("mono min-w-[76px] justify-center", recording && "border-signal text-signal")}
      >
        {recording ? "Press keys" : pretty(value)}
      </Button>
    </div>
  );
}
