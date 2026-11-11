import { rgba } from "../../kit/color";
import { RUNNER } from "../sim/constants";
import { SCENE, type RunnerColors } from "./palette";

export interface RunnerPose {
  x: number;
  /** Feet (bottom of the blob). */
  y: number;
  sx: number;
  sy: number;
  tilt: number;
  facing: 1 | -1;
  /** 0..1 eyelid. */
  blink: number;
  dazed: boolean;
  /** Seconds, for the dizzy-star orbit. */
  t: number;
  appear: number;
}

const R = RUNNER.r + 3;

/** A glossy jelly gumdrop with eyes. Anchored at the feet so squash stays grounded. */
export function drawRunner(ctx: CanvasRenderingContext2D, c: RunnerColors, p: RunnerPose) {
  if (p.appear <= 0.01) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.tilt);
  ctx.scale(p.sx * p.appear, p.sy * p.appear);

  // Body: flat-bottomed dome.
  const body = ctx.createRadialGradient(-R * 0.35, -R * 1.45, R * 0.2, 0, -R * 0.9, R * 1.3);
  body.addColorStop(0, c.light);
  body.addColorStop(0.45, c.body);
  body.addColorStop(1, c.shade);
  ctx.fillStyle = body;
  ctx.strokeStyle = rgba(c.rim, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-R, -R * 0.55);
  ctx.bezierCurveTo(-R, -R * 2.25, R, -R * 2.25, R, -R * 0.55);
  ctx.bezierCurveTo(R, -R * 0.05, R * 0.75, 0, 0, 0);
  ctx.bezierCurveTo(-R * 0.75, 0, -R, -R * 0.05, -R, -R * 0.55);
  ctx.fill();
  ctx.stroke();

  // Gloss.
  ctx.fillStyle = rgba("#ffffff", 0.5);
  ctx.beginPath();
  ctx.ellipse(-R * 0.42, -R * 1.42, R * 0.24, R * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba("#ffffff", 0.35);
  ctx.beginPath();
  ctx.arc(-R * 0.08, -R * 1.6, R * 0.06, 0, Math.PI * 2);
  ctx.fill();

  // Face looks where it's going.
  const fx = p.facing * R * 0.22;
  const ey = -R * 0.98;
  for (const side of [-1, 1]) {
    const ex = fx + side * R * 0.32;
    if (p.dazed) {
      ctx.strokeStyle = SCENE.ink;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ex - 4, ey - 4);
      ctx.lineTo(ex + 4, ey + 4);
      ctx.moveTo(ex + 4, ey - 4);
      ctx.lineTo(ex - 4, ey + 4);
      ctx.stroke();
      continue;
    }
    const open = 1 - p.blink;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(ex, ey, 5.6, Math.max(0.8, 7 * open), 0, 0, Math.PI * 2);
    ctx.fill();
    if (open > 0.3) {
      ctx.fillStyle = SCENE.ink;
      ctx.beginPath();
      ctx.arc(ex + p.facing * 1.6, ey + 1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex + p.facing * 1.6 - 1, ey - 0.6, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = rgba(SCENE.blush, 0.45);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(fx + side * R * 0.62, ey + 9, 4.5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (p.dazed) {
    // Three little stars orbiting overhead.
    for (let i = 0; i < 3; i++) {
      const a = p.t * 7 + (i * Math.PI * 2) / 3;
      const sx = p.x + Math.cos(a) * 20;
      const sy = p.y - R * 2.2 + Math.sin(a) * 6;
      star(ctx, sx, sy, 4.5, rgba(SCENE.gold, 0.6 + 0.4 * Math.sin(a)));
    }
  }
}

/** Soft contact shadow on whatever surface is below. */
export function drawShadow(ctx: CanvasRenderingContext2D, x: number, surface: number, height: number) {
  const k = Math.max(0, 1 - height / 360);
  if (k <= 0) return;
  ctx.fillStyle = rgba(SCENE.ink, 0.28 * k);
  ctx.beginPath();
  ctx.ellipse(x, surface + 1, R * (0.6 + 0.4 * k), 5 * k + 1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
}
