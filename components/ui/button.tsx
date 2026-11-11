import type { ComponentProps } from "react";

type Variant = "primary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 text-[15px] font-medium tracking-tight transition-all duration-300 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow/60";

const variants: Record<Variant, string> = {
  primary:
    "bg-action-primary text-action-on-primary hover:shadow-[0_0_40px_-6px_var(--color-accent-glow)] hover:-translate-y-px active:translate-y-0",
  ghost: "border border-line-strong text-fg-primary hover:bg-fg-primary/5",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function buttonClass(variant: Variant = "primary", className = "") {
  return `${base} ${variants[variant]} ${className}`;
}
