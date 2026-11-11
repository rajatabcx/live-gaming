import { VIEW_H, VIEW_W } from "../sim/constants";
import { rgba } from "../../kit/color";
import { drawGlow, seeded } from "../../kit/sprites";
import type { View } from "../../kit/view";
import { SCENE } from "./palette";

interface Cloud {
  x: number;
  y: number;
  w: number;
  puffs: { dx: number; dy: number; r: number }[];
}

const CLOUD_PERIOD = 3600;

/**
 * Dusk sky (baked, screen-fixed), two parallax hill bands and drifting
 * candy-floss clouds. Nothing here touches the sim.
 */
export class Scenery {
  readonly sky: HTMLCanvasElement;
  private key = "";
  private clouds: Cloud[] = [];

  constructor() {
    this.sky = document.createElement("canvas");
    const rand = seeded(11);
    for (let i = 0; i < 9; i++) {
      const w = 160 + rand() * 220;
      const puffs = Array.from({ length: 5 }, (_, k) => ({ dx: (k / 4 - 0.5) * w, dy: -Math.sin((k / 4) * Math.PI) * 26 * (0.6 + rand() * 0.6), r: 26 + rand() * 30 }));
      this.clouds.push({ x: (i / 9) * CLOUD_PERIOD + rand() * 200, y: 120 + rand() * 300, w, puffs });
    }
  }

  ensure(view: View) {
    const key = view.key();
    if (key === this.key) return;
    this.key = key;
    this.sky.width = Math.round(view.width * view.dpr);
    this.sky.height = Math.round(view.height * view.dpr);
    const ctx = this.sky.getContext("2d")!;
    const cam = view.camX;
    view.camX = 0;
    view.apply(ctx);
    const b = view.bounds;
    view.camX = cam;

    const g = ctx.createLinearGradient(0, b.top, 0, VIEW_H * 0.9);
    g.addColorStop(0, SCENE.skyTop);
    g.addColorStop(0.45, SCENE.skyMid);
    g.addColorStop(0.8, SCENE.skyLow);
    g.addColorStop(1, SCENE.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);

    // A low sun, half-sunk: the one warm light in the scene.
    const sun = { x: VIEW_W * 0.72, y: VIEW_H * 0.62, r: 110 };
    drawGlow(ctx, SCENE.horizon, sun.x, sun.y, 620, 0.55);
    drawGlow(ctx, SCENE.sun, sun.x, sun.y, 260, 0.5);
    ctx.fillStyle = rgba(SCENE.sun, 0.9);
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, sun.r, 0, Math.PI * 2);
    ctx.fill();
    // Banding across the sun, like heat shimmer.
    ctx.fillStyle = rgba(SCENE.skyLow, 0.35);
    for (let i = 0; i < 4; i++) ctx.fillRect(sun.x - sun.r, sun.y + 18 + i * 22, sun.r * 2, 4 + i * 2);

    // A few early stars up high.
    const rand = seeded(5);
    for (let i = 0; i < 70; i++) {
      const x = b.left + rand() * (b.right - b.left);
      const y = b.top + rand() * (VIEW_H * 0.35 - b.top);
      ctx.fillStyle = rgba(SCENE.cream, 0.15 + rand() * 0.35);
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + rand() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSky(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.sky, 0, 0);
  }

  /** Clouds and hills, each in its own parallax space. Leaves the view transform reset to world space. */
  drawFar(ctx: CanvasRenderingContext2D, view: View, t: number) {
    const cam = view.camX;
    const camY = view.camY;

    this.layer(ctx, view, cam * 0.06, () => {
      const b = view.bounds;
      for (const c of this.clouds) {
        const span = CLOUD_PERIOD;
        let x = ((c.x + t * 6 - b.left) % span + span) % span + b.left - 300;
        if (x > b.right + 300) x -= span;
        for (const p of c.puffs) drawGlow(ctx, SCENE.cloud, x + p.dx, c.y + p.dy, p.r * 2.2, 0.16);
      }
    });

    this.layer(ctx, view, cam * 0.18, () => hills(ctx, view, 560, 70, 0.0021, 3.1, SCENE.hillFar));
    this.layer(ctx, view, cam * 0.36, () => hills(ctx, view, 640, 60, 0.0034, 7.7, SCENE.hillNear));

    view.camX = cam;
    view.camY = camY;
    view.apply(ctx);
  }

  /** The drop under every gap: fades into dusk mist instead of a hard black. */
  drawAbyss(ctx: CanvasRenderingContext2D, view: View) {
    const b = view.bounds;
    const g = ctx.createLinearGradient(0, 700, 0, 1000);
    g.addColorStop(0, rgba(SCENE.pit, 0));
    g.addColorStop(0.45, rgba(SCENE.pit, 0.85));
    g.addColorStop(1, SCENE.pit);
    ctx.fillStyle = g;
    ctx.fillRect(b.left, 700, b.right - b.left, Math.max(300, b.bottom - 700));
  }

  private layer(ctx: CanvasRenderingContext2D, view: View, camX: number, draw: () => void) {
    view.camX = camX;
    view.apply(ctx);
    draw();
  }
}

/** A rolling hill silhouette filling from `base` down, sampled across the visible span. */
function hills(ctx: CanvasRenderingContext2D, view: View, base: number, amp: number, freq: number, seed: number, color: string) {
  const b = view.bounds;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b.left - 40, b.bottom + 10);
  for (let x = b.left - 40; x <= b.right + 40; x += 24) {
    const y = base - amp * (0.6 * Math.sin(x * freq + seed) + 0.3 * Math.sin(x * freq * 2.3 + seed * 1.7) + 0.1 * Math.sin(x * freq * 5.1));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(b.right + 40, b.bottom + 10);
  ctx.closePath();
  ctx.fill();
}
