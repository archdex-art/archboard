import * as Primitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { cn } from "@/lib/format";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "max-w-md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] animate-fade" />
        <Primitive.Content
          className={cn(
            "fixed left-1/2 top-[18%] z-50 w-[calc(100vw-3rem)] -translate-x-1/2 animate-rise",
            "rounded-[12px] border border-line-strong bg-panel shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)]",
            width,
          )}
        >
          <div className="px-5 pt-4 pb-3">
            <Primitive.Title className="text-[15px] font-semibold tracking-[-0.01em]">
              {title}
            </Primitive.Title>
            {description ? (
              <Primitive.Description asChild>
                <div className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">{description}</div>
              </Primitive.Description>
            ) : null}
          </div>
          {children ? <div className="px-5 pb-4">{children}</div> : null}
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
              {footer}
            </div>
          ) : null}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

export const DialogClose = Primitive.Close;
