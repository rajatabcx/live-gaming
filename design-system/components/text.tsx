import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cx } from "../cx";

/** Every Figma text style. Name = Figma style lowercased, "/" → "-". */
export type TextVariant =
  | "display-xl"
  | "display-l"
  | "display-m"
  | "display-s"
  | "display-italic"
  | "body-l"
  | "body-m"
  | "body-s"
  | "label-m"
  | "label-s"
  | "overline"
  | "mono-s";

export type TextTone = "primary" | "secondary" | "tertiary" | "inherit";

const tones: Record<TextTone, string> = {
  primary: "text-fg-primary",
  secondary: "text-fg-secondary",
  tertiary: "text-fg-tertiary",
  inherit: "",
};

const defaultTag: Partial<Record<TextVariant, ElementType>> = {
  "display-xl": "h1",
  "display-l": "h2",
  "display-m": "h2",
  "display-s": "h3",
  "display-italic": "p",
};

type TextProps<T extends ElementType> = {
  as?: T;
  variant?: TextVariant;
  tone?: TextTone;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/**
 * Typography primitive. Defaults: body-m, primary tone, sensible tag per variant.
 * <Text variant="overline" tone="tertiary">Room ABCD</Text>
 * <Text as="h1" variant="display-xl">Better as two.</Text>
 */
export function Text<T extends ElementType = "p">({ as, variant = "body-m", tone, className, ...props }: TextProps<T>) {
  const Tag: ElementType = as ?? defaultTag[variant] ?? "p";
  const defaultTone: TextTone =
    variant === "overline" || variant === "mono-s" ? "tertiary" : variant.startsWith("body") ? "secondary" : "primary";
  return <Tag className={cx(`type-${variant}`, tones[tone ?? defaultTone], className)} {...props} />;
}
