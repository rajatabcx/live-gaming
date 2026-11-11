import { PLAYER_COLORS } from "@/design-system/palette";
import type { Rect, Vec } from "../../kit/math";
import { mix, rgba } from "../../kit/color";
import { drawGlow, seeded } from "../../kit/sprites";
import type { CourseData } from "../sim/course";
import { thumperCycle, type Slot, type World } from "../sim/world";
import { SCENE } from "./palette";

interface Drip {
  x: number;
  w: number;
  len: number;
}

interface Bounds {
  left: number;
  right: number;
}

const visible = (r: Rect, b: Bounds) => r.x + r.w > b.left - 60 && r.x < b.right + 60;

/**
 * Draws the course: layered-cake ground, biscuit tiles, jelly pads, candy-cane
 * windmills, wafer rafts, gumdrop thumpers, lollipop checkpoints, the finish.
 * Holds only cosmetic state (springs, claims), reset per heat.
 */
export class CourseArt {
  private drips: Drip[][] = [];
  private padSquash: { v: number; s: number }[] = [];
  private crumbleAppear: number[] = [];
  private claimed: (Slot | null)[] = [];
  private claimPop: number[] = [];
  /** Where each spinner's support pole meets a surface. */
  private poleFoot: number[] = [];
  private lastDrop: number[] = [];
  private flagPhase = 0;

  start(course: CourseData) {
    this.drips = course.solids.map((s) => makeDrips(s));
    this.padSquash = course.pads.map(() => ({ v: 0, s: 0 }));
    this.crumbleAppear = course.crumbles.map(() => 1);
    this.claimed = course.checkpoints.map(() => null);
    this.claimPop = course.checkpoints.map(() => 0);
    this.lastDrop = course.thumpers.map(() => 0);
    this.poleFoot = course.spinners.map((s) => {
      let foot = 1200;
      for (const r of course.solids) if (s.x >= r.x && s.x <= r.x + r.w && r.y >= s.y && r.y < foot) foot = r.y;
      return foot;
    });
  }

  padBounced(course: CourseData, x: number) {
    const i = course.pads.findIndex((p) => x > p.x - 10 && x < p.x + p.w + 10);
    if (i >= 0) this.padSquash[i].v = -14;
  }

  claim(index: number, slot: Slot) {
    if (index === 0 || this.claimed[index] !== null) return;
    this.claimed[index] = slot;
    this.claimPop[index] = 1;
  }

  /** Thumpers that just hit the floor this frame (for dust + shake). */
  slams(world: World): Rect[] {
    const out: Rect[] = [];
    world.thumpers.forEach((m, i) => {
      const t = world.course.thumpers[i];
      const drop = (m.rect.y - t.y) / t.drop;
      if (drop > 0.98 && this.lastDrop[i] <= 0.98) out.push(m.rect);
      this.lastDrop[i] = drop;
    });
    return out;
  }

  /** Behind runners. */
  drawBack(ctx: CanvasRenderingContext2D, world: World, b: Bounds, dt: number, t: number) {
    const c = world.course;
    this.flagPhase += dt;
    this.drawFinishBeam(ctx, c, t);
    this.drawSpinnerPoles(ctx, world, b);
    this.drawSliderRails(ctx, world, b);
    this.drawThumperCords(ctx, world, b);
    this.drawCheckpoints(ctx, c, b, dt);
    c.solids.forEach((s, i) => visible(s, b) && this.drawSlab(ctx, s, this.drips[i]));
    this.drawFinishFlag(ctx, c);
    this.drawCrumbles(ctx, world, b, dt, t);
    this.drawPads(ctx, world, b, dt);
    this.drawSliders(ctx, world, b);
  }

  /** In front of runners: thumpers and windmill bars should read as hitting you. */
  drawFront(ctx: CanvasRenderingContext2D, world: World, b: Bounds, t: number) {
    this.drawThumpers(ctx, world, b, t);
    this.drawSpinners(ctx, world, b);
  }

  // ─── Pieces ─────────────────────────────────────────────────────────────────

  private drawSlab(ctx: CanvasRenderingContext2D, s: Rect, drips: Drip[]) {
    const bottom = Math.min(s.y + s.h, 1300);
    const body = ctx.createLinearGradient(0, s.y, 0, s.y + 340);
    body.addColorStop(0, SCENE.cakeTop);
    body.addColorStop(1, SCENE.cakeLow);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, bottom - s.y, [18, 18, 0, 0]);
    ctx.fill();

    // A jam seam through the sponge.
    ctx.fillStyle = rgba(SCENE.jam, 0.55);
    ctx.fillRect(s.x, s.y + 58, s.w, 7);
    ctx.fillStyle = rgba(SCENE.jam, 0.18);
    ctx.fillRect(s.x, s.y + 130, s.w, 4);

    // Frosting with drips.
    ctx.fillStyle = SCENE.frosting;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + 16);
    ctx.lineTo(s.x, s.y + 12);
    ctx.arcTo(s.x, s.y, s.x + 12, s.y, 12);
    ctx.lineTo(s.x + s.w - 12, s.y);
    ctx.arcTo(s.x + s.w, s.y, s.x + s.w, s.y + 12, 12);
    ctx.lineTo(s.x + s.w, s.y + 16);
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i];
      ctx.lineTo(d.x + d.w, s.y + 16);
      ctx.lineTo(d.x + d.w, s.y + 16 + d.len - d.w / 2);
      ctx.arc(d.x + d.w / 2, s.y + 16 + d.len - d.w / 2, d.w / 2, 0, Math.PI);
      ctx.lineTo(d.x, s.y + 16);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(SCENE.frostingShade, 0.6);
    ctx.fillRect(s.x + 4, s.y + 12, s.w - 8, 4);
    ctx.fillStyle = rgba("#ffffff", 0.5);
    ctx.fillRect(s.x + 14, s.y + 3, s.w - 28, 2);
  }

  private drawCrumbles(ctx: CanvasRenderingContext2D, world: World, b: Bounds, dt: number, t: number) {
    world.crumbles.forEach((c, i) => {
      if (!visible(c.rect, b)) return;
      const r = c.rect;
      if (c.state === "falling") this.crumbleAppear[i] = 0;
      else this.crumbleAppear[i] = Math.min(1, this.crumbleAppear[i] + dt * 3);
      const appear = this.crumbleAppear[i];
      const alpha = c.state === "falling" ? Math.max(0, 1 - c.fall / 260) : appear;
      if (alpha <= 0) return;
      const shake = c.state === "shaking" ? Math.sin(t * 70 + i) * 2.2 : 0;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(r.x + r.w / 2 + shake, r.y + r.h / 2 + (c.state === "falling" ? c.fall : (1 - appear) * -10));
      if (c.state === "falling") ctx.rotate((i % 2 ? 1 : -1) * c.fall * 0.003);
      ctx.fillStyle = SCENE.biscuitShade;
      ctx.beginPath();
      ctx.roundRect(-r.w / 2, -r.h / 2 + 3, r.w, r.h, 7);
      ctx.fill();
      ctx.fillStyle = c.state === "shaking" ? mix(SCENE.biscuit, SCENE.cane, 0.18) : SCENE.biscuit;
      ctx.beginPath();
      ctx.roundRect(-r.w / 2, -r.h / 2, r.w, r.h - 4, 7);
      ctx.fill();
      ctx.fillStyle = rgba(SCENE.biscuitShade, 0.7);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(-r.w / 2 + (r.w / 4) * (k + 1), -2, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  private drawPads(ctx: CanvasRenderingContext2D, world: World, b: Bounds, dt: number) {
    world.course.pads.forEach((p, i) => {
      const sq = this.padSquash[i];
      sq.v += (-sq.s * 260 - sq.v * 9) * dt;
      sq.s += sq.v * dt;
      if (p.x + p.w < b.left - 60 || p.x > b.right + 60) return;
      const h = 20 * (1 + sq.s * 0.06);
      const cx = p.x + p.w / 2;
      drawGlow(ctx, SCENE.jelly, cx, p.y - 8, 70, 0.18);
      ctx.fillStyle = SCENE.jellyShade;
      ctx.beginPath();
      ctx.ellipse(cx, p.y, p.w / 2 + 2, h + 2, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = SCENE.jelly;
      ctx.beginPath();
      ctx.ellipse(cx, p.y, p.w / 2, h, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = rgba("#ffffff", 0.55);
      ctx.beginPath();
      ctx.ellipse(cx - p.w * 0.16, p.y - h * 0.6, p.w * 0.14, h * 0.18, -0.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawSpinnerPoles(ctx: CanvasRenderingContext2D, world: World, b: Bounds) {
    world.course.spinners.forEach((s, i) => {
      if (s.x < b.left - 200 || s.x > b.right + 200) return;
      const foot = this.poleFoot[i];
      ctx.fillStyle = rgba(SCENE.caneWhite, 0.16);
      ctx.fillRect(s.x - 5, s.y, 10, foot - s.y);
      ctx.fillStyle = rgba(SCENE.caneWhite, 0.25);
      ctx.beginPath();
      ctx.ellipse(s.x, foot, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawSpinners(ctx: CanvasRenderingContext2D, world: World, b: Bounds) {
    world.course.spinners.forEach((s, i) => {
      if (s.x < b.left - 200 || s.x > b.right + 200) return;
      const [a, e] = world.spinnerBar(i);
      const angle = Math.atan2(e.y - a.y, e.x - a.x);
      const len = s.arm * 2;
      const th = 18;

      // Motion smear behind each tip, showing which way it turns.
      ctx.strokeStyle = rgba(SCENE.caneWhite, 0.08);
      ctx.lineWidth = th;
      ctx.lineCap = "round";
      const back = -Math.sign(s.speed) * 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.arm - th / 2, angle, angle + back, back < 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.arm - th / 2, angle + Math.PI, angle + Math.PI + back, back < 0);
      ctx.stroke();

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(angle);
      ctx.fillStyle = rgba(SCENE.ink, 0.35);
      ctx.beginPath();
      ctx.roundRect(-len / 2, -th / 2 + 4, len, th, th / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-len / 2, -th / 2, len, th, th / 2);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = SCENE.caneWhite;
      ctx.fillRect(-len / 2, -th / 2, len, th);
      ctx.fillStyle = SCENE.cane;
      for (let x = -len / 2 - th; x < len / 2 + th; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, th / 2);
        ctx.lineTo(x + 12, th / 2);
        ctx.lineTo(x + 12 + th, -th / 2);
        ctx.lineTo(x + th, -th / 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba("#ffffff", 0.35);
      ctx.fillRect(-len / 2, -th / 2 + 2, len, 3);
      ctx.restore();
      ctx.restore();

      ctx.fillStyle = SCENE.gold;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SCENE.raftShade;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawSliderRails(ctx: CanvasRenderingContext2D, world: World, b: Bounds) {
    ctx.strokeStyle = rgba(SCENE.raft, 0.22);
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 10]);
    ctx.lineCap = "round";
    for (const s of world.course.sliders) {
      if (s.x + s.w + s.dx < b.left - 60 || s.x > b.right + 60) continue;
      const y = s.y + s.h / 2;
      ctx.beginPath();
      ctx.moveTo(s.x + s.w / 2, y);
      ctx.lineTo(s.x + s.w / 2 + s.dx, y + s.dy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private drawSliders(ctx: CanvasRenderingContext2D, world: World, b: Bounds) {
    for (const m of world.sliders) {
      const r = m.rect;
      if (!visible(r, b)) continue;
      ctx.fillStyle = SCENE.raftShade;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y + 4, r.w, r.h, 10);
      ctx.fill();
      ctx.fillStyle = SCENE.raft;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h - 4, 10);
      ctx.fill();
      // Waffle grid.
      ctx.strokeStyle = rgba(SCENE.raftShade, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = r.x + 20; x < r.x + r.w - 8; x += 20) {
        ctx.moveTo(x, r.y + 5);
        ctx.lineTo(x, r.y + r.h - 9);
      }
      ctx.moveTo(r.x + 8, r.y + (r.h - 4) / 2);
      ctx.lineTo(r.x + r.w - 8, r.y + (r.h - 4) / 2);
      ctx.stroke();
      ctx.fillStyle = rgba("#ffffff", 0.45);
      ctx.fillRect(r.x + 10, r.y + 2, r.w - 20, 2);
    }
  }

  private drawThumperCords(ctx: CanvasRenderingContext2D, world: World, b: Bounds) {
    ctx.strokeStyle = rgba(SCENE.caneWhite, 0.18);
    ctx.lineWidth = 3;
    for (const m of world.thumpers) {
      const r = m.rect;
      if (!visible(r, b)) continue;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w / 2, -200);
      ctx.lineTo(r.x + r.w / 2, r.y);
      ctx.stroke();
    }
  }

  private drawThumpers(ctx: CanvasRenderingContext2D, world: World, b: Bounds, t: number) {
    world.thumpers.forEach((m, i) => {
      const r = m.rect;
      if (!visible(r, b)) return;
      const data = world.course.thumpers[i];
      const p = thumperCycle(data, world.time);
      const drop = (r.y - data.y) / data.drop;
      const warn = p > 0.33 && p < 0.45;
      const floorY = data.y + data.drop + data.h;

      // Shadow telegraphs the slam.
      ctx.fillStyle = rgba(SCENE.ink, 0.15 + drop * 0.35 + (warn ? 0.12 : 0));
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, floorY, r.w * (0.35 + drop * 0.2), 6, 0, 0, Math.PI * 2);
      ctx.fill();

      const jitter = warn ? Math.sin(t * 90) * 1.5 : 0;
      const x = r.x + jitter;
      const body = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      body.addColorStop(0, SCENE.gumTop);
      body.addColorStop(1, SCENE.gum);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(x, r.y, r.w, r.h, [26, 26, 14, 14]);
      ctx.fill();
      ctx.fillStyle = rgba("#ffffff", 0.28);
      ctx.beginPath();
      ctx.ellipse(x + r.w * 0.3, r.y + 16, r.w * 0.18, 6, -0.15, 0, Math.PI * 2);
      ctx.fill();
      // Sugar crystals.
      ctx.fillStyle = rgba("#ffffff", 0.22);
      for (let k = 0; k < 6; k++) ctx.fillRect(x + 14 + ((k * 37) % (r.w - 28)), r.y + 30 + ((k * 23) % (r.h - 50)), 3, 3);

      // Face: calm while up, cross just before the drop, squeezed shut on impact.
      const ey = r.y + r.h * 0.58;
      const shut = drop > 0.9;
      for (const side of [-1, 1]) {
        const ex = x + r.w / 2 + side * 20;
        ctx.fillStyle = SCENE.caneWhite;
        ctx.beginPath();
        if (shut) ctx.ellipse(ex, ey, 9, 2.5, 0, 0, Math.PI * 2);
        else ctx.ellipse(ex, ey, 8, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!shut) {
          ctx.fillStyle = SCENE.ink;
          ctx.beginPath();
          ctx.arc(ex, ey + 3, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        if (warn || shut) {
          ctx.strokeStyle = SCENE.ink;
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(ex - side * 10, ey - 16);
          ctx.lineTo(ex + side * 7, ey - 9);
          ctx.stroke();
        }
      }
    });
  }

  private drawCheckpoints(ctx: CanvasRenderingContext2D, c: CourseData, b: Bounds, dt: number) {
    c.checkpoints.forEach((p: Vec, i) => {
      if (i === 0 || p.x < b.left - 60 || p.x > b.right + 60) return;
      this.claimPop[i] = Math.max(0, this.claimPop[i] - dt * 2.5);
      const owner = this.claimed[i];
      const color = owner === null ? rgba(SCENE.caneWhite, 0.35) : PLAYER_COLORS[owner];
      const x = p.x + 40;
      const top = p.y - 66;
      ctx.fillStyle = rgba(SCENE.caneWhite, 0.5);
      ctx.fillRect(x - 1.5, top, 3, 66);
      const pop = 1 + Math.sin(this.claimPop[i] * Math.PI) * 0.5;
      if (owner !== null) drawGlow(ctx, PLAYER_COLORS[owner], x, top, 40 * pop, 0.35);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, top, 9 * pop, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba("#ffffff", owner === null ? 0.25 : 0.6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, top, 5 * pop, 0.3, Math.PI * 1.7);
      ctx.stroke();
    });
  }

  private drawFinishBeam(ctx: CanvasRenderingContext2D, c: CourseData, t: number) {
    const x = c.finish;
    const g = ctx.createLinearGradient(x - 50, 0, x + 50, 0);
    g.addColorStop(0, rgba(SCENE.gold, 0));
    g.addColorStop(0.5, rgba(SCENE.gold, 0.16 + Math.sin(t * 2) * 0.04));
    g.addColorStop(1, rgba(SCENE.gold, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - 50, -200, 100, 1000);
  }

  private drawFinishFlag(ctx: CanvasRenderingContext2D, c: CourseData) {
    const x = c.finish;
    const ground = 760;
    // Checkered strip across the frosting.
    const size = 10;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = (row + col) % 2 ? SCENE.ink : SCENE.caneWhite;
        ctx.fillRect(x - 20 + col * size, ground + row * size, size, size);
      }
    }
    // Pole and waving checkered flag.
    const top = ground - 230;
    ctx.fillStyle = SCENE.caneWhite;
    ctx.fillRect(x - 2, top, 4, 230);
    ctx.fillStyle = SCENE.gold;
    ctx.beginPath();
    ctx.arc(x, top - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    const cols = 6;
    const rows = 4;
    const cw = 13;
    const ch = 12;
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const wave = (k: number) => Math.sin(this.flagPhase * 5 - (col + k) * 0.7) * (col + k) * 1.4;
        const x0 = x + 2 + col * cw;
        const y0 = top + 4 + row * ch + wave(0);
        const y1 = top + 4 + row * ch + wave(1);
        ctx.fillStyle = (row + col) % 2 ? SCENE.ink : SCENE.caneWhite;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + cw + 0.5, y1);
        ctx.lineTo(x0 + cw + 0.5, y1 + ch + 0.5);
        ctx.lineTo(x0, y0 + ch + 0.5);
        ctx.fill();
      }
    }
  }
}

function makeDrips(s: Rect): Drip[] {
  const rand = seeded(Math.round(s.x * 7 + s.y));
  const out: Drip[] = [];
  let x = s.x + 18 + rand() * 30;
  while (x < s.x + s.w - 40) {
    const w = 10 + rand() * 14;
    out.push({ x, w, len: 6 + rand() * 22 });
    x += w + 26 + rand() * 70;
  }
  return out;
}
