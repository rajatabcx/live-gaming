import { FROG, GOAL_HOLD, MOVE, RESPAWN_TIME, STEP, TONGUE, WORLD_H, WORLD_W } from "./constants";
import type { AnchorData, LevelData, MoverData, PlateData } from "./level";
import {
  angleTo,
  approach,
  clamp,
  contains,
  copy,
  dist,
  lerp,
  normalize,
  segmentEnters,
  smoothstep,
  vec,
  type Rect,
  type Vec,
} from "./math";

export type Slot = 0 | 1;

/** One simulation step's worth of a player's intent. Edges are latched by the caller. */
export interface FrogInput {
  x: number;
  y: number;
  jump: boolean;
  tongue: boolean;
  jumpPressed: boolean;
  tonguePressed: boolean;
}

export const IDLE_INPUT: FrogInput = { x: 0, y: 0, jump: false, tongue: false, jumpPressed: false, tonguePressed: false };

export type Target = { kind: "anchor"; index: number } | { kind: "frog"; slot: Slot };

export type Tongue =
  | { phase: "idle" }
  /** Flying out. With a target it homes in; without, it flicks to `reach` and comes back. */
  | { phase: "extend"; dir: Vec; len: number; reach: number; target: Target | null }
  | { phase: "attached"; target: Target; length: number }
  | { phase: "retract"; dir: Vec; len: number };

export type Support =
  | { kind: "solid"; index: number }
  | { kind: "mover"; index: number }
  | { kind: "frog"; slot: Slot }
  /** Standing on the partner's tongue. */
  | { kind: "bridge"; owner: Slot };

export interface Frog {
  slot: Slot;
  /** Body centre. */
  pos: Vec;
  /** Position at the start of the current step (for interpolation and carrying). */
  prev: Vec;
  vel: Vec;
  facing: 1 | -1;
  grounded: boolean;
  support: Support | null;
  coyote: number;
  jumpBuffer: number;
  sinceJump: number;
  canCutJump: boolean;
  /** Last stick direction that was clearly pushed. */
  aim: Vec;
  aiming: boolean;
  tongue: Tongue;
  /** Last solid spot we stood on, away from edges — respawn point. */
  safe: Vec;
  /** > 0 while recovering from a splash. */
  respawn: number;
}

export interface Plate extends PlateData {
  pressed: boolean;
}

export interface Mover {
  data: MoverData;
  t: number;
  pos: Vec;
  delta: Vec;
  open: boolean;
}

export interface Firefly {
  home: Vec;
  phase: number;
  taken: boolean;
}

export type WorldEvent =
  | { type: "jump"; slot: Slot }
  | { type: "land"; slot: Slot; impact: number }
  | { type: "tongue-fire"; slot: Slot; target: Target | null }
  | { type: "tongue-attach"; slot: Slot; target: Target }
  | { type: "tongue-release"; slot: Slot; fling: boolean }
  | { type: "firefly"; slot: Slot; x: number; y: number; collected: number }
  | { type: "splash"; slot: Slot; x: number; y: number }
  | { type: "respawn"; slot: Slot }
  | { type: "plate"; index: number; pressed: boolean }
  | { type: "goal"; count: number }
  | { type: "complete" };

const other = (s: Slot): Slot => (s === 0 ? 1 : 0);

function createFrog(slot: Slot, feet: Vec): Frog {
  const pos = vec(feet.x, feet.y - FROG.hh);
  return {
    slot,
    pos,
    prev: copy(pos),
    vel: vec(),
    facing: 1,
    grounded: false,
    support: null,
    coyote: 0,
    jumpBuffer: 0,
    sinceJump: Infinity,
    canCutJump: false,
    aim: vec(1, 0),
    aiming: false,
    tongue: { phase: "idle" },
    safe: copy(pos),
    respawn: 0,
  };
}

/**
 * The whole game state for one level, advanced in fixed steps. No DOM, no
 * clocks, no randomness — the same inputs always produce the same level.
 *
 * Physics: axis-separated AABB vs. static rects and movers; partners are
 * one-way platforms for each other (stacking). Tongues are taut-only rope
 * constraints solved on predicted positions (position-based), so swinging,
 * reeling and yanking all fall out of one rule.
 */
export class World {
  readonly level: LevelData;
  readonly frogs: [Frog, Frog];
  readonly anchors: readonly AnchorData[];
  readonly plates: Plate[];
  readonly movers: Mover[];
  readonly fireflies: Firefly[];
  time = 0;
  collected = 0;
  /** Frogs currently on the moon pad. */
  goalCount = 0;
  /** 0..1 progress of both standing on the pad. */
  goalHold = 0;
  complete = false;
  private events: WorldEvent[] = [];

  constructor(level: LevelData) {
    this.level = level;
    this.frogs = [createFrog(0, level.spawns[0]), createFrog(1, level.spawns[1])];
    this.anchors = level.anchors;
    this.plates = level.plates.map((p) => ({ ...p, pressed: false }));
    this.movers = level.movers.map((m) => ({ data: m, t: 0, pos: vec(m.x, m.y), delta: vec(), open: false }));
    this.fireflies = level.fireflies.map((home, i) => ({ home, phase: i * 2.399, taken: false }));
  }

  step(inputs: readonly [FrogInput, FrogInput]): WorldEvent[] {
    this.events = [];
    this.time += STEP;
    for (const f of this.frogs) {
      f.prev.x = f.pos.x;
      f.prev.y = f.pos.y;
    }

    this.updatePlates();
    this.updateMovers();
    for (const f of this.frogs) {
      if (f.respawn > 0) this.tickRespawn(f);
      else this.control(f, inputs[f.slot]);
    }
    for (const f of this.frogs) if (f.respawn <= 0) this.solveTongue(f, inputs[f.slot]);
    // Whoever is underneath moves first so the one on top can ride along.
    const order: Slot[] = this.frogs[0].support?.kind === "frog" ? [1, 0] : [0, 1];
    for (const s of order) if (this.frogs[s].respawn <= 0) this.move(this.frogs[s]);
    for (const f of this.frogs) if (f.respawn <= 0) this.updateTongue(f, inputs[f.slot]);
    this.collectFireflies();
    this.checkWater();
    this.checkGoal();
    return this.events;
  }

  // ─── Queries (also used by the renderer) ────────────────────────────────────

  mouth(f: Frog): Vec {
    return vec(f.pos.x + f.facing * FROG.mouthX, f.pos.y + FROG.mouthY);
  }

  targetPoint(t: Target): Vec {
    return t.kind === "anchor" ? this.anchors[t.index] : this.frogs[t.slot].pos;
  }

  moverRect(m: Mover): Rect {
    return { x: m.pos.x, y: m.pos.y, w: m.data.w, h: m.data.h };
  }

  fireflyPos(i: number): Vec {
    const f = this.fireflies[i];
    const t = this.time;
    return vec(f.home.x + Math.sin(t * 1.1 + f.phase) * 7, f.home.y + Math.cos(t * 1.6 + f.phase * 1.3) * 5);
  }

  /** Physics tip of a flying tongue (from the body centre). */
  tongueTip(f: Frog): Vec | null {
    const t = f.tongue;
    if (t.phase !== "extend" && t.phase !== "retract") return null;
    return vec(f.pos.x + t.dir.x * t.len, f.pos.y + t.dir.y * t.len);
  }

  /** The walkable segment of `owner`'s tongue, if it's currently a bridge. */
  bridge(owner: Slot): [Vec, Vec] | null {
    const f = this.frogs[owner];
    const t = f.tongue;
    if (f.respawn > 0 || !f.grounded || t.phase !== "attached" || t.target.kind !== "anchor") return null;
    const a = this.mouth(f);
    const b = this.anchors[t.target.index];
    const dx = b.x - a.x;
    if (Math.abs(dx) < 30 || Math.abs((b.y - a.y) / dx) > TONGUE.maxBridgeSlope) return null;
    // Only taut tongues hold weight.
    if (dist(f.pos, b) < t.length - 4) return null;
    return dx > 0 ? [a, vec(b.x, b.y)] : [vec(b.x, b.y), a];
  }

  /** What this frog's tongue is holding or homing in on. */
  heldTarget(f: Frog): Target | null {
    const t = f.tongue;
    return t.phase === "attached" || (t.phase === "extend" && t.target) ? t.target : null;
  }

  /** Holding a tongue, or held by one. */
  tethered(f: Frog): boolean {
    if (f.tongue.phase === "attached") return true;
    const p = this.frogs[other(f.slot)].tongue;
    return p.phase === "attached" && p.target.kind === "frog";
  }

  isTied(): boolean {
    return this.frogs.some((f) => f.tongue.phase === "attached" && f.tongue.target.kind === "frog");
  }

  // ─── Step phases ────────────────────────────────────────────────────────────

  private emit(e: WorldEvent) {
    this.events.push(e);
  }

  private updatePlates() {
    this.plates.forEach((p, index) => {
      const pressed = this.frogs.some(
        (f) =>
          f.respawn <= 0 &&
          f.grounded &&
          Math.abs(f.pos.y + FROG.hh - p.y) < 3 &&
          f.pos.x > p.x - 4 &&
          f.pos.x < p.x + p.w + 4,
      );
      if (pressed !== p.pressed) {
        p.pressed = pressed;
        this.emit({ type: "plate", index, pressed });
      }
    });
  }

  private updateMovers() {
    this.movers.forEach((m, index) => {
      const d = m.data;
      m.open = d.plates.some((i) => this.plates[i]?.pressed);
      const span = Math.hypot(d.to.x - d.x, d.to.y - d.y) || 1;
      const t = approach(m.t, m.open ? 1 : 0, (d.speed * STEP) / span);
      const e = smoothstep(t);
      const next = vec(lerp(d.x, d.to.x, e), lerp(d.y, d.to.y, e));
      // Never crush a frog: wait until it moves out of the way. Riders are carried instead.
      const rect = { x: next.x, y: next.y, w: d.w, h: d.h };
      const blocked = this.frogs.some(
        (f) =>
          f.respawn <= 0 &&
          !(f.support?.kind === "mover" && f.support.index === index) &&
          overlapsFrog(f.pos, rect),
      );
      if (blocked) {
        m.delta = vec();
        return;
      }
      m.delta = vec(next.x - m.pos.x, next.y - m.pos.y);
      m.t = t;
      m.pos = next;
    });
  }

  private control(f: Frog, input: FrogInput) {
    const dt = STEP;
    const x = Math.abs(input.x) > 0.2 ? input.x : 0;
    const t = f.tongue;
    const attached = t.phase === "attached";

    // Holding your partner or a stump plants your feet: the stick aims and reels
    // instead of walking you off the ledge you're anchoring from.
    const held = this.heldTarget(f);
    const planted = f.grounded && held !== null && (held.kind === "frog" || this.anchors[held.index].kind === "post");
    if (x !== 0) f.facing = x > 0 ? 1 : -1;
    if (attached && f.grounded) f.facing = this.targetPoint(t.target).x >= f.pos.x ? 1 : -1;

    if (f.grounded) f.vel.x = approach(f.vel.x, planted ? 0 : x * MOVE.run, MOVE.groundAccel * dt);
    else if (attached) f.vel.x += x * MOVE.swingPump * dt;
    else if (x !== 0) {
      const carrying = Math.sign(f.vel.x) === Math.sign(x) && Math.abs(f.vel.x) > MOVE.run;
      if (!carrying) f.vel.x = approach(f.vel.x, x * MOVE.run, MOVE.airAccel * dt);
    } else {
      const drag = Math.abs(f.vel.x) > MOVE.run ? MOVE.flingDrag : MOVE.airDrag;
      f.vel.x = approach(f.vel.x, 0, drag * dt);
    }
    f.vel.y = Math.min(f.vel.y + MOVE.gravity * dt, MOVE.maxFall);

    // Jump: coyote time + input buffer so it never feels like it ate a press.
    f.coyote = f.grounded ? MOVE.coyote : f.coyote - dt;
    f.jumpBuffer = input.jumpPressed ? MOVE.buffer : f.jumpBuffer - dt;
    f.sinceJump += dt;
    if (f.jumpBuffer > 0 && f.coyote > 0) {
      f.vel.y = -MOVE.jumpVelocity;
      const s = f.support;
      if (s?.kind === "mover") f.vel.y += Math.min(0, this.movers[s.index].delta.y / dt);
      f.grounded = false;
      f.support = null;
      f.coyote = 0;
      f.jumpBuffer = 0;
      f.sinceJump = 0;
      f.canCutJump = true;
      this.emit({ type: "jump", slot: f.slot });
    }
    if (f.canCutJump && !input.jump && f.sinceJump > MOVE.jumpCutAfter) {
      if (f.vel.y < 0) f.vel.y *= MOVE.jumpCut;
      f.canCutJump = false;
    }
    if (f.vel.y >= 0) f.canCutJump = false;

    // A mostly-sideways stick means "I'm running" — aim forward and up, where
    // the things worth grabbing hang. A deliberate diagonal aims exactly.
    const mag = Math.hypot(input.x, input.y);
    f.aiming = mag > 0.35;
    if (f.aiming) {
      f.aim =
        Math.abs(input.y) < 0.35
          ? vec(Math.sign(input.x) * Math.cos(TONGUE.runningAim), -Math.sin(TONGUE.runningAim))
          : vec(input.x / mag, input.y / mag);
    }

    if (input.tonguePressed && (t.phase === "idle" || t.phase === "retract")) this.fire(f);
    else if (attached && !input.tongue) this.release(f, true);
  }

  private fire(f: Frog) {
    const dir = f.aiming ? f.aim : vec(f.facing * Math.cos(TONGUE.neutralAim), -Math.sin(TONGUE.neutralAim));
    const target = this.pickTarget(f, dir);
    if (target) {
      const p = this.targetPoint(target);
      if (Math.abs(p.x - f.pos.x) > 4) f.facing = p.x > f.pos.x ? 1 : -1;
      f.tongue = { phase: "extend", dir: normalize(p.x - f.pos.x, p.y - f.pos.y), len: 0, reach: dist(f.pos, p), target };
    } else {
      f.tongue = { phase: "extend", dir, len: 0, reach: this.rayLength(f.pos, dir, TONGUE.range), target: null };
    }
    this.emit({ type: "tongue-fire", slot: f.slot, target });
  }

  /**
   * Aim assist. Phones have no precise aim, so pick the best grabbable thing
   * near where the stick points. With the stick neutral, prefer anchors ahead
   * and above; fall back to the partner wherever they are.
   */
  private pickTarget(f: Frog, dir: Vec): Target | null {
    const cone = f.aiming ? TONGUE.coneAimed : TONGUE.coneNeutral;
    let best: Target | null = null;
    let bestScore = Infinity;
    const consider = (target: Target, p: Vec, neutralFallback: boolean) => {
      const dx = p.x - f.pos.x;
      const dy = p.y - f.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > TONGUE.range || d < 1 || !this.canSee(f, p)) return;
      const angle = angleTo(dir, dx, dy);
      let score: number;
      if (angle <= cone) score = angle + (d / TONGUE.range) * 0.35;
      else if (neutralFallback) score = 1.6 + d / TONGUE.range;
      else return;
      if (score < bestScore) {
        bestScore = score;
        best = target;
      }
    };
    // Something right in your face is never what you meant to grab.
    this.anchors.forEach((a, index) => {
      if (dist(f.pos, a) > 64) consider({ kind: "anchor", index }, a, false);
    });
    const p = this.frogs[other(f.slot)];
    const holdsMe = p.tongue.phase === "attached" && p.tongue.target.kind === "frog";
    if (p.respawn <= 0 && !holdsMe) consider({ kind: "frog", slot: p.slot }, p.pos, !f.aiming);
    return best;
  }

  private release(f: Frog, voluntary: boolean) {
    const t = f.tongue;
    if (t.phase !== "attached") return;
    const p = this.targetPoint(t.target);
    const fling = voluntary && !f.grounded;
    if (fling) {
      f.vel.x *= TONGUE.releaseBoost;
      f.vel.y = f.vel.y * TONGUE.releaseBoost - TONGUE.releasePop;
    }
    f.tongue = { phase: "retract", dir: normalize(p.x - f.pos.x, p.y - f.pos.y), len: dist(f.pos, p) };
    this.emit({ type: "tongue-release", slot: f.slot, fling });
  }

  /** Rope constraint on predicted positions; rewrites velocities to match. */
  private solveTongue(f: Frog, input: FrogInput) {
    const t = f.tongue;
    if (t.phase !== "attached") return;
    const dt = STEP;
    const partner = t.target.kind === "frog" ? this.frogs[t.target.slot] : null;
    const anchor = t.target.kind === "anchor" ? this.anchors[t.target.index] : null;

    // Push up to reel in, down to let out. Posts are fixed-length (they're bridges).
    if (anchor?.kind !== "post") {
      const reel = input.y < -0.45 ? -1 : input.y > 0.45 ? 1 : 0;
      t.length = clamp(t.length + reel * TONGUE.reel * dt, TONGUE.minLength, TONGUE.range);
    }

    let ax = f.pos.x + f.vel.x * dt;
    let ay = f.pos.y + f.vel.y * dt;
    let bx = partner ? partner.pos.x + partner.vel.x * dt : anchor!.x;
    let by = partner ? partner.pos.y + partner.vel.y * dt : anchor!.y;
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.hypot(dx, dy);
    if (d < t.length) t.length = Math.max(d, TONGUE.minLength, t.length - TONGUE.takeUp * dt);
    if (d <= t.length || d === 0) return;

    // Whoever is planted on the ground is the anchor; the holder anchors if both are.
    let wa = 1;
    let wb = 0;
    if (partner) {
      if (f.grounded) [wa, wb] = [TONGUE.plantedWeight, 1];
      else if (partner.grounded) [wa, wb] = [1, TONGUE.plantedWeight];
      else [wa, wb] = [1, 1];
    }
    const k = (d - t.length) / (d * (wa + wb));
    ax += dx * k * wa;
    ay += dy * k * wa;
    f.vel.x = (ax - f.pos.x) / dt;
    f.vel.y = (ay - f.pos.y) / dt;
    if (partner) {
      bx -= dx * k * wb;
      by -= dy * k * wb;
      partner.vel.x = (bx - partner.pos.x) / dt;
      partner.vel.y = (by - partner.pos.y) / dt;
    }
  }

  private move(f: Frog) {
    const dt = STEP;
    const { hw, hh } = FROG;

    // Ride whatever we're standing on.
    const s = f.support;
    if (s?.kind === "mover") {
      const d = this.movers[s.index].delta;
      f.pos.x += d.x;
      f.pos.y += d.y;
    } else if (s?.kind === "frog") {
      const o = this.frogs[s.slot];
      f.pos.x += o.pos.x - o.prev.x;
      f.pos.y += o.pos.y - o.prev.y;
    }

    const speed = Math.hypot(f.vel.x, f.vel.y);
    if (speed > MOVE.maxSpeed) {
      f.vel.x *= MOVE.maxSpeed / speed;
      f.vel.y *= MOVE.maxSpeed / speed;
    }

    const wasGrounded = f.grounded;
    const prevSupport = f.support;
    const fallSpeed = f.vel.y;
    f.grounded = false;
    f.support = null;

    // X axis.
    let wall: { rect: Rect; support: Support; side: number } | null = null;
    f.pos.x += f.vel.x * dt;
    this.forEachBlock((r, support) => {
      if (!overlapsFrog(f.pos, r)) return;
      wall = { rect: r, support, side: f.vel.x >= 0 ? 1 : -1 };
      if (f.vel.x > 0) f.pos.x = r.x - hw;
      else if (f.vel.x < 0) f.pos.x = r.x + r.w + hw;
      else f.pos.x = f.pos.x < r.x + r.w / 2 ? r.x - hw : r.x + r.w + hw;
      f.vel.x = 0;
    });
    if (f.pos.x < hw || f.pos.x > WORLD_W - hw) {
      f.pos.x = clamp(f.pos.x, hw, WORLD_W - hw);
      f.vel.x = 0;
    }

    // Y axis.
    const bottomBefore = f.pos.y + hh;
    f.pos.y += f.vel.y * dt;
    this.forEachBlock((r, support) => {
      if (!overlapsFrog(f.pos, r)) return;
      const landing = f.vel.y > 0 || (f.vel.y === 0 && f.pos.y < r.y + r.h / 2);
      if (landing) {
        f.pos.y = r.y - hh;
        f.grounded = true;
        f.support = support;
      } else f.pos.y = r.y + r.h + hh;
      f.vel.y = 0;
    });

    // Tongue mantle: being reeled up against a lip pops you over it, so a pull
    // never stalls just under an edge. Jumping alone gets no such help.
    const lip = wall as { rect: Rect; support: Support; side: number } | null;
    if (!f.grounded && lip && f.vel.y < 60 && this.tethered(f)) {
      const below = f.pos.y + hh - lip.rect.y;
      if (below > 0 && below < 48) {
        f.pos.y = lip.rect.y - hh;
        f.pos.x += lip.side * 6;
        f.vel.x = 0;
        f.vel.y = 0;
        f.grounded = true;
        f.support = lip.support;
      }
    }

    const partner = this.frogs[other(f.slot)];
    // One-way: the partner's head.
    if (!f.grounded && f.vel.y >= 0 && partner.respawn <= 0 && partner.support?.kind !== "frog") {
      const top = partner.pos.y - hh;
      if (bottomBefore <= top + 2 && f.pos.y + hh >= top && Math.abs(f.pos.x - partner.pos.x) < hw * 2 - 10) {
        f.pos.y = top - hh;
        f.vel.y = 0;
        f.grounded = true;
        f.support = { kind: "frog", slot: partner.slot };
      }
    }
    // One-way: the partner's tongue, when it's a bridge.
    if (!f.grounded && f.vel.y >= 0) {
      const line = this.bridge(partner.slot);
      const y = line ? lineY(line, f.pos.x) : null;
      if (y !== null) {
        const bottom = f.pos.y + hh;
        const wasOn = prevSupport?.kind === "bridge";
        const crossing = bottomBefore <= y + 3 && bottom >= y;
        const stepUp = bottom >= y && bottom - y <= TONGUE.bridgeStepUp;
        if ((wasOn && Math.abs(bottom - y) < 14) || crossing || stepUp) {
          f.pos.y = y - hh;
          f.vel.y = 0;
          f.grounded = true;
          f.support = { kind: "bridge", owner: partner.slot };
        }
      }
    }

    if (f.grounded && !wasGrounded && fallSpeed > 250) this.emit({ type: "land", slot: f.slot, impact: fallSpeed });

    if (f.support?.kind === "solid") {
      const r = this.level.solids[f.support.index];
      if (f.pos.x > r.x + 28 && f.pos.x < r.x + r.w - 28) f.safe = copy(f.pos);
    }
  }

  private updateTongue(f: Frog, input: FrogInput) {
    const t = f.tongue;
    if (t.phase === "extend") {
      if (t.target) {
        if (t.target.kind === "frog" && this.frogs[t.target.slot].respawn > 0) {
          f.tongue = { phase: "retract", dir: t.dir, len: t.len };
          return;
        }
        const p = this.targetPoint(t.target);
        t.dir = normalize(p.x - f.pos.x, p.y - f.pos.y);
        t.reach = dist(f.pos, p);
      }
      t.len += TONGUE.speed * STEP;
      if (t.len < t.reach) return;
      t.len = t.reach;
      if (t.target && input.tongue) {
        const length = clamp(dist(f.pos, this.targetPoint(t.target)), TONGUE.minLength, TONGUE.range);
        f.tongue = { phase: "attached", target: t.target, length };
        this.emit({ type: "tongue-attach", slot: f.slot, target: t.target });
      } else f.tongue = { phase: "retract", dir: t.dir, len: t.len };
    } else if (t.phase === "retract") {
      t.len -= TONGUE.retract * STEP;
      if (t.len <= 0) f.tongue = { phase: "idle" };
    } else if (t.phase === "attached" && t.target.kind === "frog" && this.frogs[t.target.slot].respawn > 0) {
      this.release(f, false);
    }
  }

  private collectFireflies() {
    this.fireflies.forEach((ff, i) => {
      if (ff.taken) return;
      const p = this.fireflyPos(i);
      for (const f of this.frogs) {
        if (f.respawn > 0) continue;
        const tip = this.tongueTip(f);
        const touched = dist(f.pos, p) < 28 || (tip !== null && dist(tip, p) < 24);
        if (!touched) continue;
        ff.taken = true;
        this.collected++;
        this.emit({ type: "firefly", slot: f.slot, x: p.x, y: p.y, collected: this.collected });
        break;
      }
    });
  }

  private checkWater() {
    const surface = this.level.water ?? WORLD_H + 60;
    for (const f of this.frogs) {
      if (f.respawn > 0 || f.pos.y < surface) continue;
      this.emit({ type: "splash", slot: f.slot, x: f.pos.x, y: surface });
      f.respawn = RESPAWN_TIME;
      f.tongue = { phase: "idle" };
      const p = this.frogs[other(f.slot)];
      if (p.tongue.phase === "attached" && p.tongue.target.kind === "frog") this.release(p, false);
      if (p.support?.kind === "frog") p.support = null;
    }
  }

  private tickRespawn(f: Frog) {
    f.respawn -= STEP;
    if (f.respawn > 0) return;
    f.respawn = 0;
    f.pos = copy(f.safe);
    f.prev = copy(f.safe);
    f.vel = vec();
    f.grounded = false;
    f.support = null;
    f.tongue = { phase: "idle" };
    this.emit({ type: "respawn", slot: f.slot });
  }

  private checkGoal() {
    const g = this.level.goal;
    const count = this.frogs.filter((f) => f.respawn <= 0 && f.grounded && contains(g, f.pos)).length;
    if (count !== this.goalCount) {
      this.goalCount = count;
      this.emit({ type: "goal", count });
    }
    if (this.complete) return;
    this.goalHold = count === 2 ? Math.min(1, this.goalHold + STEP / GOAL_HOLD) : Math.max(0, this.goalHold - STEP * 2);
    if (this.goalHold >= 1) {
      this.complete = true;
      this.emit({ type: "complete" });
    }
  }

  // ─── Geometry ───────────────────────────────────────────────────────────────

  private forEachBlock(fn: (r: Rect, support: Support) => void) {
    this.level.solids.forEach((r, index) => fn(r, { kind: "solid", index }));
    this.movers.forEach((m, index) => fn(this.moverRect(m), { kind: "mover", index }));
  }

  /**
   * Line of sight from the body or the mouth (turned toward `p`). The block
   * you're standing on never blocks: you can always lick over your own ledge.
   */
  private canSee(f: Frog, p: Vec): boolean {
    const side = p.x >= f.pos.x ? 1 : -1;
    const mouth = vec(f.pos.x + side * FROG.mouthX, f.pos.y + FROG.mouthY);
    const own = f.support;
    const skip = own?.kind === "solid" || own?.kind === "mover" ? own : null;
    return this.clearLine(f.pos, p, skip) || this.clearLine(mouth, p, skip);
  }

  private clearLine(a: Vec, b: Vec, skip: Support | null = null): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let clear = true;
    this.forEachBlock((r, support) => {
      if (skip && support.kind === skip.kind && "index" in skip && "index" in support && support.index === skip.index) return;
      const t = segmentEnters(a.x, a.y, dx, dy, r);
      if (t !== null && t < 0.97) clear = false;
    });
    return clear;
  }

  private rayLength(from: Vec, dir: Vec, max: number): number {
    let best = 1;
    this.forEachBlock((r) => {
      const t = segmentEnters(from.x, from.y, dir.x * max, dir.y * max, r);
      if (t !== null && t < best) best = t;
    });
    return Math.max(best * max, 24);
  }
}

function overlapsFrog(p: Vec, r: Rect): boolean {
  return (
    p.x - FROG.hw < r.x + r.w && p.x + FROG.hw > r.x && p.y - FROG.hh < r.y + r.h && p.y + FROG.hh > r.y
  );
}

function lineY([a, b]: [Vec, Vec], x: number): number | null {
  if (x < a.x || x > b.x) return null;
  return lerp(a.y, b.y, (x - a.x) / (b.x - a.x));
}
