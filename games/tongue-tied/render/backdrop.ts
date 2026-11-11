import { WORLD_H, WORLD_W } from "../sim/constants";
import type { LevelData } from "../sim/level";
import type { Rect } from "../sim/math";
import { rgba } from "../../kit/color";
import { seeded } from "../../kit/sprites";
import type { View } from "../../kit/view";
import { SCENE } from "./color";

export const MOON = { x: 1300, y: 140, r: 44 };

export interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

/**
 * Everything that never moves, pre-rendered at device resolution: the sky
 * layer (behind everything) and the terrain layer (solids). Rebuilt on resize.
 */
export class Backdrop {
  sky: HTMLCanvasElement;
  terrain: HTMLCanvasElement;
  /** Stars that twinkle live on top of the baked sky. */
  twinklers: Star[] = [];
  private key = "";

  constructor() {
    this.sky = document.createElement("canvas");
    this.terrain = document.createElement("canvas");
  }

  ensure(view: View, level: LevelData) {
    const key = `${view.key()}|${level.id}`;
    if (key === this.key) return;
    this.key = key;
    for (const c of [this.sky, this.terrain]) {
      c.width = Math.round(view.width * view.dpr);
      c.height = Math.round(view.height * view.dpr);
    }
    this.paintSky(view, level);
    this.paintTerrain(view, level);
  }

  private paintSky(view: View, level: LevelData) {
    const ctx = this.sky.getContext("2d")!;
    const b = view.bounds;
    view.apply(ctx);
    const rand = seeded(7);

    const sky = ctx.createLinearGradient(0, b.top, 0, WORLD_H);
    sky.addColorStop(0, SCENE.skyTop);
    sky.addColorStop(0.55, SCENE.skyMid);
    sky.addColorStop(1, SCENE.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);

    // Stars — denser up high, gone near the horizon.
    this.twinklers = [];
    for (let i = 0; i < 140; i++) {
      const x = b.left + rand() * (b.right - b.left);
      const y = b.top + Math.pow(rand(), 1.6) * (620 - b.top);
      const r = 0.5 + rand() * 1.1;
      if (Math.hypot(x - MOON.x, y - MOON.y) < MOON.r * 2.2) continue;
      if (i % 4 === 0) {
        this.twinklers.push({ x, y, r: r + 0.2, phase: rand() * 6.28, speed: 0.6 + rand() * 1.6 });
        continue;
      }
      ctx.fillStyle = rgba(SCENE.cream, 0.18 + rand() * 0.4 * (1 - y / 700));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Moon: halo, disc, a hint of surface.
    const halo = ctx.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.8, MOON.x, MOON.y, MOON.r * 9);
    halo.addColorStop(0, rgba(SCENE.glow, 0.16));
    halo.addColorStop(0.35, rgba(SCENE.glow, 0.05));
    halo.addColorStop(1, rgba(SCENE.glow, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(MOON.x - MOON.r * 9, MOON.y - MOON.r * 9, MOON.r * 18, MOON.r * 18);
    const disc = ctx.createRadialGradient(MOON.x - 12, MOON.y - 14, 4, MOON.x, MOON.y, MOON.r);
    disc.addColorStop(0, "#fffaf2");
    disc.addColorStop(1, "#ead9c4");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(MOON.x, MOON.y, MOON.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(120,96,80,0.07)";
    for (const [dx, dy, r] of [
      [-14, 6, 9],
      [12, -10, 6],
      [8, 16, 5],
    ]) {
      ctx.beginPath();
      ctx.arc(MOON.x + dx, MOON.y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Two layers of soft hills, then reeds along the waterline.
    const horizon = level.water ?? WORLD_H - 40;
    this.hills(ctx, b.left, b.right, horizon - 150, 46, 0.0042, 1.3, SCENE.hillFar, horizon);
    this.hills(ctx, b.left, b.right, horizon - 80, 34, 0.0071, 4.1, SCENE.hillNear, horizon);
    // Low mist over the pond gives gaps some depth instead of a flat pit.
    const mist = ctx.createLinearGradient(0, horizon - 170, 0, horizon);
    mist.addColorStop(0, rgba(SCENE.cream, 0));
    mist.addColorStop(1, rgba(SCENE.cream, 0.045));
    ctx.fillStyle = mist;
    ctx.fillRect(b.left, horizon - 170, b.right - b.left, 170);

    ctx.strokeStyle = SCENE.reed;
    ctx.lineCap = "round";
    for (let i = 0; i < 70; i++) {
      const x = b.left + rand() * (b.right - b.left);
      const h = 30 + rand() * 70;
      const lean = (rand() - 0.5) * 30;
      ctx.lineWidth = 1.5 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(x, horizon + 4);
      ctx.quadraticCurveTo(x + lean * 0.3, horizon - h * 0.6, x + lean, horizon - h);
      ctx.stroke();
    }
  }

  private hills(
    ctx: CanvasRenderingContext2D,
    left: number,
    right: number,
    base: number,
    amp: number,
    freq: number,
    phase: number,
    color: string,
    floor: number,
  ) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(left, floor + 10);
    for (let x = left; x <= right + 20; x += 20) {
      const y = base - Math.sin(x * freq + phase) * amp - Math.sin(x * freq * 2.7 + phase * 2) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(right + 20, floor + 10);
    ctx.closePath();
    ctx.fill();
  }

  private paintTerrain(view: View, level: LevelData) {
    const ctx = this.terrain.getContext("2d")!;
    ctx.clearRect(0, 0, this.terrain.width, this.terrain.height);
    view.apply(ctx);
    const b = view.bounds;
    const rand = seeded(level.id.length * 131 + 3);
    for (const solid of level.solids) paintStone(ctx, extendToScreen(solid, b), solid, rand);
  }
}

/** Solids that touch a world edge continue into the letterbox. */
function extendToScreen(r: Rect, b: View["bounds"]): Rect {
  const x0 = r.x <= 0 ? b.left - 4 : r.x;
  const x1 = r.x + r.w >= WORLD_W ? b.right + 4 : r.x + r.w;
  const y1 = r.y + r.h >= WORLD_H ? b.bottom + 4 : r.y + r.h;
  return { x: x0, y: r.y, w: x1 - x0, h: y1 - r.y };
}

/** A dark mossy stone with a lit top edge — the look of every solid. */
export function paintStone(ctx: CanvasRenderingContext2D, r: Rect, original: Rect, rand: () => number) {
  const leftOpen = r.x < original.x;
  const rightOpen = r.x + r.w > original.x + original.w;
  const radius = 16;
  const rad: [number, number, number, number] = [leftOpen ? 0 : radius, rightOpen ? 0 : radius, 0, 0];

  const body = ctx.createLinearGradient(0, r.y, 0, r.y + 280);
  body.addColorStop(0, SCENE.stoneTop);
  body.addColorStop(1, SCENE.stoneLow);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, rad);
  ctx.fill();

  // Moss: a faint band and a crisp lit edge.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, rad);
  ctx.clip();
  const band = ctx.createLinearGradient(0, r.y, 0, r.y + 18);
  band.addColorStop(0, rgba(SCENE.moss, 0.16));
  band.addColorStop(1, rgba(SCENE.moss, 0));
  ctx.fillStyle = band;
  ctx.fillRect(r.x, r.y, r.w, 18);
  ctx.restore();

  ctx.strokeStyle = rgba(SCENE.moss, 0.55);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const x0 = r.x + (leftOpen ? 0 : radius);
  const x1 = r.x + r.w - (rightOpen ? 0 : radius);
  if (!leftOpen) ctx.arc(r.x + radius, r.y + radius, radius, Math.PI * 1.25, Math.PI * 1.5);
  else ctx.moveTo(x0, r.y + 0.75);
  ctx.lineTo(x1, r.y + 0.75);
  if (!rightOpen) ctx.arc(r.x + r.w - radius, r.y + radius, radius, Math.PI * 1.5, Math.PI * 1.75);
  ctx.stroke();

  // Grass tufts along the top.
  ctx.lineCap = "round";
  const count = Math.floor(r.w / 46);
  for (let i = 0; i < count; i++) {
    const x = r.x + 18 + rand() * (r.w - 36);
    const h = 5 + rand() * 9;
    ctx.strokeStyle = rgba(SCENE.moss, 0.22 + rand() * 0.3);
    ctx.lineWidth = 1.2;
    for (const lean of [-3, 0, 3]) {
      ctx.beginPath();
      ctx.moveTo(x + lean * 0.4, r.y + 1);
      ctx.quadraticCurveTo(x + lean * 0.6, r.y - h * 0.6, x + lean, r.y - h * (lean === 0 ? 1 : 0.7));
      ctx.stroke();
    }
  }
}
