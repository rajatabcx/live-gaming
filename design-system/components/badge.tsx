import type { ComponentProps } from "react";
import { cx } from "../cx";

/** Figma: Components / Badge — Tone. */
export type BadgeTone = "neutral" | "p1" | "p2" | "glow";

const dot: Record<Exclude<BadgeTone, "neutral">, string> = {
  p1: "bg-player-one",
  p2: "bg-player-two",
  glow: "bg-accent-glow",
};

export function Badge({ tone = "neutral", className, children, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cx(
        "type-label-s inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-base/40 px-3 py-[5px] text-fg-primary backdrop-blur-md",
        className,
      )}
      {...props}
    >
      {tone !== "neutral" && <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", dot[tone])} />}
      {children}
    </span>
  );
}
