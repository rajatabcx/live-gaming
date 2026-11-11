import { PLAYER_COLORS } from "@/design-system/palette";
import { clamp, lerp, type Vec } from "../../kit/math";
import { rgba } from "../../kit/color";
import { Particles } from "../../kit/particles";
import { drawGlow, seeded } from "../../kit/sprites";
import { View } from "../../kit/view";
import type { ChapterData } from "../sim/chapter";
import { LANTERN, STAR, VIEW_H, VIEW_W } from "../sim/constants";
import type { Lantern, Star, World, WorldEvent } from "../sim/world";
import { paperFor, SCENE, skyAt } from "./palette";

export interface FrameOptions {
  /** 0 = black, 1 = fully visible. */
  fade: number;
  /** 0 = deep night … 1 = morning. */
  dawn: number;
  /** 0..1 while the sky scrolls up to the next chapter. */
  rise: number;
  /** 0..1 constellation-complete glow. */
  bloom: number;
}

interface Twinkle {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

/** A finished constellation kept for the rise, drawn sliding away below. */
interface Ghost {
  stars: Vec[];
  lines: [number, number][];
}

type Paper = ReturnType<typeof paperFor>;

/**
 * Draws the sky. Owns only cosmetic state (line draw-in, glow flares, sway),
 * derived from world snapshots and events — never the other way round.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private view = new View(VIEW_W, VIEW_H);
  private particles = new Particles();
  private field: HTMLCanvasElement;
  private fieldKey = "";
  private twinkles: Twinkle[] = [];
  private papers: [Paper, Paper] = [paperFor(PLAYER_COLORS[0]), paperFor(PLAYER_COLORS[1])];
  /** Seconds since each line started drawing, keyed "a-b". */
  private lineDraw = new Map<string, number>();
  private starFlare: number[] = [];
  private flare: [number, number] = [0, 0];
  private sway: [number, number] = [0, 0];
  private swayV: [number, number] = [0, 0];
  private ghost: Ghost | null = null;
  private clock = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.field = document.createElement("canvas");
    const rand = seeded(23);
    for (let i = 0; i < 46; i++) {
      this.twinkles.push({ x: rand() * VIEW_W, y: rand() * VIEW_H * 0.85, r: 0.8 + rand() * 1.1, phase: rand() * 10, speed: 0.6 + rand() * 1.4 });
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.view.resize(w, h, dpr);
  }

  /** A fresh chapter (not a rise): forget everything drawn. */
  startChapter(world: World) {
    this.ghost = null;
    this.lineDraw.clear();
    this.starFlare = world.stars.map(() => 0);
    this.particles.clear();
  }

  /** Keep the finished constellation to slide away while the next one arrives. */
  beginRise(world: World, previous: ChapterData) {
    this.ghost = { stars: previous.stars.map((s) => ({ x: s.x, y: s.y })), lines: previous.lines };
    this.lineDraw.clear();
    this.starFlare = world.stars.map(() => 0);
  }

  endRise() {
    this.ghost = null;
  }

  handle(world: World, events: readonly WorldEvent[]) {
    const P = this.particles;
    for (const e of events) {
      switch (e.type) {
        case "lit": {
          const s = world.stars[e.index];
          this.starFlare[e.index] = 1;
          P.burst("spark", s.x, s.y, 14, 160, { color: SCENE.starLit, size: 2.4, drag: 3, max: 0.9 });
          P.spawn("ring", s.x, s.y, { color: SCENE.line, size: 10, max: 0.8 });
          break;
        }
        case "line":
          this.lineDraw.set(`${e.a}-${e.b}`, 0);
          break;
        case "glow":
          this.flare[e.slot] = 1;
          P.spawn("ring", e.x, e.y, { color: PLAYER_COLORS[e.slot], size: 20, max: 0.9 });
          break;
        case "reveal": {
          const s = world.stars[e.index];
          P.burst("mote", s.x, s.y, 10, 60, { color: SCENE.starLit, size: 3, drag: 1.5, max: 1.4 });
          break;
        }
        case "harmony":
          P.spawn("ring", e.x, e.y, { color: SCENE.line, size: 30, max: 1.2 });
          for (let i = 0; i < 4; i++) {
            P.spawn("heart", e.x + (Math.random() - 0.5) * 50, e.y - 20, { vy: -40 - Math.random() * 30, vx: (Math.random() - 0.5) * 30, size: 5, color: SCENE.line, max: 1.6 });
          }
          break;
        case "complete":
          for (const s of world.stars) P.burst("mote", s.x, s.y, 4, 40, { color: SCENE.starLit, size: 3, drag: 1, max: 2 });
          break;
      }
    }
  }

  /** `alpha` interpolates between the previous and current sim step. */
  draw(world: World, alpha: number, dt: number, opts: FrameOptions) {
    this.clock += dt;
    const ctx = this.ctx;
    const t = this.clock;
    const view = this.view;
    const ease = easeInOut(opts.rise);

    this.drawSky(opts.dawn, ease);
    view.apply(ctx);
    this.drawTwinkles(t, opts.dawn, ease);
    this.drawWinds(world, t, ease, opts.dawn);

    if (this.ghost) this.drawGhost(this.ghost, ease * VIEW_H, opts.dawn);
    // The next sky arrives from above during a rise.
    const shift = this.ghost ? -(1 - ease) * VIEW_H : 0;
    ctx.save();
    ctx.translate(0, shift);
    this.drawLines(world, dt, opts.bloom);
    this.drawStars(world, dt, t, opts.bloom);
    ctx.restore();

    this.drawHills(opts.dawn, ease);
    const pos = world.lanterns.map((l) => interp(l, alpha)) as [Vec, Vec];
    this.drawThread(world, pos);
    for (const l of world.lanterns) this.drawLantern(world, l, pos[l.slot], dt, t);

    this.particles.update(dt);
    this.particles.draw(ctx);

    if (opts.fade < 1) {
      view.applyScreen(ctx);
      ctx.fillStyle = rgba(SCENE.ink, 1 - opts.fade);
      ctx.fillRect(0, 0, view.width, view.height);
    }
  }

  // ─── Sky ────────────────────────────────────────────────────────────────────

  private drawSky(dawn: number, rise: number) {
    const ctx = this.ctx;
    const view = this.view;
    this.ensureField();
    view.apply(ctx);
    const b = view.bounds;
    const c = skyAt(dawn);
    const g = ctx.createLinearGradient(0, b.top, 0, b.bottom);
    g.addColorStop(0, c.top);
    g.addColorStop(0.55, c.mid);
    g.addColorStop(1, c.low);
    ctx.fillStyle = g;
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);

    // Morning: a sun lifting out of the hills.
    if (dawn > 0.85) {
      const k = (dawn - 0.85) / 0.15;
      const y = VIEW_H + 80 - k * 220;
      drawGlow(ctx, SCENE.sun, VIEW_W * 0.5, y, 900, 0.5 * k);
      ctx.fillStyle = rgba(SCENE.sun, 0.85 * k);
      ctx.beginPath();
      ctx.arc(VIEW_W * 0.5, y, 120, 0, Math.PI * 2);
      ctx.fill();
    }

    // Faint star field: two copies stacked so it can scroll during a rise.
    view.applyScreen(ctx);
    ctx.globalAlpha = 1 - clamp((dawn - 0.6) / 0.4, 0, 0.85);
    const dy = rise * this.view.height * 0.35;
    ctx.setTransform(1, 0, 0, 1, 0, dy * view.dpr);
    ctx.drawImage(this.field, 0, 0);
    ctx.drawImage(this.field, 0, -this.field.height);
    ctx.globalAlpha = 1;
  }

  private ensureField() {
    const view = this.view;
    const key = view.key();
    if (key === this.fieldKey) return;
    this.fieldKey = key;
    this.field.width = Math.round(view.width * view.dpr);
    this.field.height = Math.round(view.height * view.dpr);
    const ctx = this.field.getContext("2d")!;
    const rand = seeded(9);
    const n = Math.round((view.width * view.height) / 2600);
    for (let i = 0; i < n; i++) {
      const x = rand() * this.field.width;
      const y = rand() * this.field.height;
      ctx.fillStyle = rgba(SCENE.star, 0.08 + rand() * rand() * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, (0.4 + rand() * 0.8) * view.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTwinkles(t: number, dawn: number, rise: number) {
    const ctx = this.ctx;
    const fade = 1 - clamp((dawn - 0.6) / 0.4, 0, 1);
    for (const s of this.twinkles) {
      const y = (s.y + rise * VIEW_H * 0.6) % VIEW_H;
      const a = (0.25 + 0.35 * Math.sin(t * s.speed + s.phase)) * fade;
      if (a <= 0.02) continue;
      ctx.fillStyle = rgba(SCENE.star, a);
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Long silhouetted hills that sink away as you rise. */
  private drawHills(dawn: number, rise: number) {
    const ctx = this.ctx;
    const b = this.view.bounds;
    const c = skyAt(dawn);
    const sink = rise * 260;
    const layers: [number, number, number, string][] = [
      [VIEW_H - 70, 40, 0.0019, rgba(c.hill, 0.75)],
      [VIEW_H - 30, 34, 0.0031, c.hill],
    ];
    for (const [base, amp, f, color] of layers) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(b.left - 20, b.bottom + 20);
      for (let x = b.left - 20; x <= b.right + 20; x += 30) {
        ctx.lineTo(x, base + sink - amp * (0.6 * Math.sin(x * f + base) + 0.4 * Math.sin(x * f * 2.7)));
      }
      ctx.lineTo(b.right + 20, b.bottom + 20);
      ctx.closePath();
      ctx.fill();
    }
    // Low mist.
    const g = ctx.createLinearGradient(0, VIEW_H - 160 + sink, 0, VIEW_H + sink);
    g.addColorStop(0, rgba(SCENE.mist, 0));
    g.addColorStop(1, rgba(SCENE.mist, 0.06));
    ctx.fillStyle = g;
    ctx.fillRect(b.left, VIEW_H - 160 + sink, b.right - b.left, 200);
  }

  /** Currents as long, slow streaks drifting the way they push. */
  private drawWinds(world: World, t: number, rise: number, dawn: number) {
    const ctx = this.ctx;
    const alpha = (1 - rise) * (1 - clamp((dawn - 0.75) / 0.25, 0, 1));
    if (alpha <= 0.02) return;
    world.chapter.winds.forEach((z, zi) => {
      const rand = seeded(zi * 101 + 7);
      const len = Math.hypot(z.fx, z.fy) || 1;
      const ux = z.fx / len;
      const uy = z.fy / len;
      const n = Math.round((z.w * z.h) / 9000);
      ctx.lineCap = "round";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < n; i++) {
        const speed = 40 + rand() * 50;
        const phase = rand();
        const along = Math.abs(ux) > Math.abs(uy) ? z.w : z.h;
        const travel = ((t * speed) / along + phase) % 1;
        const across = rand();
        const x = Math.abs(ux) > Math.abs(uy) ? z.x + (ux > 0 ? travel : 1 - travel) * z.w : z.x + across * z.w;
        const y = Math.abs(ux) > Math.abs(uy) ? z.y + across * z.h : z.y + (uy > 0 ? travel : 1 - travel) * z.h;
        const a = Math.sin(travel * Math.PI) * 0.16 * alpha;
        ctx.strokeStyle = rgba(SCENE.wind, a);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - ux * 26, y - uy * 26);
        ctx.stroke();
      }
    });
  }

  // ─── Constellation ──────────────────────────────────────────────────────────

  private drawLines(world: World, dt: number, bloom: number) {
    const ctx = this.ctx;
    ctx.lineCap = "round";
    for (const [a, b] of world.chapter.lines) {
      const key = `${a}-${b}`;
      const started = this.lineDraw.get(key);
      if (started === undefined) {
        // A faint guide once at least one end is lit, so the shape teases itself.
        if (world.stars[a].lit !== world.stars[b].lit) this.segment(world.stars[a], world.stars[b], 1, rgba(SCENE.line, 0.06), 1);
        continue;
      }
      const k = Math.min(1, started / 0.7);
      this.lineDraw.set(key, started + dt);
      const p = easeInOut(k);
      this.segment(world.stars[a], world.stars[b], p, rgba(SCENE.line, 0.12 + bloom * 0.12), 7);
      this.segment(world.stars[a], world.stars[b], p, rgba(SCENE.line, 0.55 + bloom * 0.3), 1.6);
    }
  }

  private segment(a: Vec, b: Vec, k: number, color: string, width: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(lerp(a.x, b.x, k), lerp(a.y, b.y, k));
    ctx.stroke();
  }

  private drawStars(world: World, dt: number, t: number, bloom: number) {
    const ctx = this.ctx;
    world.stars.forEach((s: Star, i) => {
      if (!s.visible) return;
      this.starFlare[i] = Math.max(0, (this.starFlare[i] ?? 0) - dt * 1.2);
      const flare = this.starFlare[i];
      if (s.lit) {
        const tw = 0.85 + 0.15 * Math.sin(t * 2.2 + i * 1.7);
        drawGlow(ctx, SCENE.line, s.x, s.y, 46 + flare * 90 + bloom * 30, 0.45 * tw + flare * 0.5);
        sparkle(ctx, s.x, s.y, 9 + flare * 10 + bloom * 3, rgba(SCENE.starLit, 0.95));
        ctx.fillStyle = SCENE.starLit;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      // Unlit: a quiet point, a faint reach ring, and the kindling arcs.
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.4 + i);
      drawGlow(ctx, SCENE.line, s.x, s.y, 34, 0.22 + 0.12 * breathe + s.progress * 0.5);
      sparkle(ctx, s.x, s.y, 6 + breathe * 1.5 + s.progress * 4, rgba(SCENE.starLit, 0.7 + s.progress * 0.3));
      // The reach ring only appears as a lantern drifts near, so busy skies stay clean.
      const near = Math.min(...world.lanterns.map((l) => Math.hypot(l.pos.x - s.x, l.pos.y - s.y)));
      ctx.strokeStyle = rgba(SCENE.star, (0.1 + 0.05 * breathe) * clamp((320 - near) / 160, 0, 1));
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, STAR.reach, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.progress > 0.01) {
        // One arc per player, closing toward each other from either side.
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        const span = Math.PI * s.progress;
        ctx.strokeStyle = rgba(PLAYER_COLORS[0], 0.8);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 22, Math.PI / 2, Math.PI / 2 + span);
        ctx.stroke();
        ctx.strokeStyle = rgba(PLAYER_COLORS[1], 0.8);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 22, Math.PI / 2 - span, Math.PI / 2);
        ctx.stroke();
      }
    });
  }

  private drawGhost(g: Ghost, drop: number, dawn: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(0, drop);
    const fade = 1 - clamp(dawn - 0.9, 0, 0.1) * 10;
    for (const [a, b] of g.lines) this.segment(g.stars[a], g.stars[b], 1, rgba(SCENE.line, 0.4 * fade), 1.4);
    for (const s of g.stars) {
      drawGlow(ctx, SCENE.line, s.x, s.y, 36, 0.35 * fade);
      ctx.fillStyle = rgba(SCENE.starLit, fade);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ─── Lanterns ───────────────────────────────────────────────────────────────

  /** A warm sagging thread between you when you're close. */
  private drawThread(world: World, pos: [Vec, Vec]) {
    const k = clamp((world.warmth - 0.55) / 0.45, 0, 1);
    if (k <= 0.02) return;
    const ctx = this.ctx;
    const [a, b] = pos;
    const sag = 40 + world.separation * 0.08;
    ctx.strokeStyle = rgba(SCENE.line, 0.22 * k);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + 30);
    ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 30 + sag, b.x, b.y + 30);
    ctx.stroke();
  }

  private drawLantern(world: World, l: Lantern, at: Vec, dt: number, t: number) {
    const ctx = this.ctx;
    const s = l.slot;
    const paper = this.papers[s];
    // The body swings against its motion like it hangs from a string.
    const target = clamp(-l.vel.x / LANTERN.maxSpeed, -1, 1) * 0.22;
    this.swayV[s] += ((target - this.sway[s]) * 30 - this.swayV[s] * 3.2) * dt;
    this.sway[s] += this.swayV[s] * dt;
    this.flare[s] = Math.max(0, this.flare[s] - dt * 1.6);
    const bob = Math.sin(t * 1.3 + s * 2) * 4;
    const warmth = world.warmth;
    const flicker = 0.92 + 0.08 * Math.sin(t * 9 + s * 3) * Math.sin(t * 5.3);
    const light = warmth * flicker + this.flare[s] * 0.6;

    drawGlow(ctx, paper.glow, at.x, at.y + bob, 160 * (0.6 + light * 0.6), 0.32 * light);
    drawGlow(ctx, PLAYER_COLORS[s], at.x, at.y + bob, 70, 0.2 * light);

    ctx.save();
    ctx.translate(at.x, at.y + bob - 34);
    ctx.rotate(this.sway[s]);
    ctx.translate(0, 34);
    const w = 23;
    const h = 30;
    // Cap and base.
    ctx.fillStyle = paper.rib;
    ctx.beginPath();
    ctx.roundRect(-11, -h - 6, 22, 7, 2);
    ctx.roundRect(-13, h - 2, 26, 7, 2);
    ctx.fill();
    // Paper body, lit from inside.
    const body = ctx.createRadialGradient(0, 4, 2, 0, 0, w * 1.4);
    body.addColorStop(0, rgba("#ffffff", Math.min(1, 0.55 + light * 0.4)));
    body.addColorStop(0.35, rgba(paper.paper, 0.6 + light * 0.4));
    body.addColorStop(1, rgba(paper.glow, 0.35 + light * 0.4));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ribs.
    ctx.strokeStyle = rgba(paper.rib, 0.35);
    ctx.lineWidth = 1;
    for (const k of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, w * Math.abs(k) || 0.5, h, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Tassel.
    ctx.strokeStyle = rgba(PLAYER_COLORS[s], 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h + 5);
    ctx.quadraticCurveTo(-this.sway[s] * 30, h + 16, -this.sway[s] * 40, h + 26);
    ctx.stroke();
    ctx.restore();
  }
}

function interp(l: Lantern, alpha: number): Vec {
  return { x: lerp(l.prev.x, l.pos.x, alpha), y: lerp(l.prev.y, l.pos.y, alpha) };
}

function easeInOut(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** A four-point twinkle. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

