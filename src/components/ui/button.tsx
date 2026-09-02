import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/format";

const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium whitespace-nowrap " +
    "transition-[background,color,border-color,opacity] duration-120 ease-[cubic-bezier(0.2,0.8,0.3,1)] " +
    "disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        primary: "bg-ink text-canvas hover:opacity-90",
        secondary: "bg-raised text-ink border border-line-strong hover:bg-hover",
        ghost: "text-ink-dim hover:text-ink hover:bg-raised",
        danger: "bg-alert-soft text-alert border border-alert/30 hover:bg-alert/20",
      },
      size: {
        sm: "h-7 px-2.5 text-[12px]",
        md: "h-8 px-3 text-[13px]",
        icon: "h-7 w-7",
        "icon-sm": "h-6 w-6",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
