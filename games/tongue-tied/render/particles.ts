import { rgba } from "./color";
import { drawGlow } from "./sprites";

type Kind = "dust" | "spark" | "drop" | "ring" | "heart" | "mote";

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
}

const MAX = 500;

/** Fire-and-forget visual effects. Purely cosmetic: never read by the sim. */
export class Particles {
  private list: Particle[] = [];

  spawn(kind: Kind, x: number, y: number, o: Partial<Omit<Particle, "kind" | "x" | "y">> = {}) {
    if (this.list.length >= MAX) this.list.shift();
    const max = o.max ?? 0.6;
    this.list.push({
      kind,
      x,
      y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      life: max,
      max,
      size: o.size ?? 3,
      color: o.color ?? "#ffffff",
      gravity: o.gravity ?? 0,
      drag: o.drag ?? 0,
    });
  }

  burst(kind: Kind, x: number, y: number, n: number, speed: number, o: Partial<Omit<Particle, "kind" | "x" | "y">> = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(kind, x, y, { ...o, vx: Math.cos(a) * s + (o.vx ?? 0), vy: Math.sin(a) * s + (o.vy ?? 0), max: (o.max ?? 0.6) * (0.7 + Math.random() * 0.6) });
    }
  }

  clear() {
    this.list = [];
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const t = p.life / p.max; // 1 → 0
      switch (p.kind) {
        case "dust":
          ctx.fillStyle = rgba(p.color, 0.28 * t);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case "drop":
          ctx.fillStyle = rgba(p.color, 0.7 * t);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "spark":
        case "mote":
          drawGlow(ctx, p.color, p.x, p.y, p.size * 6, (p.kind === "mote" ? 0.35 : 0.8) * Math.sin(t * Math.PI));
          ctx.fillStyle = rgba(p.color, Math.min(1, t * 1.5));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "ring":
          ctx.strokeStyle = rgba(p.color, 0.55 * t);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + (1 - t) * 34, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "heart":
          heart(ctx, p.x, p.y, p.size * (0.7 + (1 - t) * 0.5), rgba(p.color, Math.min(1, t * 2) * 0.9));
          break;
      }
    }
  }
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.7, y - s * 1.3, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.1, x, y + s * 0.9);
  ctx.fill();
}
