import { PLAYER_COLORS } from "@/design-system/palette";
import type { PlayerSlot } from "@/lib/realtime/protocol";
import { rgba } from "../../kit/color";
import { clamp, lerp, type Vec } from "../../kit/math";
import { Particles } from "../../kit/particles";
import { drawGlow, glowSprite, seeded } from "../../kit/sprites";
import { clipTo, fitTransform, viewports, type Viewport } from "../../kit/views";
import { BEAM, BOAT, CHART_H, CHART_W, SAILOR_VIEW } from "../sim/constants";
import type { Circle } from "../sim/night";
import { roleOf, type Role, type World, type WorldEvent } from "../sim/world";
import { LIGHT, SEA, TOWER } from "./palette";

export interface FrameOptions {
  /** 0 = black, 1 = fully visible. */
  fade: number;
  /** 0..1 — the role card at the start of a night. */
  intro: number;
}

interface Pose {
  boat: Vec;
  heading: number;
  angle: number;
  half: number;
  sinking: number;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
}

const TAU = Math.PI * 2;
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * t;
/** Land, not a rock: the headland and big islands get grass and cliffs. */
const isLand = (r: Circle) => r.r >= 150;

const ROLE_COPY: Record<Role, { title: string; line: string }> = {
  keeper: { title: "You keep the light", line: "Point the beam. Only what it touches shows through their fog." },
  sailor: { title: "You sail home", line: "Steer through the fog. Ask for light — the rocks hide in the dark." },
};

/**
 * Draws a night at sea, once per player view on this screen:
 *  - keeper: the whole chart, moonlit; the boat shows only where the beam is
 *  - sailor: close on the boat, in fog cut open by its lantern and the beam
 * Owns only cosmetic state (wake, ripples, the keeper's "last seen" ghost).
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private fog: HTMLCanvasElement;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private slots: PlayerSlot[] = [0, 1];
  private night = 0;
  private names: [string, string] = ["", ""];
  private particles = new Particles();
  private rockShapes: Vec[][] = [];
  private waves: { x: number; y: number; len: number; phase: number }[] = [];
  private fogBlobs: { x: number; y: number; r: number; speed: number; phase: number }[] = [];
  private ripples: Ripple[] = [];
  private wake: Ripple[] = [];
  private wakeClock = 0;
  private seen = 0;
  private lastSeen: Vec | null = null;
  private lastSeenAge = 99;
  private shake = 0;
  private flash = 0;
  private clock = 0;
  private font = "ui-sans-serif, system-ui, sans-serif";

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.fog = document.createElement("canvas");
    const family = getComputedStyle(canvas).fontFamily;
    if (family) this.font = family;
    const rand = seeded(7);
    for (let i = 0; i < 220; i++) this.waves.push({ x: rand() * CHART_W, y: rand() * CHART_H, len: 10 + rand() * 26, phase: rand() * 10 });
    for (let i = 0; i < 26; i++) this.fogBlobs.push({ x: rand() * CHART_W, y: rand() * CHART_H, r: 160 + rand() * 260, speed: 6 + rand() * 12, phase: rand() * 10 });
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, this.canvas.clientWidth);
    this.h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  setViews(slots: PlayerSlot[]) {
    this.slots = slots;
  }

  setNames(names: [string, string]) {
    this.names = names;
  }

  startNight(world: World, night: number) {
    this.night = night;
    this.particles.clear();
    this.ripples = [];
    this.wake = [];
    this.lastSeen = null;
    this.seen = 0;
    const rand = seeded(100 + night);
    this.rockShapes = world.night.rocks.map((r) => {
      const n = isLand(r) ? 28 : 13;
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU;
        const k = isLand(r) ? 0.94 + rand() * 0.08 : 0.82 + rand() * 0.24;
        return { x: Math.cos(a) * r.r * k, y: Math.sin(a) * r.r * k };
      });
    });
  }

  handle(world: World, events: readonly WorldEvent[]) {
    const P = this.particles;
    for (const e of events) {
      switch (e.type) {
        case "scrape":
          P.burst("drop", e.x, e.y, 12, 120, { color: SEA.foam, size: 2.2, drag: 3, max: 0.7 });
          P.burst("spark", e.x, e.y, 6, 140, { color: LIGHT.warm, size: 2, drag: 4, max: 0.4 });
          this.shake = 7;
          break;
        case "wreck":
          P.burst("drop", e.x, e.y, 26, 160, { color: SEA.foam, size: 2.6, drag: 2.5, max: 1 });
          this.shake = 12;
          break;
        case "afloat":
          P.spawn("ring", world.boat.pos.x, world.boat.pos.y, { color: SEA.foam, size: 14, max: 0.9 });
          break;
        case "buoy":
          P.spawn("ring", e.x, e.y, { color: LIGHT.buoyGreen, size: 10, max: 1 });
          P.burst("spark", e.x, e.y, 10, 90, { color: LIGHT.buoyGreen, size: 2, drag: 3, max: 0.8 });
          break;
        case "bottle":
          P.burst("spark", e.x, e.y, 14, 110, { color: LIGHT.bottle, size: 2.2, drag: 3, max: 0.9 });
          P.spawn("ring", e.x, e.y, { color: LIGHT.bottle, size: 8, max: 0.8 });
          break;
        case "horn":
          this.ripples.push({ x: e.x, y: e.y, age: 0 });
          break;
        case "flare":
          this.flash = 1;
          break;
        case "spotted":
          P.spawn("ring", e.x, e.y, { color: LIGHT.beam, size: 12, max: 0.9 });
          break;
        case "docked": {
          const h = world.night.harbor;
          P.burst("heart", h.x, h.y, 10, 90, { color: LIGHT.harbor, size: 7, gravity: -30, drag: 1.5, max: 1.8 });
          P.burst("spark", h.x, h.y, 24, 160, { color: LIGHT.lamp, size: 2.4, drag: 2.5, max: 1.2 });
          break;
        }
      }
    }
  }

  draw(world: World, alpha: number, dt: number, opts: FrameOptions) {
    this.clock += dt;
    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < 3);
    for (const r of this.wake) r.age += dt;
    this.wake = this.wake.filter((r) => r.age < 1.6);

    const b = world.boat;
    const pose: Pose = {
      boat: { x: lerp(b.prev.x, b.pos.x, alpha), y: lerp(b.prev.y, b.pos.y, alpha) },
      heading: lerpAngle(b.prevHeading, b.heading, alpha),
      angle: lerpAngle(world.lamp.prevAngle, world.lamp.angle, alpha),
      half: world.lamp.flare > 0 ? BEAM.flareHalfAngle : BEAM.halfAngle,
      sinking: b.sinking,
    };

    this.wakeClock += dt;
    if (b.throttle > 0 && b.sinking <= 0 && this.wakeClock > 0.05) {
      this.wakeClock = 0;
      const back = { x: pose.boat.x - Math.cos(pose.heading) * 14, y: pose.boat.y - Math.sin(pose.heading) * 14 };
      this.wake.push({ x: back.x + (Math.random() - 0.5) * 6, y: back.y + (Math.random() - 0.5) * 6, age: 0 });
    }

    const lit = world.boatLit && b.sinking <= 0;
    this.seen += ((lit ? 1 : 0) - this.seen) * Math.min(1, dt * 9);
    if (lit) {
      this.lastSeen = { ...pose.boat };
      this.lastSeenAge = 0;
    } else this.lastSeenAge += dt;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = LIGHT.ink;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (const vp of viewports(this.slots, this.w, this.h)) {
      const role = roleOf(vp.slot, this.night);
      ctx.save();
      clipTo(ctx, vp, this.dpr);
      if (role === "keeper") this.drawKeeper(world, pose, vp);
      else this.drawSailor(world, pose, vp);
      this.drawRole(vp, role, opts.intro);
      ctx.restore();
    }

    if (opts.fade < 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = rgba(LIGHT.ink, 1 - opts.fade);
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // ─── Views ──────────────────────────────────────────────────────────────────

  private drawKeeper(world: World, pose: Pose, vp: Viewport) {
    const ctx = this.ctx;
    const s = fitTransform(ctx, vp, this.dpr, CHART_W + 60, CHART_H + 60, CHART_W / 2, CHART_H / 2, "contain");
    const bounds = boundsOf(vp, s, CHART_W / 2, CHART_H / 2);

    this.drawSea(bounds, 1);
    this.drawGrid(bounds);
    this.drawCurrents(world, 0.7);
    this.drawRocks(world);
    this.drawHarbor(world, 1);
    this.drawBuoys(world, 1);
    this.drawBottles(world);
    this.drawWake(0.6 * this.seen);
    this.drawBeam(world, pose, 1);

    // The boat exists for the keeper only where the light falls — or where its horn was heard.
    if (this.lastSeen && this.seen < 0.95 && this.lastSeenAge < 5) {
      const k = (1 - this.seen) * (1 - this.lastSeenAge / 5);
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = rgba(LIGHT.beam, 0.35 * k);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.lastSeen.x, this.lastSeen.y, 26, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.drawBoat(pose, this.seen);
    this.drawRipples(1);
    this.particles.draw(ctx);
    this.drawLighthouse(world);
    this.drawCompass(80, CHART_H - 90);
    this.vignette(vp, 0.55);
  }

  private drawSailor(world: World, pose: Pose, vp: Viewport) {
    const ctx = this.ctx;
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const cx = pose.boat.x + sx;
    const cy = pose.boat.y + sy;
    const s = fitTransform(ctx, vp, this.dpr, SAILOR_VIEW.w, SAILOR_VIEW.h, cx, cy, "cover");
    const bounds = boundsOf(vp, s, cx, cy);

    this.drawSea(bounds, 1);
    this.drawCurrents(world, 1);
    this.drawRocks(world);
    this.drawHarbor(world, 1);
    this.drawBuoys(world, 0.6);
    this.drawBottles(world);
    this.drawWake(1);
    this.drawBoat(pose, 1);
    this.drawRipples(0.6);
    this.particles.draw(ctx);
    this.drawLighthouse(world);

    this.drawFog(world, pose, vp, s, cx, cy, bounds);

    // What reaches through the fog: lamps and lights, never rocks.
    fitTransform(ctx, vp, this.dpr, SAILOR_VIEW.w, SAILOR_VIEW.h, cx, cy, "cover");
    this.drawBeam(world, pose, 0.55);
    this.drawBuoyLights(world, 0.7);
    this.drawHarborLights(world, 0.9);
    const lh = world.night.lighthouse;
    drawGlow(ctx, LIGHT.lamp, lh.x, lh.y, 70, 0.9);
    drawGlow(ctx, LIGHT.warm, pose.boat.x + Math.cos(pose.heading) * 12, pose.boat.y + Math.sin(pose.heading) * 12, 34, 0.5 * (pose.sinking > 0 ? 0.3 : 1));
    this.edgeBeacon(vp, s, cx, cy, lh, LIGHT.lamp, "lighthouse");
    this.edgeBeacon(vp, s, cx, cy, world.night.harbor, LIGHT.harbor, "home");
    if (this.flash > 0) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = rgba(LIGHT.beam, 0.08 * this.flash);
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    }
    this.vignette(vp, 0.65);
  }

  // ─── Fog ────────────────────────────────────────────────────────────────────

  private drawFog(world: World, pose: Pose, vp: Viewport, s: number, cx: number, cy: number, bounds: Bounds) {
    const fw = Math.max(1, Math.round(vp.w * this.dpr));
    const fh = Math.max(1, Math.round(vp.h * this.dpr));
    if (this.fog.width !== fw || this.fog.height !== fh) {
      this.fog.width = fw;
      this.fog.height = fh;
    }
    const f = this.fog.getContext("2d")!;
    const k = this.dpr * s;
    const toWorld = () => f.setTransform(k, 0, 0, k, this.dpr * (vp.w / 2) - cx * k, this.dpr * (vp.h / 2) - cy * k);

    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = "source-over";
    f.clearRect(0, 0, fw, fh);
    f.fillStyle = rgba(SEA.fog, 0.975);
    f.fillRect(0, 0, fw, fh);

    // Slow drifting banks give the fog body.
    toWorld();
    const sprite = glowSprite(SEA.fogLight);
    f.globalAlpha = 0.22;
    for (const b of this.fogBlobs) {
      const x = ((b.x + this.clock * b.speed) % (CHART_W + 600)) - 300;
      const y = b.y + Math.sin(this.clock * 0.1 + b.phase) * 30;
      if (x + b.r < bounds.left || x - b.r > bounds.right || y + b.r < bounds.top || y - b.r > bounds.bottom) continue;
      f.drawImage(sprite, x - b.r, y - b.r, b.r * 2, b.r * 2);
    }
    f.globalAlpha = 1;

    // Cut the fog: the boat's own lantern, then the keeper's beam.
    f.globalCompositeOperation = "destination-out";
    if (pose.sinking <= 0) {
      const r = world.night.lantern * (1 + Math.sin(this.clock * 3.1) * 0.02);
      const g = f.createRadialGradient(pose.boat.x, pose.boat.y, 0, pose.boat.x, pose.boat.y, r * 1.35);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.55, "rgba(0,0,0,0.92)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      f.fillStyle = g;
      f.beginPath();
      f.arc(pose.boat.x, pose.boat.y, r * 1.35, 0, TAU);
      f.fill();
    }
    const lh = world.night.lighthouse;
    const beam = f.createRadialGradient(lh.x, lh.y, 0, lh.x, lh.y, BEAM.length);
    beam.addColorStop(0, "rgba(0,0,0,1)");
    beam.addColorStop(0.75, "rgba(0,0,0,0.9)");
    beam.addColorStop(1, "rgba(0,0,0,0)");
    f.fillStyle = beam;
    conePath(f, lh, pose.angle, pose.half * 1.08, BEAM.length);
    f.fill();
    f.globalCompositeOperation = "source-over";

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fog, Math.round(vp.x * this.dpr), Math.round(vp.y * this.dpr));
  }

  // ─── Scenery ────────────────────────────────────────────────────────────────

  private drawSea(b: Bounds, alpha: number) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, b.top, 0, b.bottom);
    g.addColorStop(0, SEA.deep);
    g.addColorStop(0.6, SEA.mid);
    g.addColorStop(1, SEA.shallow);
    ctx.fillStyle = g;
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    // Moon-glints on small waves.
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    for (const w of this.waves) {
      const x = w.x + Math.sin(this.clock * 0.4 + w.phase) * 8;
      if (x < b.left - 40 || x > b.right + 40 || w.y < b.top - 40 || w.y > b.bottom + 40) continue;
      const a = (0.05 + 0.05 * Math.sin(this.clock * 0.9 + w.phase * 2)) * alpha;
      ctx.strokeStyle = rgba(SEA.wave, a);
      ctx.beginPath();
      ctx.moveTo(x - w.len / 2, w.y);
      ctx.quadraticCurveTo(x, w.y - 3, x + w.len / 2, w.y);
      ctx.stroke();
    }
  }

  private drawGrid(b: Bounds) {
    const ctx = this.ctx;
    ctx.strokeStyle = rgba(SEA.grid, 0.05);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= CHART_W; x += 125) {
      ctx.moveTo(x, Math.max(0, b.top));
      ctx.lineTo(x, Math.min(CHART_H, b.bottom));
    }
    for (let y = 0; y <= CHART_H; y += 125) {
      ctx.moveTo(Math.max(0, b.left), y);
      ctx.lineTo(Math.min(CHART_W, b.right), y);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(SEA.grid, 0.14);
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, CHART_W, CHART_H);
  }

  private drawCurrents(world: World, alpha: number) {
    const ctx = this.ctx;
    ctx.lineCap = "round";
    ctx.lineWidth = 1.6;
    world.night.currents.forEach((c, ci) => {
      const speed = Math.hypot(c.vx, c.vy) || 1;
      const ux = c.vx / speed;
      const uy = c.vy / speed;
      const rand = seeded(ci + 11);
      for (let i = 0; i < Math.round((c.w * c.h) / 9000); i++) {
        const span = ux !== 0 ? c.w : c.h;
        const off = (rand() * span + this.clock * speed * 0.9) % span;
        const x = ux !== 0 ? c.x + off : c.x + rand() * c.w;
        const y = uy !== 0 ? c.y + off : c.y + rand() * c.h;
        const fadeEdge = Math.sin((off / span) * Math.PI);
        ctx.strokeStyle = rgba(SEA.wave, 0.16 * fadeEdge * alpha);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + ux * 22, y + uy * 22);
        ctx.stroke();
      }
    });
  }

  private drawRocks(world: World) {
    const ctx = this.ctx;
    world.night.rocks.forEach((r, i) => {
      const shape = this.rockShapes[i];
      if (!shape) return;
      const land = isLand(r);
      // Foam where the sea meets it.
      const foam = 0.16 + 0.07 * Math.sin(this.clock * 1.3 + i);
      ctx.strokeStyle = rgba(SEA.foam, foam);
      ctx.lineWidth = land ? 5 : 3;
      polyPath(ctx, r, shape, 1.08);
      ctx.stroke();
      ctx.fillStyle = land ? SEA.land : SEA.rock;
      polyPath(ctx, r, shape, 1);
      ctx.fill();
      ctx.fillStyle = land ? SEA.grass : SEA.rockTop;
      polyPath(ctx, { x: r.x - r.r * 0.12, y: r.y - r.r * 0.14, r: r.r }, shape, land ? 0.86 : 0.62);
      ctx.fill();
      if (land) {
        ctx.strokeStyle = rgba(SEA.landEdge, 0.9);
        ctx.lineWidth = 2;
        polyPath(ctx, r, shape, 1);
        ctx.stroke();
      }
    });
  }

  private drawLighthouse(world: World) {
    const ctx = this.ctx;
    const { x, y } = world.night.lighthouse;
    // Tower seen from above and a little south: a stubby striped cylinder.
    ctx.fillStyle = rgba(LIGHT.ink, 0.5);
    ctx.beginPath();
    ctx.ellipse(x + 6, y + 64, 24, 8, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const top = y + 8 + i * 14;
      ctx.fillStyle = i % 2 ? TOWER.red : TOWER.white;
      const w0 = 12 + i * 1.5;
      ctx.beginPath();
      ctx.moveTo(x - w0, top);
      ctx.lineTo(x + w0, top);
      ctx.lineTo(x + w0 + 1.5, top + 14);
      ctx.lineTo(x - w0 - 1.5, top + 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = TOWER.cap;
    ctx.fillRect(x - 15, y + 4, 30, 5);
    ctx.fillStyle = LIGHT.lamp;
    ctx.fillRect(x - 9, y - 8, 18, 12);
    ctx.fillStyle = TOWER.cap;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 8);
    ctx.lineTo(x, y - 20);
    ctx.lineTo(x + 12, y - 8);
    ctx.fill();
    drawGlow(ctx, LIGHT.lamp, x, y - 2, 46, 0.9 + Math.sin(this.clock * 4) * 0.05);
  }

  private drawHarbor(world: World, alpha: number) {
    const ctx = this.ctx;
    const h = world.night.harbor;
    drawGlow(ctx, LIGHT.harbor, h.x, h.y, h.r * 1.6, 0.18 * alpha);
    ctx.strokeStyle = rgba(LIGHT.harbor, 0.18 * alpha);
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // A little jetty: planks, posts, two lamps.
    ctx.fillStyle = "#3a2b22";
    ctx.fillRect(h.x - 46, h.y - 7, 92, 14);
    ctx.strokeStyle = "#241912";
    ctx.lineWidth = 1;
    for (let px = -40; px <= 40; px += 8) {
      ctx.beginPath();
      ctx.moveTo(h.x + px, h.y - 7);
      ctx.lineTo(h.x + px, h.y + 7);
      ctx.stroke();
    }
    ctx.fillStyle = "#241912";
    for (const px of [-44, 44]) ctx.fillRect(h.x + px - 3, h.y - 10, 6, 20);
    this.drawHarborLights(world, alpha);
  }

  private drawHarborLights(world: World, alpha: number) {
    const h = world.night.harbor;
    for (const px of [-44, 44]) drawGlow(this.ctx, LIGHT.harbor, h.x + px, h.y - 12, 26, alpha * (0.75 + Math.sin(this.clock * 2 + px) * 0.08));
  }

  private drawBuoys(world: World, alpha: number) {
    const ctx = this.ctx;
    world.night.buoys.forEach((p, i) => {
      const bob = Math.sin(this.clock * 1.8 + i) * 1.5;
      ctx.fillStyle = rgba("#1d2433", alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(i <= world.boat.checkpoint ? LIGHT.buoyGreen : LIGHT.buoyRed, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob - 1, 3, 0, TAU);
      ctx.fill();
    });
    this.drawBuoyLights(world, alpha);
  }

  private drawBuoyLights(world: World, alpha: number) {
    world.night.buoys.forEach((p, i) => {
      const on = Math.sin(this.clock * 2.6 + i * 1.7) > 0.1;
      if (!on) return;
      drawGlow(this.ctx, i <= world.boat.checkpoint ? LIGHT.buoyGreen : LIGHT.buoyRed, p.x, p.y, 22, 0.55 * alpha);
    });
  }

  private drawBottles(world: World) {
    const ctx = this.ctx;
    world.night.bottles.forEach((p, i) => {
      if (!world.bottles[i]) return;
      const bob = Math.sin(this.clock * 2 + i * 2) * 2;
      const tilt = Math.sin(this.clock * 1.3 + i) * 0.35 + 0.5;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.rotate(tilt);
      ctx.fillStyle = rgba(LIGHT.bottle, 0.85);
      ctx.beginPath();
      ctx.roundRect(-4, -9, 8, 15, 3);
      ctx.fill();
      ctx.fillRect(-2, -13, 4, 5);
      ctx.fillStyle = "#8a6a4a";
      ctx.fillRect(-2, -15, 4, 3);
      ctx.fillStyle = rgba("#ffffff", 0.7);
      ctx.fillRect(-2, -6, 2, 8);
      ctx.restore();
      drawGlow(ctx, LIGHT.bottle, p.x, p.y + bob, 18, 0.25 + 0.15 * Math.sin(this.clock * 3 + i));
    });
  }

  private drawWake(alpha: number) {
    const ctx = this.ctx;
    for (const r of this.wake) {
      const k = 1 - r.age / 1.6;
      ctx.strokeStyle = rgba(SEA.foam, 0.14 * k * alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 1.5 + r.age * 6, 0, TAU);
      ctx.stroke();
    }
  }

  private drawRipples(alpha: number) {
    const ctx = this.ctx;
    for (const r of this.ripples) {
      for (let i = 0; i < 3; i++) {
        const age = r.age - i * 0.35;
        if (age <= 0) continue;
        const k = Math.max(0, 1 - age / 2.4);
        ctx.strokeStyle = rgba(LIGHT.beam, 0.5 * k * alpha);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 14 + age * 70, 0, TAU);
        ctx.stroke();
      }
    }
  }

  private drawBeam(world: World, pose: Pose, alpha: number) {
    const ctx = this.ctx;
    const lh = world.night.lighthouse;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(lh.x, lh.y, 0, lh.x, lh.y, BEAM.length);
    const boost = 1 + this.flash * 0.6;
    g.addColorStop(0, rgba(LIGHT.beam, 0.3 * alpha * boost));
    g.addColorStop(0.5, rgba(LIGHT.beam, 0.12 * alpha * boost));
    g.addColorStop(1, rgba(LIGHT.beam, 0));
    ctx.fillStyle = g;
    conePath(ctx, lh, pose.angle, pose.half, BEAM.length);
    ctx.fill();
    // A brighter core down the middle.
    ctx.fillStyle = g;
    conePath(ctx, lh, pose.angle, pose.half * 0.35, BEAM.length * 0.9);
    ctx.fill();
    ctx.globalCompositeOperation = prev;
  }

  private drawBoat(pose: Pose, alpha: number) {
    if (alpha <= 0.01) return;
    const ctx = this.ctx;
    const sail = PLAYER_COLORS[roleSlot(this.night, "sailor")];
    const sinkK = pose.sinking > 0 ? clamp(pose.sinking / BOAT.sink, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha = alpha * sinkK;
    ctx.translate(pose.boat.x, pose.boat.y);
    ctx.rotate(pose.heading + Math.sin(this.clock * 2.2) * 0.04);
    ctx.scale(0.75 + 0.25 * sinkK, 0.75 + 0.25 * sinkK);
    // Hull.
    ctx.fillStyle = rgba(LIGHT.ink, 0.35);
    hullPath(ctx, 2, 3);
    ctx.fill();
    ctx.fillStyle = "#b98d5f";
    hullPath(ctx, 0, 0);
    ctx.fill();
    ctx.fillStyle = "#7d5a3c";
    ctx.beginPath();
    ctx.ellipse(-3, 0, 9, 4.5, 0, 0, TAU);
    ctx.fill();
    // Sail, filled by a gentle wind.
    ctx.fillStyle = sail;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(-4, -16, -12, -1);
    ctx.lineTo(4, 0);
    ctx.fill();
    ctx.fillStyle = rgba("#ffffff", 0.25);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(-2, -9, -8, -1);
    ctx.fill();
    ctx.fillStyle = "#3a2b22";
    ctx.beginPath();
    ctx.arc(4, 0, 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawCompass(x: number, y: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = rgba(SEA.grid, 0.22);
    ctx.fillStyle = rgba(SEA.grid, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 44, y + Math.sin(a) * 44);
      ctx.lineTo(x + Math.cos(a + 0.25) * 10, y + Math.sin(a + 0.25) * 10);
      ctx.lineTo(x + Math.cos(a - 0.25) * 10, y + Math.sin(a - 0.25) * 10);
      ctx.fill();
    }
    ctx.font = `600 13px ${this.font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(LIGHT.cream, 0.4);
    ctx.fillText("N", x, y - 50);
  }

  /** A soft glint at the edge of the sailor's view, toward a light out of sight. */
  private edgeBeacon(vp: Viewport, s: number, cx: number, cy: number, target: Vec, color: string, label: string) {
    const ctx = this.ctx;
    const sx = vp.x + vp.w / 2 + (target.x - cx) * s;
    const sy = vp.y + vp.h / 2 + (target.y - cy) * s;
    const m = 28;
    if (sx > vp.x + m && sx < vp.x + vp.w - m && sy > vp.y + m && sy < vp.y + vp.h - m) return;
    const dx = sx - (vp.x + vp.w / 2);
    const dy = sy - (vp.y + vp.h / 2);
    const k = Math.min((vp.w / 2 - m) / Math.abs(dx || 1e-6), (vp.h / 2 - m) / Math.abs(dy || 1e-6));
    const ex = vp.x + vp.w / 2 + dx * k;
    const ey = vp.y + vp.h / 2 + dy * k;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawGlow(ctx, color, ex, ey, 30, 0.6 + 0.15 * Math.sin(this.clock * 2.4));
    ctx.font = `500 11px ${this.font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(LIGHT.cream, 0.55);
    ctx.fillText(label, ex - Math.sign(dx) * 0, ey + (dy > 0 ? -18 : 26));
  }

  private drawRole(vp: Viewport, role: Role, intro: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const slot = vp.slot;
    const color = PLAYER_COLORS[slot];
    const name = this.names[slot];
    // Always: a small chip, bottom-right of the view (bottom-centre belongs to key hints).
    ctx.font = `600 11px ${this.font}`;
    ctx.textAlign = "left";
    const chip = `${role === "keeper" ? "KEEPER" : "SAILOR"}${name ? ` · ${name.toUpperCase()}` : ""}`;
    const tw = ctx.measureText(chip).width;
    const x = vp.x + vp.w - tw - 54;
    const y = vp.y + vp.h - 44;
    ctx.fillStyle = rgba(LIGHT.ink, 0.55);
    ctx.beginPath();
    ctx.roundRect(x, y - 15, tw + 34, 26, 13);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 13, y - 2, 3.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(LIGHT.cream, 0.85);
    ctx.fillText(chip, x + 24, y + 2);

    // At the start of a night: who does what, big and centred.
    if (intro <= 0.01) return;
    const copy = ROLE_COPY[role];
    ctx.textAlign = "center";
    const mx = vp.x + vp.w / 2;
    const my = vp.y + vp.h * 0.62;
    ctx.fillStyle = rgba(LIGHT.ink, 0.45 * intro);
    ctx.beginPath();
    ctx.roundRect(mx - Math.min(vp.w * 0.45, 260), my - 46, Math.min(vp.w * 0.9, 520), 84, 18);
    ctx.fill();
    ctx.fillStyle = rgba(color, intro);
    ctx.font = `italic 400 ${vp.w < 520 ? 22 : 28}px ${this.font}`;
    ctx.fillText(copy.title, mx, my - 8);
    ctx.fillStyle = rgba(LIGHT.cream, 0.75 * intro);
    ctx.font = `400 ${vp.w < 520 ? 12 : 14}px ${this.font}`;
    ctx.fillText(copy.line, mx, my + 20, vp.w * 0.86);
  }

  private vignette(vp: Viewport, strength: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cx = vp.x + vp.w / 2;
    const cy = vp.y + vp.h / 2;
    const g = ctx.createRadialGradient(cx, cy, Math.min(vp.w, vp.h) * 0.35, cx, cy, Math.hypot(vp.w, vp.h) * 0.62);
    g.addColorStop(0, rgba(LIGHT.ink, 0));
    g.addColorStop(1, rgba(LIGHT.ink, strength));
    ctx.fillStyle = g;
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
  }
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boundsOf(vp: Viewport, s: number, cx: number, cy: number): Bounds {
  return { left: cx - vp.w / 2 / s, right: cx + vp.w / 2 / s, top: cy - vp.h / 2 / s, bottom: cy + vp.h / 2 / s };
}

function conePath(ctx: CanvasRenderingContext2D, o: Vec, angle: number, half: number, len: number) {
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.arc(o.x, o.y, len, angle - half, angle + half);
  ctx.closePath();
}

function polyPath(ctx: CanvasRenderingContext2D, c: Circle, shape: Vec[], k: number) {
  ctx.beginPath();
  shape.forEach((p, i) => {
    const x = c.x + p.x * k;
    const y = c.y + p.y * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function hullPath(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.beginPath();
  ctx.moveTo(20 + ox, oy);
  ctx.quadraticCurveTo(8 + ox, -10 + oy, -14 + ox, -8 + oy);
  ctx.lineTo(-16 + ox, 8 + oy);
  ctx.quadraticCurveTo(8 + ox, 10 + oy, 20 + ox, oy);
  ctx.closePath();
}

function roleSlot(night: number, role: Role): PlayerSlot {
  return roleOf(0, night) === role ? 0 : 1;
}
