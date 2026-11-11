import { rgba } from "../../kit/color";
import { drawGlow } from "../../kit/sprites";
import { SCENE, type FrogColors } from "./color";

export interface FrogPose {
  /** Feet centre, world space. */
  x: number;
  y: number;
  facing: 1 | -1;
  /** Squash & stretch (1 = rest). */
  sx: number;
  sy: number;
  /** Pupil offset, -1..1 each axis (already in the frog's facing frame). */
  lookX: number;
  lookY: number;
  /** 0 open … 1 shut. */
  blink: number;
  airborne: boolean;
  mouthOpen: boolean;
  /** 0..1 — cheeks when tongue-tied to each other. */
  blush: number;
  /** 0..1 overall presence (respawn fade). */
  alpha: number;
}

/**
 * A round little frog, drawn from the feet up in its own facing frame.
 * Coordinates are tuned to the physics box (46 × 36) and mouth (19, 5).
 */
export function drawFrog(ctx: CanvasRenderingContext2D, pose: FrogPose, c: FrogColors) {
  if (pose.alpha <= 0.01) return;
  drawGlow(ctx, c.body, pose.x, pose.y - 18, 78, 0.2 * pose.alpha);

  ctx.save();
  ctx.globalAlpha = pose.alpha;
  ctx.translate(pose.x, pose.y);
  ctx.scale(pose.facing * pose.sx, pose.sy);

  const leg = pose.airborne ? 4 : 0;

  // Back leg (thigh), behind the body.
  ctx.fillStyle = c.shade;
  ctx.beginPath();
  ctx.ellipse(-13, -7 + leg, 12, 8 + leg * 0.5, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Body.
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.ellipse(0, -15, 22, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye bumps.
  ctx.beginPath();
  ctx.arc(4, -27, 8, 0, Math.PI * 2);
  ctx.arc(16, -25, 7, 0, Math.PI * 2);
  ctx.fill();

  // Soft top light.
  ctx.fillStyle = rgba(SCENE.cream, 0.16);
  ctx.beginPath();
  ctx.ellipse(-4, -23, 12, 4.5, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // Belly.
  ctx.fillStyle = c.belly;
  ctx.globalAlpha = pose.alpha * 0.9;
  ctx.beginPath();
  ctx.ellipse(7, -8, 12, 6, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = pose.alpha;

  // Front foot.
  ctx.fillStyle = c.shade;
  ctx.beginPath();
  ctx.ellipse(15, -1.5 + leg * 0.6, 6.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes.
  for (const [ex, ey, r] of [
    [4, -28, 5.6],
    [16, -26, 5],
  ] as const) {
    ctx.fillStyle = SCENE.cream;
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCENE.ink;
    ctx.beginPath();
    ctx.arc(ex + pose.lookX * r * 0.38, ey + pose.lookY * r * 0.38, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    if (pose.blink > 0.02) {
      ctx.fillStyle = c.body;
      ctx.beginPath();
      ctx.ellipse(ex, ey - r * (1 - pose.blink), r + 0.6, r * pose.blink + 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Mouth.
  if (pose.mouthOpen) {
    ctx.fillStyle = "#3a1622";
    ctx.beginPath();
    ctx.ellipse(20, -13, 3.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = rgba(SCENE.ink, 0.55);
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(11, -13);
    ctx.quadraticCurveTo(16, -10.5, 21, -14);
    ctx.stroke();
  }

  if (pose.blush > 0.01) {
    ctx.fillStyle = rgba(SCENE.rose, 0.55 * pose.blush);
    ctx.beginPath();
    ctx.ellipse(12, -17, 4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
