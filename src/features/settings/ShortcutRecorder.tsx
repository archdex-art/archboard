import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

/** Keys that only ever modify another key. */
const MODIFIER_CODES = new Set(["Meta", "Control", "Alt", "Shift"]);

/** How macOS draws each modifier, in Apple's canonical order. */
const GLYPHS: [test: (e: KeyboardEvent) => boolean, glyph: string, token: string][] = [
  [(e) => e.ctrlKey, "\u2303", "Control"],
  [(e) => e.altKey, "\u2325", "Alt"],
  [(e) => e.shiftKey, "\u21e7", "Shift"],
  [(e) => e.metaKey, "\u2318", "Super"],
];

/** Turns a key event into a Tauri accelerator, or null if it is not usable. */
function toAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.key)) return null;

  const tokens = GLYPHS.filter(([test]) => test(e)).map(([, , token]) => token);
  // A bare letter would swallow that key in every other application.
  if (tokens.length === 0) return null;

  const code = e.code;
  let key: string;
  if (code.startsWith("Key")) key = code.slice(3);
  else if (code.startsWith("Digit")) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (code === "Space") key = "Space";
  else if (code === "Enter") key = "Enter";
  else if (code === "Backslash") key = "Backslash";
  else if (code === "Slash") key = "Slash";
  else if (code === "Period") key = "Period";
  else if (code === "Comma") key = "Comma";
  else if (code.startsWith("Arrow")) key = code.slice(5);
  else return null;

  return [...tokens, key].join("+");
}

/** The same accelerator, drawn the way macOS draws it. */
export function prettyAccelerator(accelerator: string) {
  const map: Record<string, string> = {
    Control: "\u2303",
    Ctrl: "\u2303",
    Alt: "\u2325",
    Option: "\u2325",
    Shift: "\u21e7",
    Super: "\u2318",
    Command: "\u2318",
    CommandOrControl: "\u2318",
    CmdOrCtrl: "\u2318",
  };
  return accelerator
    .split("+")
    .map((part) => map[part] ?? part)
    .join("");
}

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
  const ref = useRef<HTMLButtonElement>(null);

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
      if (MODIFIER_CODES.has(e.key)) return;

      const accelerator = toAccelerator(e);
      if (!accelerator) {
        setHint("Hold at least one modifier.");
        return;
      }
      setRecording(false);
      setHint(null);
      onRecord(accelerator);
    };

    // Capture phase, so the app's own shortcuts do not fire while recording.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onRecord]);

  return (
    <div className="flex items-center gap-2">
      {hint ? <span className="text-[11px] text-ink-faint">{hint}</span> : null}
      <Button
        ref={ref}
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
        {recording ? "Press keys" : prettyAccelerator(value)}
      </Button>
    </div>
  );
}
