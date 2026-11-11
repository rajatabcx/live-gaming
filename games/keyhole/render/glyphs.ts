import type { ItemId, SymbolId } from "../sim/chapter";
import { BRASS } from "./palette";

const TAU = Math.PI * 2;

/** The eight marks clues and dials share. Drawn centred on (x, y) inside radius r. */
export function drawSymbol(ctx: CanvasRenderingContext2D, id: SymbolId, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (id) {
    case "moon":
      ctx.arc(0, 0, r * 0.8, 0.35 * Math.PI, 1.65 * Math.PI);
      ctx.arc(r * 0.35, -r * 0.05, r * 0.62, 1.55 * Math.PI, 0.45 * Math.PI, true);
      ctx.fill();
      break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 10;
        const k = i % 2 === 0 ? r * 0.9 : r * 0.38;
        ctx.lineTo(Math.cos(a) * k, Math.sin(a) * k);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "sun":
      ctx.arc(0, 0, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8;
        ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
        ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      }
      ctx.stroke();
      break;
    case "wave":
      for (const dy of [-0.28, 0.28]) {
        ctx.moveTo(-r * 0.85, dy * r);
        ctx.bezierCurveTo(-r * 0.45, (dy - 0.42) * r, -r * 0.05, (dy + 0.42) * r, r * 0.3, dy * r);
        ctx.quadraticCurveTo(r * 0.55, (dy - 0.25) * r, r * 0.85, dy * r);
      }
      ctx.stroke();
      break;
    case "leaf":
      ctx.moveTo(-r * 0.75, r * 0.6);
      ctx.quadraticCurveTo(-r * 0.7, -r * 0.7, r * 0.75, -r * 0.75);
      ctx.quadraticCurveTo(r * 0.6, r * 0.6, -r * 0.75, r * 0.6);
      ctx.fill();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r * 0.45);
      ctx.lineTo(r * 0.55, -r * 0.55);
      ctx.stroke();
      break;
    case "heart":
      ctx.moveTo(0, r * 0.8);
      ctx.bezierCurveTo(-r * 1.15, 0, -r * 0.6, -r * 0.95, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.6, -r * 0.95, r * 1.15, 0, 0, r * 0.8);
      ctx.fill();
      break;
    case "key":
      ctx.arc(-r * 0.45, 0, r * 0.32, 0, TAU);
      ctx.moveTo(-r * 0.13, 0);
      ctx.lineTo(r * 0.85, 0);
      ctx.moveTo(r * 0.55, 0);
      ctx.lineTo(r * 0.55, r * 0.32);
      ctx.moveTo(r * 0.8, 0);
      ctx.lineTo(r * 0.8, r * 0.26);
      ctx.stroke();
      break;
    case "bird":
      ctx.moveTo(-r * 0.9, -r * 0.1);
      ctx.quadraticCurveTo(-r * 0.45, -r * 0.6, 0, r * 0.15);
      ctx.quadraticCurveTo(r * 0.45, -r * 0.6, r * 0.9, -r * 0.1);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Inventory and hand-off icons. */
export function drawItem(ctx: CanvasRenderingContext2D, id: ItemId, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  switch (id) {
    case "brass-key":
      ctx.rotate(-0.5);
      drawSymbol(ctx, "key", 0, 0, r, BRASS.light);
      break;
    case "seeds":
      ctx.fillStyle = "#d7b98a";
      ctx.beginPath();
      ctx.roundRect(-r * 0.55, -r * 0.75, r * 1.1, r * 1.5, r * 0.12);
      ctx.fill();
      ctx.fillStyle = "#93c49a";
      drawSymbol(ctx, "leaf", 0, -r * 0.05, r * 0.42, "#5e8f66");
      ctx.fillStyle = "#b08f62";
      ctx.fillRect(-r * 0.55, -r * 0.75, r * 1.1, r * 0.22);
      break;
    case "lens": {
      const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r * 0.75);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(0.5, "rgba(170,210,255,0.45)");
      g.addColorStop(1, "rgba(120,170,230,0.25)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = BRASS.base;
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** A keyhole silhouette centred on (x, y), height h. Call fill()/clip() after. */
export function keyholePath(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const r = h * 0.3;
  const cy = y - h * 0.5 + r;
  ctx.beginPath();
  ctx.arc(x, cy, r, Math.PI * 0.72, Math.PI * 0.28);
  ctx.lineTo(x + h * 0.26, y + h * 0.5);
  ctx.lineTo(x - h * 0.26, y + h * 0.5);
  ctx.closePath();
}
