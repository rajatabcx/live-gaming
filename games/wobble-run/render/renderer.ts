import { PLAYER_COLORS } from "@/design-system/palette";
import { clamp, lerp, type Vec } from "../../kit/math";
import { rgba } from "../../kit/color";
import { Particles } from "../../kit/particles";
import { drawGlow } from "../../kit/sprites";
import { View } from "../../kit/view";
import { MOVE, RUNNER, VIEW_H, VIEW_W } from "../sim/constants";
import type { Runner, Slot, World, WorldEvent } from "../sim/world";
import { CourseArt } from "./course-art";
import { CONFETTI, runnerColors, SCENE, type RunnerColors } from "./palette";
import { drawRunner, drawShadow } from "./runner-art";
import { Scenery } from "./scenery";

interface RunnerVis {
  sx: number;
  sy: number;
  vsx: number;
  vsy: number;
  tilt: number;
  blinkIn: number;
  blink: number;
  appear: number;
  /** Seconds left of the dazed face after a whack. */
  dazed: number;
}

export interface FrameOptions {
  /** 0 = black, 1 = fully visible. */
  fade: number;
  /** 0..1 — name tags above runners. */
  names: number;
}

const newVis = (): RunnerVis => ({ sx: 1, sy: 1, vsx: 0, vsy: 0, tilt: 0, blinkIn: 1 + Math.random() * 3, blink: 0, appear: 1, dazed: 0 });

/**
 * Draws a heat. Owns only cosmetic state (springs, particles, shake), derived
 * from world snapshots and events — never the other way round.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private view = new View(VIEW_W, VIEW_H);
  private scenery = new Scenery();
  private art = new CourseArt();
  private particles = new Particles();
  private colors: [RunnerColors, RunnerColors] = [runnerColors(PLAYER_COLORS[0]), runnerColors(PLAYER_COLORS[1])];
  private vis: [RunnerVis, RunnerVis] = [newVis(), newVis()];
  private names: [string, string] = ["", ""];
  private shake = 0;
  private clock = 0;
  private fontFamily = "ui-sans-serif, system-ui, sans-serif";
  /** A thumper hit the floor on screen. */
  onSlam: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    const family = getComputedStyle(canvas).fontFamily;
    if (family) this.fontFamily = family;
  }

  setNames(names: [string, string]) {
    this.names = names;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.view.resize(w, h, dpr);
  }

  startHeat(world: World) {
    this.vis = [newVis(), newVis()];
    this.art.start(world.course);
    this.particles.clear();
    this.shake = 0;
  }

  handle(world: World, events: readonly WorldEvent[]) {
    const P = this.particles;
    for (const e of events) {
      switch (e.type) {
        case "jump": {
          const r = world.runners[e.slot];
          this.kick(e.slot, 0.8, 1.25);
          P.burst("dust", r.pos.x, r.pos.y + RUNNER.r, 5, 60, { color: SCENE.frosting, size: 4, drag: 4, max: 0.4 });
          break;
        }
        case "land": {
          const r = world.runners[e.slot];
          const k = clamp(e.impact / 2400, 0.1, 0.38);
          this.kick(e.slot, 1 + k, 1 - k);
          P.burst("dust", r.pos.x, r.pos.y + RUNNER.r, 4 + Math.round(k * 18), 90, { color: SCENE.frosting, size: 4, drag: 5, vy: -20, max: 0.5 });
          break;
        }
        case "dive":
          this.kick(e.slot, 1.35, 0.72);
          break;
        case "flop": {
          const r = world.runners[e.slot];
          this.kick(e.slot, 1.45, 0.6);
          P.burst("dust", r.pos.x, r.pos.y + RUNNER.r, 10, 140, { color: SCENE.frosting, size: 5, drag: 5, vy: -30, max: 0.55 });
          break;
        }
        case "bump":
          P.spawn("ring", e.x, e.y, { color: SCENE.caneWhite, size: e.hard ? 14 : 6, max: e.hard ? 0.5 : 0.3 });
          if (e.hard) {
            P.burst("spark", e.x, e.y, 10, 220, { color: SCENE.gold, size: 2.5, drag: 4, max: 0.5 });
            this.shake = Math.max(this.shake, 7);
            if (e.victim !== null) this.vis[e.victim].dazed = 0.8;
          }
          break;
        case "whack": {
          this.kick(e.slot, 1.3, 0.75);
          this.vis[e.slot].dazed = 0.9;
          P.burst("spark", e.x, e.y, 12, 260, { color: SCENE.caneWhite, size: 2.5, drag: 4, max: 0.45 });
          P.spawn("ring", e.x, e.y, { color: SCENE.cane, size: 10, max: 0.4 });
          this.shake = Math.max(this.shake, 9);
          break;
        }
        case "bounce":
          this.kick(e.slot, 0.7, 1.4);
          this.art.padBounced(world.course, e.x);
          P.burst("drop", e.x, e.y - 8, 10, 200, { color: SCENE.jelly, size: 3, gravity: 1200, vy: -200, max: 0.6 });
          break;
        case "crumble": {
          const c = world.crumbles[e.index].rect;
          P.burst("drop", c.x + c.w / 2, c.y + c.h / 2, 10, 140, { color: SCENE.biscuit, size: 3, gravity: 1400, max: 0.8 });
          break;
        }
        case "fall": {
          const r = world.runners[e.slot];
          if (r.pos.y < VIEW_H) P.burst("spark", r.pos.x, r.pos.y, 10, 160, { color: PLAYER_COLORS[e.slot], size: 2.5, drag: 3, max: 0.5 });
          break;
        }
        case "respawn": {
          const r = world.runners[e.slot];
          this.vis[e.slot].appear = 0;
          P.burst("spark", r.pos.x, r.pos.y, 12, 120, { color: PLAYER_COLORS[e.slot], size: 2.5, drag: 3, max: 0.6 });
          break;
        }
        case "checkpoint":
          this.art.claim(e.index, e.slot);
          break;
        case "finish": {
          const x = world.course.finish;
          const n = e.place === 1 ? 70 : 24;
          for (let i = 0; i < n; i++) {
            P.spawn("confetti", x + (Math.random() - 0.5) * 60, 520 + Math.random() * 60, {
              vx: (Math.random() - 0.5) * 700,
              vy: -300 - Math.random() * 600,
              gravity: 900,
              drag: 1.6,
              size: 3 + Math.random() * 3,
              color: CONFETTI[i % CONFETTI.length],
              max: 1.6 + Math.random() * 1.2,
            });
          }
          if (e.place === 1) {
            const r = world.runners[e.slot];
            for (let i = 0; i < 5; i++) P.spawn("heart", r.pos.x + (Math.random() - 0.5) * 30, r.pos.y - 40, { vy: -60 - Math.random() * 40, vx: (Math.random() - 0.5) * 40, size: 5, color: PLAYER_COLORS[e.slot], max: 1.2 });
          }
          break;
        }
      }
    }
  }

  /** `alpha` interpolates between the previous and current sim step. */
  draw(world: World, alpha: number, dt: number, opts: FrameOptions) {
    this.clock += dt;
    const ctx = this.ctx;
    const t = this.clock;
    const view = this.view;

    this.shake = Math.max(0, this.shake - dt * 40);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    view.camX = lerp(world.prevCamX, world.camX, alpha) + sx;
    view.camY = sy;

    this.scenery.ensure(view);
    this.scenery.drawSky(ctx);
    this.scenery.drawFar(ctx, view, t);
    this.scenery.drawAbyss(ctx, view);

    const b = view.bounds;
    for (const r of this.art.slams(world)) {
      this.particles.burst("dust", r.x + r.w / 2, r.y + r.h, 14, 200, { color: SCENE.frosting, size: 5, drag: 5, vy: -40, max: 0.55 });
      if (r.x + r.w > b.left && r.x < b.right) {
        this.shake = Math.max(this.shake, 6);
        this.onSlam?.();
      }
    }

    this.art.drawBack(ctx, world, b, dt, t);

    const pos = world.runners.map((r) => interp(r, alpha)) as [Vec, Vec];
    for (const r of world.runners) this.drawRunnerBody(world, r, pos[r.slot], dt);

    this.art.drawFront(ctx, world, b, t);
    this.particles.update(dt);
    this.particles.draw(ctx);

    this.drawEdgeWarnings(world);
    if (opts.names > 0.01) this.drawNames(world, pos, opts.names);
    this.drawTrack(world);

    if (opts.fade < 1) {
      view.applyScreen(ctx);
      ctx.fillStyle = rgba(SCENE.ink, 1 - opts.fade);
      ctx.fillRect(0, 0, view.width, view.height);
    }
  }

  // ─── Pieces ─────────────────────────────────────────────────────────────────

  private kick(slot: Slot, sx: number, sy: number) {
    const v = this.vis[slot];
    v.sx = sx;
    v.sy = sy;
    v.vsx = 0;
    v.vsy = 0;
  }

  private drawRunnerBody(world: World, r: Runner, at: Vec, dt: number) {
    const v = this.vis[r.slot];
    // Underdamped springs: the wobble in Wobble Run.
    v.vsx += ((1 - v.sx) * 420 - v.vsx * 11) * dt;
    v.vsy += ((1 - v.sy) * 420 - v.vsy * 11) * dt;
    v.sx += v.vsx * dt;
    v.sy += v.vsy * dt;
    v.blinkIn -= dt;
    if (v.blinkIn <= 0) {
      v.blink = 1;
      v.blinkIn = 2 + Math.random() * 3.5;
    }
    v.blink = Math.max(0, v.blink - dt * 7);
    v.dazed = Math.max(v.dazed - dt, r.stun > 0 ? 0.2 : 0);
    if (r.respawn > 0) return;
    v.appear = Math.min(1, v.appear + dt * 4);

    const diving = r.dive > 0;
    const lean = clamp(r.vel.x / MOVE.run, -1.6, 1.6) * 0.08;
    const target = diving ? r.facing * 0.5 : r.flop > 0 ? r.facing * 0.15 : lean;
    v.tilt += (target - v.tilt) * Math.min(1, dt * 14);
    // Stretch along fast vertical motion.
    const stretch = r.grounded ? 0 : clamp(Math.abs(r.vel.y) / 4000, 0, 0.12);

    const feet = at.y + RUNNER.r;
    const surface = this.surfaceBelow(world, at.x, feet);
    if (surface !== null) drawShadow(this.ctx, at.x, surface, surface - feet);

    drawRunner(this.ctx, this.colors[r.slot], {
      x: at.x,
      y: feet,
      sx: v.sx * (1 - stretch * 0.6),
      sy: v.sy * (1 + stretch),
      tilt: v.tilt,
      facing: r.facing,
      blink: v.blink,
      dazed: v.dazed > 0,
      t: this.clock,
      appear: easeOutBack(v.appear),
    });
  }

  private surfaceBelow(world: World, x: number, feet: number): number | null {
    let best: number | null = null;
    const consider = (rx: number, ry: number, rw: number) => {
      if (x >= rx - 4 && x <= rx + rw + 4 && ry >= feet - 2 && (best === null || ry < best)) best = ry;
    };
    for (const s of world.course.solids) consider(s.x, s.y, s.w);
    for (const c of world.crumbles) if (c.state !== "falling") consider(c.rect.x, c.rect.y, c.rect.w);
    for (const m of world.sliders) consider(m.rect.x, m.rect.y, m.rect.w);
    return best;
  }

  /** The trailer glows on the left edge as the camera is about to carry them. */
  private drawEdgeWarnings(world: World) {
    const ctx = this.ctx;
    const b = this.view.bounds;
    if (world.camX < 40) return;
    for (const r of world.runners) {
      if (r.respawn > 0 || r.finished !== null || r === world.leader()) continue;
      const k = clamp(1 - (r.pos.x - b.left) / 240, 0, 1);
      if (k <= 0) continue;
      const g = ctx.createLinearGradient(b.left, 0, b.left + 120, 0);
      g.addColorStop(0, rgba(PLAYER_COLORS[r.slot], 0.35 * k));
      g.addColorStop(1, rgba(PLAYER_COLORS[r.slot], 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.left, b.top, 120, b.bottom - b.top);
    }
  }

  /** Thin race track at the top centre: where both of you are against the finish. */
  private drawTrack(world: World) {
    const ctx = this.ctx;
    const view = this.view;
    view.applyScreen(ctx);
    const w = Math.min(380, view.width * 0.32);
    const x0 = (view.width - w) / 2;
    const y = 40;
    ctx.strokeStyle = rgba(SCENE.cream, 0.18);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
    for (const cp of world.course.checkpoints.slice(1)) {
      const x = x0 + w * clamp(cp.x / world.course.finish, 0, 1);
      ctx.fillStyle = rgba(SCENE.cream, 0.22);
      ctx.fillRect(x - 0.5, y - 3, 1, 6);
    }
    // Finish: a tiny checker.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 3 === 0 ? SCENE.cream : rgba(SCENE.cream, 0.25);
      ctx.fillRect(x0 + w + 4 + (i % 2) * 4, y - 4 + Math.floor(i / 2) * 4, 4, 4);
    }
    const order = [...world.runners].sort((a, b) => a.pos.x - b.pos.x);
    for (const r of order) {
      const x = x0 + w * world.progressOf(r);
      drawGlow(ctx, PLAYER_COLORS[r.slot], x, y, 16, 0.5);
      ctx.fillStyle = PLAYER_COLORS[r.slot];
      ctx.beginPath();
      ctx.arc(x, y, r.respawn > 0 ? 3 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
    view.apply(ctx);
  }

  private drawNames(world: World, pos: [Vec, Vec], alpha: number) {
    const ctx = this.ctx;
    ctx.font = `500 13px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const r of world.runners) {
      if (r.respawn > 0) continue;
      const p = pos[r.slot];
      const name = this.names[r.slot];
      if (!name) continue;
      const y = p.y - 64;
      const w = ctx.measureText(name).width + 26;
      ctx.fillStyle = rgba(SCENE.ink, 0.55 * alpha);
      ctx.beginPath();
      ctx.roundRect(p.x - w / 2, y - 11, w, 22, 11);
      ctx.fill();
      ctx.fillStyle = rgba(PLAYER_COLORS[r.slot], alpha);
      ctx.beginPath();
      ctx.arc(p.x - w / 2 + 11, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(SCENE.cream, 0.92 * alpha);
      ctx.fillText(name, p.x + 5, y + 0.5);
    }
  }
}

function interp(r: Runner, alpha: number): Vec {
  return { x: lerp(r.prev.x, r.pos.x, alpha), y: lerp(r.prev.y, r.pos.y, alpha) };
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
