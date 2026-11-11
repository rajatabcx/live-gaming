import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import type { GameSource } from "../types";

/**
 * Asymmetric games: each player sees something the other can't.
 *
 * Which players' views a screen shows:
 *  - a remote screen shows its own player's view (a spectator sees both);
 *  - the host screen shows everyone who is looking at it — players on phones
 *    or its own keyboard. Nobody? (both far away) It's a spectator TV: both.
 * Two views on one screen are drawn side by side — the couch fallback.
 */
export function viewSlots(source: GameSource, players: readonly PlayerInfo[]): PlayerSlot[] {
  if (source.role === "screen") return source.feed.self ? [source.feed.self.slot] : [0, 1];
  const here = ([0, 1] as PlayerSlot[]).filter((slot) => players.find((p) => p.slot === slot)?.device !== "screen");
  return here.length ? here : [0, 1];
}

export interface Viewport {
  slot: PlayerSlot;
  /** CSS pixels on the canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lay views out side by side, slot order left → right, with a hairline gap. */
export function viewports(slots: readonly PlayerSlot[], width: number, height: number, gap = 2): Viewport[] {
  const sorted = [...slots].sort((a, b) => a - b);
  const w = (width - gap * (sorted.length - 1)) / sorted.length;
  return sorted.map((slot, i) => ({ slot, x: i * (w + gap), y: 0, w, h: height }));
}

/** World → viewport transform: fit `ww × wh` of world, centred on (cx, cy), contained or covering. */
export function fitTransform(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  dpr: number,
  ww: number,
  wh: number,
  cx: number,
  cy: number,
  mode: "contain" | "cover" = "contain",
): number {
  const s = mode === "contain" ? Math.min(vp.w / ww, vp.h / wh) : Math.max(vp.w / ww, vp.h / wh);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (vp.x + vp.w / 2 - cx * s), dpr * (vp.y + vp.h / 2 - cy * s));
  return s;
}

/** Clip drawing to a viewport (call inside save/restore). */
export function clipTo(ctx: CanvasRenderingContext2D, vp: Viewport, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
}
