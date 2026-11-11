import { PLAYER_COLORS } from "@/design-system/palette";
import { FROG, WORLD_H } from "../sim/constants";
import { lerp, type Vec } from "../sim/math";
import type { Frog, Slot, World, WorldEvent } from "../sim/world";
import { Backdrop, MOON } from "./backdrop";
import { frogColors, mix, rgba, SCENE, type FrogColors } from "./color";
import { drawFrog } from "./frog-art";
import { Particles } from "./particles";
import { drawGlow, seeded } from "./sprites";
import { View } from "./view";

interface FrogVis {
  sx: number;
  sy: number;
  vsx: number;
  vsy: number;
  blinkIn: number;
  blink: number;
  lookX: number;
  lookY: number;
  appear: number;
  blush: number;
}

interface Drifter {
  x: number;
  y: number;
  phase: number;
  speed: number;
}

export interface FrameOptions {
  /** 0 = black, 1 = fully visible. */
  fade: number;
  /** 0..1 — name tags above frogs. */
  names: number;
}

const newVis = (): FrogVis => ({ sx: 1, sy: 1, vsx: 0, vsy: 0, blinkIn: 2 + Math.random() * 3, blink: 0, lookX: 1, lookY: 0, appear: 1, blush: 0 });

/**
 * Draws a World. Owns only cosmetic state (springs, blinks, particles), all
 * derived from world snapshots and events — never the other way round.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private view = new View();
  private backdrop = new Backdrop();
  private particles = new Particles();
  private colors: [FrogColors, FrogColors] = [frogColors(PLAYER_COLORS[0]), frogColors(PLAYER_COLORS[1])];
  private vis: [FrogVis, FrogVis] = [newVis(), newVis()];
  private plateVis: number[] = [];
  private goalGlow = 0;
  private drifters: Drifter[] = [];
  private names: [string, string] = ["", ""];
  private clock = 0;
  private fontFamily = "ui-sans-serif, system-ui, sans-serif";

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    const rand = seeded(42);
    for (let i = 0; i < 18; i++) {
      this.drifters.push({ x: rand() * 1600, y: 120 + rand() * 560, phase: rand() * 100, speed: 0.4 + rand() * 0.6 });
    }
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

  startLevel(world: World) {
    this.vis = [newVis(), newVis()];
    this.plateVis = world.plates.map(() => 0);
    this.goalGlow = 0;
    this.particles.clear();
  }

  handle(world: World, events: readonly WorldEvent[]) {
    const P = this.particles;
    for (const e of events) {
      switch (e.type) {
        case "jump": {
          const f = world.frogs[e.slot];
          this.kick(e.slot, 0.78, 1.28);
          P.burst("dust", f.pos.x, f.pos.y + FROG.hh, 5, 60, { color: SCENE.cream, size: 4, drag: 4, max: 0.45 });
          break;
        }
        case "land": {
          const f = world.frogs[e.slot];
          const k = Math.min(0.32, Math.max(0.1, e.impact / 2600));
          this.kick(e.slot, 1 + k, 1 - k);
          P.burst("dust", f.pos.x, f.pos.y + FROG.hh, 4 + Math.round(k * 20), 90, { color: SCENE.cream, size: 4, drag: 5, vy: -20, max: 0.5 });
          break;
        }
        case "tongue-attach": {
          const p = world.targetPoint(e.target);
          P.spawn("ring", p.x, p.y - (e.target.kind === "frog" ? FROG.hh : 0), { color: e.target.kind === "frog" ? SCENE.glow : this.colors[e.slot].tongue, size: 8, max: 0.45 });
          if (e.target.kind === "frog") {
            for (let i = 0; i < 3; i++) {
              P.spawn("heart", p.x + (Math.random() - 0.5) * 20, p.y - 34, { vy: -50 - Math.random() * 30, vx: (Math.random() - 0.5) * 30, size: 5, color: SCENE.rose, max: 1.1 });
            }
          }
          break;
        }
        case "tongue-release":
          if (e.fling) this.kick(e.slot, 0.86, 1.16);
          break;
        case "firefly":
          P.burst("spark", e.x, e.y, 10, 140, { color: SCENE.glow, size: 3, drag: 3, max: 0.7 });
          P.spawn("ring", e.x, e.y, { color: SCENE.glow, size: 6, max: 0.5 });
          break;
        case "splash":
          P.burst("drop", e.x, e.y, 18, 260, { color: mix(SCENE.cream, SCENE.water, 0.4), size: 2.5, gravity: 1400, vy: -260, max: 0.8 });
          P.spawn("ring", e.x, e.y, { color: SCENE.cream, size: 10, max: 0.7 });
          break;
        case "respawn": {
          const f = world.frogs[e.slot];
          this.vis[e.slot].appear = 0;
          P.burst("spark", f.pos.x, f.pos.y, 12, 120, { color: PLAYER_COLORS[e.slot], size: 2.5, drag: 3, max: 0.6 });
          break;
        }
        case "plate": {
          const p = world.plates[e.index];
          if (e.pressed) P.burst("spark", p.x + p.w / 2, p.y - 6, 8, 90, { color: SCENE.moss, size: 2.5, drag: 3, vy: -40, max: 0.6 });
          break;
        }
        case "complete": {
          const g = world.level.goal;
          const cx = g.x + g.w / 2;
          const cy = g.y + g.h;
          P.burst("spark", cx, cy - 30, 40, 320, { color: SCENE.glow, size: 3.5, drag: 2.2, vy: -120, max: 1.4 });
          for (let i = 0; i < 9; i++) {
            P.spawn("heart", cx + (Math.random() - 0.5) * 120, cy - 30 - Math.random() * 40, { vy: -40 - Math.random() * 60, vx: (Math.random() - 0.5) * 40, size: 5 + Math.random() * 4, color: i % 2 ? SCENE.rose : SCENE.glow, max: 2 });
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
    this.backdrop.ensure(this.view, world.level);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop.sky, 0, 0);
    this.view.apply(ctx);

    this.drawTwinkles(t);
    this.drawDrifters(t);
    this.drawGoal(world, dt, t);
    this.drawAnchors(world, t);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop.terrain, 0, 0);
    this.view.apply(ctx);

    this.drawPlates(world, dt);
    this.drawMovers(world, alpha);
    this.drawFireflies(world, t);

    const pos = world.frogs.map((f) => interp(f, alpha)) as [Vec, Vec];
    for (const f of world.frogs) this.drawFrogBody(world, f, pos[f.slot], dt);
    for (const f of world.frogs) this.drawTongue(world, f, pos);

    this.particles.update(dt);
    this.particles.draw(ctx);
    this.drawWater(world, t);
    if (opts.names > 0.01) this.drawNames(world, pos, opts.names);

    if (opts.fade < 1) {
      this.view.applyScreen(ctx);
      ctx.fillStyle = rgba(SCENE.ink, 1 - opts.fade);
      ctx.fillRect(0, 0, this.view.width, this.view.height);
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

  private drawTwinkles(t: number) {
    const ctx = this.ctx;
    for (const s of this.backdrop.twinklers) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      ctx.fillStyle = rgba(SCENE.cream, a);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawDrifters(t: number) {
    for (const d of this.drifters) {
      const x = d.x + Math.sin(t * 0.13 * d.speed + d.phase) * 60 + Math.sin(t * 0.31 + d.phase * 2) * 18;
      const y = d.y + Math.cos(t * 0.17 * d.speed + d.phase) * 30;
      const a = Math.max(0, Math.sin(t * 0.9 * d.speed + d.phase)) * 0.35;
      drawGlow(this.ctx, SCENE.glow, x, y, 14, a);
    }
  }

  private drawGoal(world: World, dt: number, t: number) {
    const ctx = this.ctx;
    const g = world.level.goal;
    const cx = g.x + g.w / 2;
    const base = g.y + g.h;
    const target = 0.35 + world.goalCount * 0.25 + world.goalHold * 0.5 + (world.complete ? 0.4 : 0);
    this.goalGlow += (target - this.goalGlow) * Math.min(1, dt * 4);
    const k = this.goalGlow * (0.92 + 0.08 * Math.sin(t * 2.2));

    // Light column.
    const col = ctx.createLinearGradient(0, base - 300, 0, base);
    col.addColorStop(0, rgba(SCENE.moon, 0));
    col.addColorStop(1, rgba(SCENE.moon, 0.13 * k));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx - g.w * 0.32, base - 300);
    ctx.lineTo(cx + g.w * 0.32, base - 300);
    ctx.lineTo(cx + g.w * 0.46, base);
    ctx.lineTo(cx - g.w * 0.46, base);
    ctx.closePath();
    ctx.fill();
    drawGlow(ctx, SCENE.glow, cx, base - 6, g.w * 0.75, 0.32 * k);

    if (Math.random() < dt * (3 + k * 10)) {
      this.particles.spawn("mote", cx + (Math.random() - 0.5) * g.w * 0.8, base - 4, { vy: -40 - Math.random() * 50, size: 1.6 + Math.random(), color: SCENE.glow, max: 2.6 });
    }

    // The pad itself.
    ctx.fillStyle = SCENE.pad;
    ctx.beginPath();
    ctx.ellipse(cx, base - 2, g.w * 0.44, 7, 0, 0.18, Math.PI * 2 - 0.18);
    ctx.lineTo(cx, base - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(SCENE.moss, 0.35 + 0.4 * k);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, base - 2, g.w * 0.44, 7, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }

  private drawAnchors(world: World, t: number) {
    const ctx = this.ctx;
    const top = this.view.bounds.top;
    const held = new Set(
      world.frogs.flatMap((f) => (f.tongue.phase === "attached" && f.tongue.target.kind === "anchor" ? [f.tongue.target.index] : [])),
    );
    world.anchors.forEach((a, i) => {
      const lit = held.has(i) ? 1 : 0;
      const pulse = 0.85 + 0.15 * Math.sin(t * 2 + i);
      if (a.kind === "knot") {
        const sway = Math.sin(t * 0.8 + i * 1.7) * 7;
        ctx.strokeStyle = SCENE.leaf;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x - sway * 0.3, top - 10);
        ctx.quadraticCurveTo(a.x + sway, (top + a.y) / 2, a.x, a.y - 9);
        ctx.stroke();
        ctx.fillStyle = rgba(SCENE.moss, 0.55);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(a.x + s * 7, a.y - 13, 6, 2.6, s * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        drawGlow(ctx, SCENE.glow, a.x, a.y, 74 + lit * 26, (0.5 + lit * 0.35) * pulse);
        ctx.fillStyle = SCENE.berry;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.beginPath();
        ctx.arc(a.x - 3, a.y - 3, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // A stump with a glowing ring on top.
        const floor = a.y + 24;
        ctx.fillStyle = SCENE.wood;
        ctx.beginPath();
        ctx.roundRect(a.x - 11, a.y, 22, floor - a.y + 2, [6, 6, 2, 2]);
        ctx.fill();
        ctx.fillStyle = mix(SCENE.wood, SCENE.cream, 0.18);
        ctx.beginPath();
        ctx.ellipse(a.x, a.y + 1, 11, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        drawGlow(ctx, SCENE.glow, a.x, a.y, 46 + lit * 20, (0.45 + lit * 0.4) * pulse);
        ctx.strokeStyle = SCENE.berry;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(a.x, a.y, 6, 2.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  private drawPlates(world: World, dt: number) {
    const ctx = this.ctx;
    world.plates.forEach((p, i) => {
      const v = (this.plateVis[i] = lerp(this.plateVis[i] ?? 0, p.pressed ? 1 : 0, Math.min(1, dt * 10)));
      const cx = p.x + p.w / 2;
      drawGlow(ctx, SCENE.moss, cx, p.y - 4, 30 + v * 40, 0.12 + v * 0.45);
      // Leaf pad.
      ctx.fillStyle = SCENE.leaf;
      ctx.beginPath();
      ctx.ellipse(cx, p.y - 1.5, p.w / 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Petals: an upright bud that opens flat when stood on.
      const petal = mix(SCENE.leaf, SCENE.moss, 0.35 + v * 0.65);
      for (const s of [-2, -1, 0, 1, 2]) {
        const spread = s * (0.22 + v * 0.42);
        const len = (s === 0 ? 17 : 14) * (1 - v * 0.5);
        ctx.save();
        ctx.translate(cx + s * (2 + v * 8), p.y - 3);
        ctx.rotate(spread);
        ctx.fillStyle = petal;
        ctx.beginPath();
        ctx.ellipse(0, -len / 2, 4.2 + v, len / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  private drawMovers(world: World, alpha: number) {
    const ctx = this.ctx;
    for (const m of world.movers) {
      const x = lerp(m.pos.x - m.delta.x, m.pos.x, alpha);
      const y = lerp(m.pos.y - m.delta.y, m.pos.y, alpha);
      const { w, h } = m.data;
      const live = m.open ? 1 : 0.4;
      if (m.data.look === "gate") {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, "#1c2024");
        g.addColorStop(1, "#121418");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = rgba(SCENE.moss, 0.25 + live * 0.4);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = rgba(SCENE.moss, 0.3 + live * 0.4);
        for (let yy = y + 22; yy < y + h - 14; yy += 26) {
          ctx.beginPath();
          ctx.arc(x + w / 2, yy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        drawGlow(ctx, SCENE.moss, x + w / 2, y + h / 2, w * 0.7, 0.12 + live * 0.18);
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, "#1f3a2e");
        g.addColorStop(1, "#11211b");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 11);
        ctx.fill();
        ctx.strokeStyle = rgba(SCENE.moss, 0.45 + live * 0.35);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 0.75);
        ctx.lineTo(x + w - 10, y + 0.75);
        ctx.stroke();
      }
    }
  }

  private drawFireflies(world: World, t: number) {
    const ctx = this.ctx;
    world.fireflies.forEach((ff, i) => {
      if (ff.taken) return;
      const p = world.fireflyPos(i);
      const flicker = 0.75 + 0.25 * Math.sin(t * 9 + ff.phase * 3) * Math.sin(t * 3.3 + ff.phase);
      drawGlow(ctx, SCENE.glow, p.x, p.y, 30, 0.85 * flicker);
      ctx.fillStyle = "#fff1dc";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawFrogBody(world: World, f: Frog, at: Vec, dt: number) {
    const v = this.vis[f.slot];
    // Squash & stretch spring back to rest; velocity adds a little stretch.
    for (const axis of ["x", "y"] as const) {
      const key = axis === "x" ? "sx" : "sy";
      const vel = axis === "x" ? "vsx" : "vsy";
      const a = (1 - v[key]) * 260 - v[vel] * 16;
      v[vel] += a * dt;
      v[key] += v[vel] * dt;
    }
    const stretch = f.grounded ? 0 : Math.min(0.12, Math.abs(f.vel.y) / 4200);

    v.blinkIn -= dt;
    if (v.blinkIn <= 0) {
      v.blink = 1;
      v.blinkIn = 2.5 + Math.random() * 3.5;
    }
    v.blink = Math.max(0, v.blink - dt * 7);

    // Eyes follow the stick, else the tongue, else forward.
    const t = f.tongue;
    let lx = 1;
    let ly = 0;
    if (t.phase === "attached" || t.phase === "extend") {
      const p = t.phase === "attached" ? world.targetPoint(t.target) : { x: f.pos.x + t.dir.x * 100, y: f.pos.y + t.dir.y * 100 };
      const d = Math.hypot(p.x - f.pos.x, p.y - f.pos.y) || 1;
      lx = ((p.x - f.pos.x) / d) * f.facing;
      ly = (p.y - f.pos.y) / d;
    } else if (f.aiming) {
      lx = f.aim.x * f.facing;
      ly = f.aim.y;
    }
    v.lookX = lerp(v.lookX, lx, Math.min(1, dt * 12));
    v.lookY = lerp(v.lookY, ly, Math.min(1, dt * 12));

    const tied =
      (t.phase === "attached" && t.target.kind === "frog") ||
      world.frogs.some((o) => o.slot !== f.slot && o.tongue.phase === "attached" && o.tongue.target.kind === "frog");
    v.blush = lerp(v.blush, tied ? 1 : 0, Math.min(1, dt * 5));

    if (f.respawn > 0) return;
    v.appear = Math.min(1, v.appear + dt * 3.2);
    const pop = v.appear < 1 ? 0.6 + 0.4 * easeOutBack(v.appear) : 1;

    drawFrog(
      this.ctx,
      {
        x: at.x,
        y: at.y + FROG.hh,
        facing: f.facing,
        sx: v.sx * (1 - stretch * 0.6) * pop,
        sy: v.sy * (1 + stretch) * pop,
        lookX: v.lookX,
        lookY: v.lookY,
        blink: v.blink,
        airborne: !f.grounded,
        mouthOpen: t.phase !== "idle",
        blush: v.blush,
        alpha: Math.min(1, v.appear * 1.6),
      },
      this.colors[f.slot],
    );
  }

  private drawTongue(world: World, f: Frog, pos: [Vec, Vec]) {
    const t = f.tongue;
    if (t.phase === "idle" || f.respawn > 0) return;
    const ctx = this.ctx;
    const at = pos[f.slot];
    const mouth = { x: at.x + f.facing * FROG.mouthX, y: at.y + FROG.mouthY };
    const end = this.tongueEnd(world, f, pos, mouth);
    const c = this.colors[f.slot];
    const toFrog = t.phase === "attached" && t.target.kind === "frog";

    // Slight sine wiggle while flying out, so it reads as flesh, not a laser.
    const mx = (mouth.x + end.x) / 2;
    const my = (mouth.y + end.y) / 2;
    const dx = end.x - mouth.x;
    const dy = end.y - mouth.y;
    const len = Math.hypot(dx, dy) || 1;
    const wiggle = t.phase === "extend" ? Math.sin(len * 0.09) * 5 : 0;
    const sag = t.phase === "retract" ? 6 : 0;
    const cx = mx + (-dy / len) * wiggle;
    const cy = my + (dx / len) * wiggle + sag;

    const path = () => {
      ctx.beginPath();
      ctx.moveTo(mouth.x, mouth.y);
      ctx.quadraticCurveTo(cx, cy, end.x, end.y);
    };
    ctx.lineCap = "round";
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(toFrog ? SCENE.glow : c.tongue, toFrog ? 0.32 : 0.16);
    ctx.lineWidth = toFrog ? 14 : 11;
    path();
    ctx.stroke();
    ctx.globalCompositeOperation = prevOp;

    if (toFrog) {
      const other = this.colors[t.target.kind === "frog" ? t.target.slot : f.slot];
      const g = ctx.createLinearGradient(mouth.x, mouth.y, end.x, end.y);
      g.addColorStop(0, c.tongue);
      g.addColorStop(1, other.tongue);
      ctx.strokeStyle = g;
    } else ctx.strokeStyle = c.tongue;
    ctx.lineWidth = 5;
    path();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(mouth.x, mouth.y - 1.2);
    ctx.quadraticCurveTo(cx, cy - 1.2, end.x, end.y - 1.2);
    ctx.stroke();

    if (t.phase !== "attached" || t.target.kind === "frog") {
      ctx.fillStyle = c.tongue;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 4.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private tongueEnd(world: World, f: Frog, pos: [Vec, Vec], mouth: Vec): Vec {
    const t = f.tongue;
    const point = (target: { kind: "anchor"; index: number } | { kind: "frog"; slot: Slot }) => {
      if (target.kind === "anchor") return world.anchors[target.index];
      const p = pos[target.slot];
      return { x: p.x, y: p.y - FROG.hh + 6 };
    };
    if (t.phase === "attached") return point(t.target);
    if (t.phase === "extend" && t.target) {
      const p = point(t.target);
      const k = Math.min(1, t.len / Math.max(1, t.reach));
      return { x: lerp(mouth.x, p.x, k), y: lerp(mouth.y, p.y, k) };
    }
    if (t.phase === "extend" || t.phase === "retract") return { x: mouth.x + t.dir.x * t.len, y: mouth.y + t.dir.y * t.len };
    return mouth;
  }

  private drawWater(world: World, t: number) {
    const surface = world.level.water;
    if (surface === null) return;
    const ctx = this.ctx;
    const b = this.view.bounds;
    const bottom = Math.max(b.bottom, WORLD_H);
    const g = ctx.createLinearGradient(0, surface, 0, bottom);
    g.addColorStop(0, rgba(SCENE.water, 0.82));
    g.addColorStop(1, rgba(SCENE.waterDeep, 0.97));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(b.left, bottom);
    for (let x = b.left; x <= b.right + 24; x += 24) ctx.lineTo(x, surface + Math.sin(x * 0.018 + t * 1.4) * 1.6);
    ctx.lineTo(b.right + 24, bottom);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgba(SCENE.cream, 0.2);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = b.left; x <= b.right + 24; x += 24) {
      const y = surface + Math.sin(x * 0.018 + t * 1.4) * 1.6;
      if (x === b.left) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Moon's reflection: broken horizontal strokes that shimmer.
    for (let i = 0; i < 9; i++) {
      const y = surface + 10 + i * 9;
      if (y > bottom) break;
      const w = (34 - i * 2.4) * (0.7 + 0.3 * Math.sin(t * 1.7 + i * 1.3));
      const x = MOON.x + Math.sin(t * 0.9 + i * 2.1) * 6;
      ctx.strokeStyle = rgba(SCENE.moon, 0.26 - i * 0.025);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
    }
  }

  private drawNames(world: World, pos: [Vec, Vec], alpha: number) {
    const ctx = this.ctx;
    ctx.font = `500 13px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of world.frogs) {
      if (f.respawn > 0) continue;
      const p = pos[f.slot];
      const name = this.names[f.slot];
      if (!name) continue;
      const y = p.y - 52;
      const w = ctx.measureText(name).width + 26;
      ctx.fillStyle = rgba(SCENE.ink, 0.55 * alpha);
      ctx.beginPath();
      ctx.roundRect(p.x - w / 2, y - 11, w, 22, 11);
      ctx.fill();
      ctx.fillStyle = rgba(PLAYER_COLORS[f.slot], alpha);
      ctx.beginPath();
      ctx.arc(p.x - w / 2 + 11, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(SCENE.cream, 0.92 * alpha);
      ctx.fillText(name, p.x + 5, y + 0.5);
    }
  }
}

function interp(f: Frog, alpha: number): Vec {
  return { x: lerp(f.prev.x, f.pos.x, alpha), y: lerp(f.prev.y, f.pos.y, alpha) };
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
