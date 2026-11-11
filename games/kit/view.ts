/**
 * Fits a fixed-size world window (contain) into the canvas, centred, with an
 * optional camera offset for scrolling games. Scenery may draw past the window
 * to fill letterbox space, so there are never bars.
 */
export class View {
  /** CSS pixels. */
  width = 1;
  height = 1;
  dpr = 1;
  scale = 1;
  ox = 0;
  oy = 0;
  /** World-space top-left of the window. */
  camX = 0;
  camY = 0;

  constructor(
    readonly worldW: number,
    readonly worldH: number,
  ) {}

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    this.scale = Math.min(this.width / this.worldW, this.height / this.worldH);
    this.ox = (this.width - this.worldW * this.scale) / 2;
    this.oy = (this.height - this.worldH * this.scale) / 2;
  }

  /** Visible world-space bounds (wider/taller than the window on letterboxed screens). */
  get bounds() {
    return {
      left: this.camX - this.ox / this.scale,
      top: this.camY - this.oy / this.scale,
      right: this.camX + (this.width - this.ox) / this.scale,
      bottom: this.camY + (this.height - this.oy) / this.scale,
    };
  }

  /** Map world space onto the device-pixel canvas. */
  apply(ctx: CanvasRenderingContext2D) {
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.dpr * (this.ox - this.camX * this.scale), this.dpr * (this.oy - this.camY * this.scale));
  }

  applyScreen(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Changes whenever cached, view-dependent layers must be rebuilt. */
  key() {
    return `${this.width}x${this.height}@${this.dpr}`;
  }
}
