import { WORLD_H, WORLD_W } from "../sim/constants";

/**
 * Fits the 1600×900 world into the canvas (contain), centred. Scenery is drawn
 * past the world edges to fill letterbox space, so there are never bars.
 */
export class View {
  /** CSS pixels. */
  width = 1;
  height = 1;
  dpr = 1;
  scale = 1;
  ox = 0;
  oy = 0;

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    this.scale = Math.min(this.width / WORLD_W, this.height / WORLD_H);
    this.ox = (this.width - WORLD_W * this.scale) / 2;
    this.oy = (this.height - WORLD_H * this.scale) / 2;
  }

  /** Visible world-space bounds (wider/taller than the world on letterboxed screens). */
  get bounds() {
    return {
      left: -this.ox / this.scale,
      top: -this.oy / this.scale,
      right: (this.width - this.ox) / this.scale,
      bottom: (this.height - this.oy) / this.scale,
    };
  }

  /** Map world space onto the device-pixel canvas. */
  apply(ctx: CanvasRenderingContext2D) {
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.dpr * this.ox, this.dpr * this.oy);
  }

  applyScreen(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  key() {
    return `${this.width}x${this.height}@${this.dpr}`;
  }
}
