import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/format";

const shared =
  "w-full rounded-[7px] bg-panel border border-line px-2.5 text-ink placeholder:text-ink-faint " +
  "outline-none transition-colors duration-120 focus:border-line-strong focus:bg-raised";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(shared, "h-8 text-[13px]", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(shared, "py-2 text-[13px] leading-relaxed resize-none", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-[11px] text-ink-faint">{hint}</span> : null}
    </label>
  );
}
