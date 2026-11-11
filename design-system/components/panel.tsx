import type { ComponentProps } from "react";
import { cx } from "../cx";

/** Figma: Components / Panel — frosted surface for overlays on the host screen. */
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-xl border border-line-subtle bg-surface-base/60 backdrop-blur-2xl", className)}
      {...props}
    />
  );
}
