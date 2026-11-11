"use client";

import { useState } from "react";

export function ActionButton({
  label,
  glyph,
  color,
  size = "lg",
  onChange,
}: {
  label?: string;
  glyph: string;
  color: string;
  size?: "lg" | "md";
  onChange: (down: boolean) => void;
}) {
  const [down, setDown] = useState(false);
  const set = (v: boolean) => {
    if (v === down) return;
    setDown(v);
    if (v) navigator.vibrate?.(8);
    onChange(v);
  };
  const dim = size === "lg" ? "h-28 w-28" : "h-20 w-20";

  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        className={`touch-surface ${dim} rounded-full border text-2xl font-medium transition-[transform,box-shadow,background] duration-100`}
        style={{
          borderColor: down ? color : "var(--color-line-strong)",
          background: down ? color : "rgba(244,236,226,0.03)",
          color: down ? "var(--color-surface-base)" : "var(--color-fg-primary)",
          transform: down ? "scale(0.94)" : "none",
          boxShadow: down ? `0 0 48px ${color}` : "none",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          set(true);
        }}
        onPointerUp={() => set(false)}
        onPointerCancel={() => set(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {glyph}
      </button>
      {label && <span className="text-xs tracking-wide text-fg-tertiary">{label}</span>}
    </div>
  );
}
