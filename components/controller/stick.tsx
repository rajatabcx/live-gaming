"use client";

import { useRef, useState } from "react";

const RADIUS = 64; // px of travel for full deflection
const DEADZONE = 0.12;

/**
 * Floating thumbstick: the origin is wherever the thumb lands, so there's no
 * "missing" the stick without looking down.
 */
export function Stick({ color, onChange }: { color: string; onChange: (x: number, y: number) => void }) {
  const zone = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number, o: { x: number; y: number }) => {
    let dx = clientX - o.x;
    let dy = clientY - o.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    const mag = Math.min(len, RADIUS) / RADIUS;
    if (mag < DEADZONE) onChange(0, 0);
    else {
      // Rescale past the deadzone so small pushes still feel analog.
      const k = (mag - DEADZONE) / (1 - DEADZONE) / mag;
      onChange(round((dx / RADIUS) * k), round((dy / RADIUS) * k));
    }
  };

  const end = () => {
    pointer.current = null;
    setOrigin(null);
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={zone}
      className="touch-surface relative h-full w-full"
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = zone.current!.getBoundingClientRect();
        const o = { x: e.clientX, y: e.clientY };
        setOrigin({ x: o.x - rect.left, y: o.y - rect.top });
        update(e.clientX, e.clientY, o);
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current || !origin) return;
        const rect = zone.current!.getBoundingClientRect();
        update(e.clientX, e.clientY, { x: origin.x + rect.left, y: origin.y + rect.top });
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && end()}
      onPointerCancel={(e) => e.pointerId === pointer.current && end()}
    >
      {!origin && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-36 w-36 items-center justify-center rounded-full border border-line-strong">
            <span className="text-xs tracking-wide text-fg-tertiary">Move</span>
          </div>
        </div>
      )}
      {origin && (
        <div
          className="pointer-events-none absolute"
          style={{ left: origin.x, top: origin.y, transform: "translate(-50%, -50%)" }}
        >
          <div className="h-36 w-36 rounded-full border border-line-strong bg-fg-primary/[0.03]" />
          <div
            className="absolute left-1/2 top-1/2 h-16 w-16 rounded-full"
            style={{
              transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
              background: color,
              boxShadow: `0 0 40px ${color}`,
            }}
          />
        </div>
      )}
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
