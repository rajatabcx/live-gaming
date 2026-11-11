import type { ComponentProps } from "react";
import { Slot } from "radix-ui";
import { cx } from "../cx";

/** Figma: Components / Button — Variant × Size × State. */
export type ButtonVariant = "primary" | "ghost";
export type ButtonSize = "md" | "lg";

const base =
  "type-label-m inline-flex items-center justify-center gap-2 rounded-full transition-all duration-300 select-none " +
  "disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow/60";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-action-primary text-action-on-primary hover:shadow-[0_0_40px_-6px_var(--color-accent-glow)] hover:-translate-y-px active:translate-y-0",
  ghost: "border border-line-strong text-fg-primary hover:bg-surface-hover",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-12 px-6",
  lg: "h-14 px-7",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cx(base, variants[variant], sizes[size], className);
}

/**
 * <Button variant="ghost" size="lg">…</Button>
 * <Button asChild><Link href="/join">…</Link></Button> — render as a link with button styling.
 */
export function Button({
  variant,
  size,
  asChild,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={buttonStyles({ variant, size, className })} {...props} />;
}
