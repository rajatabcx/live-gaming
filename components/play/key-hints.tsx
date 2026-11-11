"use client";

import type { ControllerLayout } from "@/lib/realtime/protocol";
import { KEY_LABELS } from "@/lib/input/local-pad";
import { Text, cx } from "@/design-system";

/** Which keys do what right now, from the layout the game asked for. Mirrors the phone's buttons. */
export function KeyHints({ layout, color, className }: { layout: ControllerLayout; color: string; className?: string }) {
  const a = layout.kind === "lobby" ? "Wave" : layout.a;
  const b = layout.kind === "lobby" ? undefined : layout.b;
  const parts = [
    layout.kind !== "buttons" && `${KEY_LABELS.move} move`,
    a && `${KEY_LABELS.a} ${a}`,
    b && `${KEY_LABELS.b} ${b}`,
  ].filter(Boolean);

  return (
    <div
      className={cx(
        "pointer-events-none flex items-center gap-2.5 rounded-full border border-line-subtle bg-surface-base/50 px-4 py-2 backdrop-blur-xl",
        className,
      )}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      <Text variant="mono-s" tone="secondary">
        {parts.join("  ·  ")}
      </Text>
    </div>
  );
}
