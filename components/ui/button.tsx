import type { ComponentProps } from "react";

type Variant = "primary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 text-[15px] font-medium tracking-tight transition-all duration-300 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glow/60";

const variants: Record<Variant, string> = {
  primary:
    "bg-cream text-ink hover:shadow-[0_0_40px_-6px_var(--glow)] hover:-translate-y-px active:translate-y-0",
  ghost: "border border-line-strong text-cream hover:bg-cream/5",
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
