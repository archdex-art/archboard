import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/format";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-[18px] w-[32px] shrink-0 rounded-full border border-line-strong bg-panel",
        "transition-colors duration-140 data-[state=checked]:border-ink data-[state=checked]:bg-ink",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-3 w-3 translate-x-[2px] rounded-full bg-ink-faint",
          "transition-transform duration-140 ease-[cubic-bezier(0.2,0.8,0.3,1)]",
          "data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-canvas",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px]",
        "border border-line-strong bg-panel transition-colors duration-120",
        "data-[state=checked]:border-ink data-[state=checked]:bg-ink",
        "disabled:opacity-35",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-2.5 w-2.5 text-canvas" strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  label,
  shortcut,
  children,
  side = "bottom",
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 flex items-center gap-2 rounded-[6px] border border-line-strong bg-panel",
            "px-2 py-1 text-[12px] text-ink shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] animate-fade",
          )}
        >
          {label}
          {shortcut ? <span className="mono text-[11px] text-ink-faint">{shortcut}</span> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
