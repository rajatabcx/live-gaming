import { clamp, copy, dist, smoothstep, vec, type Vec } from "../../kit/math";
import { APART, GLOW, LANTERN, STAR, STEP, VIEW_H, VIEW_W } from "./constants";
import type { ChapterData } from "./chapter";

export type Slot = 0 | 1;

export interface LanternInput {
  x: number;
  y: number;
  glowPressed: boolean;
}

export const IDLE_INPUT: LanternInput = { x: 0, y: 0, glowPressed: false };

export interface Lantern {
  slot: Slot;
  pos: Vec;
  prev: Vec;
  vel: Vec;
  glowCooldown: number;
  /** World time of this lantern's last glow, for harmonies. */
  lastGlow: number;
}

export interface Star {
  x: number;
  y: number;
  visible: boolean;
  lit: boolean;
  /** 0..1 kindling. */
  progress: number;
}

export type WorldEvent =
  | { type: "kindle"; index: number }
  | { type: "lit"; index: number; count: number; total: number }
  | { type: "line"; a: number; b: number }
  | { type: "glow"; slot: Slot; x: number; y: number }
  | { type: "reveal"; index: number }
  | { type: "harmony"; x: number; y: number }
  | { type: "complete" };

/**
 * One chapter's sky. Deterministic fixed-step: two floating lanterns, stars
 * that only light when you're both at them, glow pulses that find hidden
 * stars, and winds. `rise()` swaps in the next chapter but keeps the lanterns.
 */
export class World {
  chapter: ChapterData;
  readonly lanterns: [Lantern, Lantern];
  stars: Star[] = [];
  time = 0;
  complete = false;
  private kindling = new Set<number>();
  private events: WorldEvent[] = [];

  constructor(chapter: ChapterData) {
    this.chapter = chapter;
    this.lanterns = [0, 1].map((slot) => {
      const pos = copy(chapter.spawns[slot]);
      return { slot: slot as Slot, pos, prev: copy(pos), vel: vec(), glowCooldown: 0, lastGlow: -Infinity };
    }) as [Lantern, Lantern];
    this.loadStars();
  }

  /** Move on to the next chapter in the same sky; lanterns carry over. */
  rise(chapter: ChapterData) {
    this.chapter = chapter;
    this.complete = false;
    this.kindling.clear();
    this.loadStars();
  }

  get litCount() {
    return this.stars.filter((s) => s.lit).length;
  }

  get separation() {
    return dist(this.lanterns[0].pos, this.lanterns[1].pos);
  }

  /** 1 when close together, fading to APART.min far apart. */
  get warmth() {
    return 1 - (1 - APART.min) * smoothstep(clamp((this.separation - APART.near) / (APART.far - APART.near), 0, 1));
  }

  step(inputs: readonly [LanternInput, LanternInput]): WorldEvent[] {
    this.events = [];
    this.time += STEP;
    for (const l of this.lanterns) this.move(l, inputs[l.slot]);
    for (const l of this.lanterns) if (inputs[l.slot].glowPressed) this.glow(l);
    if (!this.complete) this.kindle();
    return this.events;
  }

  /** The wind acting at a point (for the renderer's motes too). */
  windAt(p: Vec): Vec {
    const w = vec();
    for (const z of this.chapter.winds) {
      if (p.x < z.x || p.x > z.x + z.w || p.y < z.y || p.y > z.y + z.h) continue;
      // Ease in over the zone's outer 15% so currents don't have hard edges.
      const ex = Math.min(p.x - z.x, z.x + z.w - p.x) / (z.w * 0.15);
      const ey = Math.min(p.y - z.y, z.y + z.h - p.y) / (z.h * 0.15);
      const k = Math.min(1, ex, ey);
      w.x += z.fx * k;
      w.y += z.fy * k;
    }
    return w;
  }

  // ─── Phases ─────────────────────────────────────────────────────────────────

  private loadStars() {
    this.stars = this.chapter.stars.map((s) => ({ x: s.x, y: s.y, visible: !s.hidden, lit: false, progress: 0 }));
  }

  private emit(e: WorldEvent) {
    this.events.push(e);
  }

  private move(l: Lantern, input: LanternInput) {
    const dt = STEP;
    l.prev.x = l.pos.x;
    l.prev.y = l.pos.y;
    l.glowCooldown = Math.max(0, l.glowCooldown - dt);

    const mag = Math.hypot(input.x, input.y);
    const k = mag > 1 ? 1 / mag : 1;
    const wind = this.windAt(l.pos);
    let ax = input.x * k * LANTERN.accel + wind.x;
    let ay = input.y * k * LANTERN.accel + wind.y;

    // Soft walls keep you in the window without a hard bonk.
    const m = LANTERN.margin;
    if (l.pos.x < m) ax += (m - l.pos.x) / m * LANTERN.wall;
    if (l.pos.x > VIEW_W - m) ax -= (l.pos.x - (VIEW_W - m)) / m * LANTERN.wall;
    if (l.pos.y < m) ay += (m - l.pos.y) / m * LANTERN.wall;
    if (l.pos.y > VIEW_H - m) ay -= (l.pos.y - (VIEW_H - m)) / m * LANTERN.wall;

    l.vel.x += ax * dt;
    l.vel.y += ay * dt;
    const drag = Math.exp(-LANTERN.drag * dt);
    l.vel.x *= drag;
    l.vel.y *= drag;
    const speed = Math.hypot(l.vel.x, l.vel.y);
    if (speed > LANTERN.maxSpeed) {
      l.vel.x *= LANTERN.maxSpeed / speed;
      l.vel.y *= LANTERN.maxSpeed / speed;
    }
    l.pos.x = clamp(l.pos.x + l.vel.x * dt, 0, VIEW_W);
    l.pos.y = clamp(l.pos.y + l.vel.y * dt, 0, VIEW_H);
  }

  private glow(l: Lantern) {
    if (l.glowCooldown > 0) return;
    l.glowCooldown = GLOW.cooldown;
    l.lastGlow = this.time;
    this.emit({ type: "glow", slot: l.slot, x: l.pos.x, y: l.pos.y });

    this.stars.forEach((s, index) => {
      if (s.visible || dist(s, l.pos) > GLOW.reveal) return;
      s.visible = true;
      this.emit({ type: "reveal", index });
    });

    const other = this.lanterns[l.slot === 0 ? 1 : 0];
    if (this.time - other.lastGlow <= GLOW.harmonyWindow && dist(l.pos, other.pos) <= GLOW.harmonyRange) {
      const mid = vec((l.pos.x + other.pos.x) / 2, (l.pos.y + other.pos.y) / 2);
      // Spend both glows so one harmony can't chain off a third press.
      other.lastGlow = -Infinity;
      l.lastGlow = -Infinity;
      this.emit({ type: "harmony", x: mid.x, y: mid.y });
      for (const s of this.stars) {
        if (s.visible && !s.lit && dist(s, mid) <= GLOW.harmonyRadius) s.progress = Math.min(0.95, s.progress + GLOW.harmonyBoost);
      }
    }
  }

  private kindle() {
    const [a, b] = this.lanterns;
    this.stars.forEach((s, index) => {
      if (s.lit || !s.visible) return;
      const together = dist(s, a.pos) <= STAR.reach && dist(s, b.pos) <= STAR.reach;
      if (together) {
        if (!this.kindling.has(index)) {
          this.kindling.add(index);
          this.emit({ type: "kindle", index });
        }
        s.progress += STEP / STAR.kindle;
      } else {
        this.kindling.delete(index);
        s.progress = Math.max(0, s.progress - STEP * STAR.cool);
      }
      if (s.progress >= 1) this.light(index);
    });
  }

  private light(index: number) {
    const s = this.stars[index];
    s.lit = true;
    s.progress = 1;
    this.kindling.delete(index);
    const count = this.litCount;
    this.emit({ type: "lit", index, count, total: this.stars.length });
    for (const [a, b] of this.chapter.lines) {
      if ((a === index && this.stars[b].lit) || (b === index && this.stars[a].lit)) this.emit({ type: "line", a, b });
    }
    if (count === this.stars.length) {
      this.complete = true;
      this.emit({ type: "complete" });
    }
  }
}
