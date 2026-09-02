import * as Primitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/format";

export const Menu = Primitive.Root;
export const MenuTrigger = Primitive.Trigger;

export function MenuContent({
  className,
  children,
  align = "end",
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-[210px] overflow-hidden rounded-[10px] border border-line-strong bg-panel p-1",
          "shadow-[0_18px_50px_-16px_rgba(0,0,0,0.85)] animate-rise",
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function MenuItem({
  className,
  children,
  shortcut,
  icon,
  ...props
}: ComponentProps<typeof Primitive.Item> & { shortcut?: string; icon?: ReactNode }) {
  return (
    <Primitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[13px]",
        "text-ink-dim outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      {icon ? <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="mono text-[11px] text-ink-faint">{shortcut}</span> : null}
    </Primitive.Item>
  );
}

export function MenuCheckItem({
  checked,
  children,
  ...props
}: ComponentProps<typeof Primitive.Item> & { checked: boolean }) {
  return (
    <MenuItem
      {...props}
      icon={checked ? <Check className="h-3.5 w-3.5 text-ink" strokeWidth={2.5} /> : null}
    >
      {children}
    </MenuItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <Primitive.Separator className="my-1 h-px bg-line" />;
}
