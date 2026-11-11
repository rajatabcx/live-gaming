import type { ComponentProps } from "react";
import { Label } from "radix-ui";
import { cx } from "../cx";

/** Figma: Components / Input — State (Default, Focus). */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "type-body-l h-14 w-full rounded-md border border-line-strong bg-surface-raised px-5 text-fg-primary outline-none transition-colors",
        "placeholder:text-fg-tertiary focus:border-fg-tertiary",
        className,
      )}
      {...props}
    />
  );
}

/** Label + control, wired up with Radix Label. Pass `hideLabel` to keep it screen-reader only. */
export function Field({
  label,
  htmlFor,
  hideLabel,
  children,
}: {
  label: string;
  htmlFor: string;
  hideLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label.Root htmlFor={htmlFor} className={cx("type-overline text-fg-tertiary", hideLabel && "sr-only")}>
        {label}
      </Label.Root>
      {children}
    </div>
  );
}
