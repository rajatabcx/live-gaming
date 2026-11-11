import { clamp, copy, vec, type Rect, type Vec } from "../../kit/math";
import { BOUNCE, COUNTDOWN, CRUMBLE, DIVE, FALL_Y, FINISH_GRACE, HIT, MOVE, RESPAWN_TIME, RUNNER, STEP, VIEW_W } from "./constants";
import type { CourseData, SliderData, ThumperData } from "./course";

export type Slot = 0 | 1;

export interface RunnerInput {
  x: number;
  jump: boolean;
  jumpPressed: boolean;
  divePressed: boolean;
}

export const IDLE_INPUT: RunnerInput = { x: 0, jump: false, jumpPressed: false, divePressed: false };

export type Support = { kind: "solid" | "crumble" | "slider" | "thumper"; index: number };

export interface Runner {
  slot: Slot;
  pos: Vec;
  prev: Vec;
  vel: Vec;
  facing: 1 | -1;
  grounded: boolean;
  support: Support | null;
  coyote: number;
  jumpBuffer: number;
  sinceJump: number;
  canCutJump: boolean;
  /** Seconds left in a dive (no steering). */
  dive: number;
  canDive: boolean;
  /** Seconds of belly-flop / knockdown during which you can't act. */
  flop: number;
  stun: number;
  /** Cooldown so one spinner contact is one whack. */
  hitCooldown: number;
  respawn: number;
  checkpoint: number;
  /** Course time when this runner crossed the line. */
  finished: number | null;
}

export type CrumbleState = "solid" | "shaking" | "falling";

export interface Crumble {
  rect: Rect;
  state: CrumbleState;
  timer: number;
  /** Visual drop while falling. */
  fall: number;
}

export interface Mover {
  rect: Rect;
  delta: Vec;
}

export type WorldEvent =
  | { type: "go" }
  | { type: "jump"; slot: Slot }
  | { type: "land"; slot: Slot; impact: number }
  | { type: "dive"; slot: Slot }
  | { type: "flop"; slot: Slot }
  | { type: "bump"; x: number; y: number; hard: boolean; victim: Slot | null }
  | { type: "whack"; slot: Slot; x: number; y: number }
  | { type: "bounce"; slot: Slot; x: number; y: number }
  | { type: "crumble"; index: number }
  | { type: "fall"; slot: Slot }
  | { type: "respawn"; slot: Slot }
  | { type: "checkpoint"; slot: Slot; index: number }
  | { type: "finish"; slot: Slot; place: 1 | 2 }
  | { type: "over" };

const other = (s: Slot): Slot => (s === 0 ? 1 : 0);

function createRunner(slot: Slot, at: Vec): Runner {
  const pos = vec(at.x + (slot === 0 ? -26 : 26), at.y - RUNNER.r);
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
    dive: 0,
    canDive: true,
    flop: 0,
    stun: 0,
    hitCooldown: 0,
    respawn: 0,
    checkpoint: 0,
    finished: null,
  };
}

/**
 * One heat. Deterministic fixed-step: obstacles are pure functions of course
 * time, runners are AABBs against solids and circles against each other and
 * the spinners. The camera is part of the sim so off-screen catch-up is fair
 * and reproducible.
 */
export class World {
  readonly course: CourseData;
  readonly runners: [Runner, Runner];
  readonly crumbles: Crumble[];
  readonly sliders: Mover[];
  readonly thumpers: Mover[];
  /** Seconds since the heat was created; the race starts at COUNTDOWN. */
  time = 0;
  camX = 0;
  winner: Slot | null = null;
  over = false;
  private events: WorldEvent[] = [];
  private firstFinish: number | null = null;
  private bumpReady = 0;

  constructor(course: CourseData) {
    this.course = course;
    const start = course.checkpoints[0];
    this.runners = [createRunner(0, start), createRunner(1, start)];
    this.crumbles = course.crumbles.map((rect) => ({ rect, state: "solid", timer: 0, fall: 0 }));
    this.sliders = course.sliders.map((s) => ({ rect: sliderRect(s, 0), delta: vec() }));
    this.thumpers = course.thumpers.map((t) => ({ rect: thumperRect(t, 0), delta: vec() }));
  }

  get racing() {
    return this.time >= COUNTDOWN && !this.over;
  }

  /** Course time since GO (negative during the countdown). */
  get raceTime() {
    return this.time - COUNTDOWN;
  }

  step(inputs: readonly [RunnerInput, RunnerInput]): WorldEvent[] {
    this.events = [];
    const wasRacing = this.racing;
    this.time += STEP;
    if (!wasRacing && this.racing && this.time - STEP < COUNTDOWN) this.emit({ type: "go" });
    for (const r of this.runners) {
      r.prev.x = r.pos.x;
      r.prev.y = r.pos.y;
    }

    this.updateObstacles();
    for (const r of this.runners) {
      if (r.respawn > 0) this.tickRespawn(r);
      else this.control(r, this.racing && r.finished === null ? inputs[r.slot] : IDLE_INPUT);
    }
    this.pushFromMovers();
    for (const r of this.runners) if (r.respawn <= 0) this.move(r);
    for (const r of this.runners) if (r.respawn <= 0) this.hazards(r);
    this.bump();
    this.progress();
    this.updateCamera();
    return this.events;
  }

  /** Spinner bar endpoints at the current time. */
  spinnerBar(i: number): [Vec, Vec] {
    const s = this.course.spinners[i];
    const a = s.phase + s.speed * this.time;
    const dx = Math.cos(a) * s.arm;
    const dy = Math.sin(a) * s.arm;
    return [vec(s.x - dx, s.y - dy), vec(s.x + dx, s.y + dy)];
  }

  /** 0..1 progress along the course, for the HUD track. */
  progressOf(r: Runner) {
    return clamp(r.pos.x / this.course.finish, 0, 1);
  }

  leader(): Runner {
    const [a, b] = this.runners;
    if (a.finished !== null || b.finished !== null) {
      if (a.finished === null) return b;
      if (b.finished === null) return a;
      return a.finished <= b.finished ? a : b;
    }
    return a.pos.x >= b.pos.x ? a : b;
  }

  // ─── Phases ─────────────────────────────────────────────────────────────────

  private emit(e: WorldEvent) {
    this.events.push(e);
  }

  private updateObstacles() {
    this.course.sliders.forEach((s, i) => {
      const next = sliderRect(s, this.time);
      const m = this.sliders[i];
      m.delta = vec(next.x - m.rect.x, next.y - m.rect.y);
      m.rect = next;
    });
    this.course.thumpers.forEach((t, i) => {
      const next = thumperRect(t, this.time);
      const m = this.thumpers[i];
      m.delta = vec(next.x - m.rect.x, next.y - m.rect.y);
      m.rect = next;
    });
    this.crumbles.forEach((c, index) => {
      if (c.state === "shaking") {
        c.timer -= STEP;
        if (c.timer <= 0) {
          c.state = "falling";
          c.timer = CRUMBLE.respawn;
          this.emit({ type: "crumble", index });
          for (const r of this.runners) if (r.support?.kind === "crumble" && r.support.index === index) r.support = null;
        }
      } else if (c.state === "falling") {
        c.fall += STEP * (200 + c.fall * 6);
        c.timer -= STEP;
        if (c.timer <= 0 && !this.runners.some((r) => overlaps(r.pos, c.rect))) {
          c.state = "solid";
          c.fall = 0;
        }
      }
    });
  }

  private control(r: Runner, input: RunnerInput) {
    const dt = STEP;
    r.hitCooldown = Math.max(0, r.hitCooldown - dt);
    const busy = r.stun > 0 || r.flop > 0;
    r.stun = Math.max(0, r.stun - dt);
    r.flop = Math.max(0, r.flop - dt);
    const x = busy || r.dive > 0 ? 0 : Math.abs(input.x) > 0.2 ? input.x : 0;
    if (x !== 0) r.facing = x > 0 ? 1 : -1;

    if (r.dive > 0) r.dive = Math.max(0, r.dive - dt);
    else if (r.grounded) r.vel.x = clampSpeed(approachTo(r.vel.x, x * MOVE.run, (busy ? 1400 : MOVE.groundAccel) * dt));
    else if (x !== 0) {
      const carrying = Math.sign(r.vel.x) === Math.sign(x) && Math.abs(r.vel.x) > MOVE.run;
      if (!carrying) r.vel.x = approachTo(r.vel.x, x * MOVE.run, MOVE.airAccel * dt);
    } else r.vel.x = approachTo(r.vel.x, 0, MOVE.airDrag * dt);
    r.vel.y = Math.min(r.vel.y + MOVE.gravity * dt, MOVE.maxFall);

    r.coyote = r.grounded ? MOVE.coyote : r.coyote - dt;
    r.jumpBuffer = input.jumpPressed ? MOVE.buffer : r.jumpBuffer - dt;
    r.sinceJump += dt;
    if (!busy && r.dive <= 0 && r.jumpBuffer > 0 && r.coyote > 0) {
      r.vel.y = -MOVE.jumpVelocity;
      const s = r.support;
      if (s?.kind === "slider" || s?.kind === "thumper") r.vel.y += Math.min(0, this.moverOf(s).delta.y / dt);
      r.grounded = false;
      r.support = null;
      r.coyote = 0;
      r.jumpBuffer = 0;
      r.sinceJump = 0;
      r.canCutJump = true;
      this.emit({ type: "jump", slot: r.slot });
    }
    if (r.canCutJump && !input.jump && r.sinceJump > MOVE.jumpCutAfter) {
      if (r.vel.y < 0) r.vel.y *= MOVE.jumpCut;
      r.canCutJump = false;
    }
    if (r.vel.y >= 0) r.canCutJump = false;

    if (input.divePressed && !busy && r.dive <= 0 && r.canDive) {
      r.dive = DIVE.time;
      r.canDive = false;
      r.vel.x = r.facing * Math.max(DIVE.speed, Math.abs(r.vel.x));
      r.vel.y = r.grounded ? -DIVE.lift : Math.min(r.vel.y, -DIVE.lift * 0.7);
      r.grounded = false;
      r.support = null;
      r.coyote = 0;
      r.canCutJump = false;
      this.emit({ type: "dive", slot: r.slot });
    }
  }

  /** Moving blocks shove runners they run into; thumpers knock you flat. */
  private pushFromMovers() {
    const check = (list: Mover[], kind: "slider" | "thumper") =>
      list.forEach((m, index) => {
        for (const r of this.runners) {
          if (r.respawn > 0 || !overlaps(r.pos, m.rect)) continue;
          const riding = r.support?.kind === kind && r.support.index === index;
          if (riding) continue;
          const rect = m.rect;
          // Resolve along the smallest overlap.
          const left = r.pos.x + RUNNER.r - rect.x;
          const right = rect.x + rect.w - (r.pos.x - RUNNER.r);
          const up = r.pos.y + RUNNER.r - rect.y;
          const down = rect.y + rect.h - (r.pos.y - RUNNER.r);
          const min = Math.min(left, right, up, down);
          if (min === up) {
            r.pos.y = rect.y - RUNNER.r;
            r.vel.y = Math.min(r.vel.y, m.delta.y / STEP);
            r.grounded = true;
            r.support = { kind, index };
            continue;
          }
          if (min === down) r.pos.y = rect.y + rect.h + RUNNER.r;
          else r.pos.x = min === left ? rect.x - RUNNER.r : rect.x + rect.w + RUNNER.r;
          if (kind === "thumper" && m.delta.y > 0 && min === down) {
            // Squashed from above: pop out backwards, dazed.
            r.pos.x = rect.x - RUNNER.r - 2;
            r.pos.y = Math.min(r.pos.y, rect.y + rect.h - RUNNER.r);
            this.knock(r, vec(-HIT.thumper * 0.8, -HIT.thumper * 0.5));
          }
        }
      });
    check(this.sliders, "slider");
    check(this.thumpers, "thumper");
  }

  private move(r: Runner) {
    const dt = STEP;
    const s = r.support;
    if (s && s.kind !== "solid" && s.kind !== "crumble") {
      const d = this.moverOf(s).delta;
      r.pos.x += d.x;
      r.pos.y += d.y;
    }

    const wasGrounded = r.grounded;
    const fallSpeed = r.vel.y;
    r.grounded = false;
    r.support = null;

    r.pos.x += r.vel.x * dt;
    this.forEachBlock((rect) => {
      if (!overlaps(r.pos, rect)) return;
      // A shallow vertical overlap is a floor/ceiling contact for the y pass, not a wall.
      if (Math.min(penUp(r.pos, rect), penDown(r.pos, rect)) < SKIN) return;
      const left = r.pos.x + RUNNER.r - rect.x;
      const right = rect.x + rect.w - (r.pos.x - RUNNER.r);
      r.pos.x = left < right ? rect.x - RUNNER.r : rect.x + rect.w + RUNNER.r;
      if (Math.sign(r.vel.x) === (left < right ? 1 : -1)) r.vel.x = 0;
    });
    if (r.pos.x < RUNNER.r) {
      r.pos.x = RUNNER.r;
      r.vel.x = 0;
    }

    r.pos.y += r.vel.y * dt;
    this.forEachBlock((rect, support) => {
      if (!overlaps(r.pos, rect)) return;
      if (penUp(r.pos, rect) <= penDown(r.pos, rect)) {
        r.pos.y = rect.y - RUNNER.r;
        r.grounded = true;
        r.support = support;
        r.vel.y = Math.min(r.vel.y, 0);
      } else {
        r.pos.y = rect.y + rect.h + RUNNER.r;
        r.vel.y = Math.max(0, r.vel.y);
      }
    });

    if (r.grounded && !wasGrounded) {
      r.canDive = true;
      if (r.dive > 0) {
        r.dive = 0;
        r.flop = DIVE.flop;
        r.vel.x *= 0.45;
        this.emit({ type: "flop", slot: r.slot });
      }
      if (fallSpeed > 250) this.emit({ type: "land", slot: r.slot, impact: fallSpeed });
    }
    // (Set inside the callbacks above; TS can't see that.)
    const landedOn = r.support as Support | null;
    if (r.grounded && landedOn?.kind === "crumble") {
      const c = this.crumbles[landedOn.index];
      if (c.state === "solid") {
        c.state = "shaking";
        c.timer = CRUMBLE.delay;
      }
    }
  }

  private hazards(r: Runner) {
    // Pads: land on one and get flung skyward.
    if (r.grounded) {
      for (const p of this.course.pads) {
        if (Math.abs(r.pos.y + RUNNER.r - p.y) < 2 && r.pos.x > p.x - 6 && r.pos.x < p.x + p.w + 6) {
          r.vel.y = -BOUNCE;
          r.grounded = false;
          r.support = null;
          r.canDive = true;
          this.emit({ type: "bounce", slot: r.slot, x: r.pos.x, y: p.y });
          break;
        }
      }
    }
    // Spinners: circle vs. rotating bar.
    this.course.spinners.forEach((s, i) => {
      const [a, b] = this.spinnerBar(i);
      const c = closestOnSegment(r.pos, a, b);
      const dx = r.pos.x - c.x;
      const dy = r.pos.y - c.y;
      const d = Math.hypot(dx, dy);
      const reach = RUNNER.r + 8;
      if (d >= reach || d === 0) return;
      const nx = dx / d;
      const ny = dy / d;
      r.pos.x = c.x + nx * reach;
      r.pos.y = c.y + ny * reach;
      if (r.hitCooldown > 0) return;
      // The bar's own velocity at the contact point does most of the throwing.
      const bx = -s.speed * (c.y - s.y);
      const by = s.speed * (c.x - s.x);
      this.knock(r, vec(nx * HIT.spinner * 0.55 + bx * 0.9, ny * HIT.spinner * 0.55 + by * 0.9 - 260));
      this.emit({ type: "whack", slot: r.slot, x: c.x, y: c.y });
    });
    if (r.pos.y > FALL_Y) {
      r.respawn = RESPAWN_TIME;
      this.emit({ type: "fall", slot: r.slot });
    }
  }

  private knock(r: Runner, v: Vec) {
    r.vel.x = v.x;
    r.vel.y = v.y;
    r.stun = HIT.stun;
    r.dive = 0;
    r.grounded = false;
    r.support = null;
    r.hitCooldown = 0.3;
  }

  /** Runners are circles to each other: shoulder-bump, or get dived into. */
  private bump() {
    const [a, b] = this.runners;
    if (a.respawn > 0 || b.respawn > 0) return;
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const d = Math.hypot(dx, dy);
    const min = RUNNER.r * 2;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const push = (min - d) / 2;
    a.pos.x -= nx * push;
    a.pos.y -= ny * push;
    b.pos.x += nx * push;
    b.pos.y += ny * push;
    const closing = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * ny;
    if (closing < 120 || this.time < this.bumpReady) return;
    this.bumpReady = this.time + 0.2;
    const diver = a.dive > 0 && b.dive <= 0 ? a : b.dive > 0 && a.dive <= 0 ? b : null;
    if (diver) {
      const victim = this.runners[other(diver.slot)];
      const dir = victim === b ? 1 : -1;
      this.knock(victim, vec(nx * dir * HIT.dived, -HIT.dived * 0.45));
      diver.vel.x *= 0.4;
      this.emit({ type: "bump", x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2, hard: true, victim: victim.slot });
      return;
    }
    const k = Math.min(HIT.bump, closing * 0.9);
    a.vel.x -= nx * k;
    a.vel.y -= ny * k * 0.5;
    b.vel.x += nx * k;
    b.vel.y += ny * k * 0.5;
    this.emit({ type: "bump", x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2, hard: false, victim: null });
  }

  private progress() {
    const cps = this.course.checkpoints;
    for (const r of this.runners) {
      if (r.respawn > 0) continue;
      for (let i = r.checkpoint + 1; i < cps.length; i++) {
        if (r.pos.x >= cps[i].x && r.grounded) {
          r.checkpoint = i;
          this.emit({ type: "checkpoint", slot: r.slot, index: i });
        }
      }
      if (r.finished === null && this.racing && r.pos.x >= this.course.finish) {
        r.finished = this.raceTime;
        const place = this.winner === null ? 1 : 2;
        if (this.winner === null) {
          this.winner = r.slot;
          this.firstFinish = this.time;
        }
        this.emit({ type: "finish", slot: r.slot, place });
      }
    }
    const allIn = this.runners.every((r) => r.finished !== null);
    if (!this.over && (allIn || (this.firstFinish !== null && this.time - this.firstFinish > FINISH_GRACE))) {
      this.over = true;
      this.emit({ type: "over" });
    }
  }

  /**
   * Shared camera: frame both, favour the leader. If the trailer drops off the
   * left edge they're carried forward to the nearest checkpoint on screen.
   */
  private updateCamera() {
    const [a, b] = this.runners;
    const lead = this.leader();
    const trail = lead === a ? b : a;
    const max = Math.max(0, this.course.length - VIEW_W);
    // A runner mid-respawn doesn't pull the camera back toward where they fell.
    const framed = this.runners.filter((r) => r.respawn <= 0);
    const mid = framed.length ? framed.reduce((s, r) => s + r.pos.x, 0) / framed.length : this.camX + VIEW_W / 2;
    let target = mid - VIEW_W / 2;
    target = Math.max(target, lead.pos.x - VIEW_W * 0.72);
    target = clamp(target, 0, max);
    this.camX += (target - this.camX) * Math.min(1, STEP * 4);

    if (trail.respawn <= 0 && trail.finished === null && trail.pos.x < this.camX - RUNNER.r * 3) {
      trail.respawn = RESPAWN_TIME;
      trail.checkpoint = Math.max(trail.checkpoint, this.checkpointOnScreen(lead));
      this.emit({ type: "fall", slot: trail.slot });
    }
  }

  /** Furthest checkpoint inside the camera's comfortable zone, else the leader's own. */
  private checkpointOnScreen(lead: Runner): number {
    let best = -1;
    this.course.checkpoints.forEach((c, i) => {
      if (c.x >= this.camX + 60 && c.x <= Math.min(this.camX + VIEW_W * 0.7, lead.pos.x - 40)) best = i;
    });
    return best >= 0 ? best : lead.checkpoint;
  }

  private tickRespawn(r: Runner) {
    r.respawn -= STEP;
    if (r.respawn > 0) return;
    // Fell while the camera moved on: come back where the race is, not off-screen.
    if (this.course.checkpoints[r.checkpoint].x < this.camX + 60) r.checkpoint = Math.max(r.checkpoint, this.checkpointOnScreen(this.leader()));
    const cp = this.course.checkpoints[r.checkpoint];
    r.respawn = 0;
    r.pos = vec(cp.x + (r.slot === 0 ? -20 : 20), cp.y - RUNNER.r - 40);
    r.prev = copy(r.pos);
    r.vel = vec();
    r.dive = 0;
    r.stun = 0;
    r.flop = 0;
    r.grounded = false;
    r.support = null;
    this.emit({ type: "respawn", slot: r.slot });
  }

  private moverOf(s: Support): Mover {
    return s.kind === "slider" ? this.sliders[s.index] : this.thumpers[s.index];
  }

  private forEachBlock(fn: (r: Rect, support: Support) => void) {
    this.course.solids.forEach((rect, index) => fn(rect, { kind: "solid", index }));
    this.crumbles.forEach((c, index) => {
      if (c.state !== "falling") fn(c.rect, { kind: "crumble", index });
    });
    this.sliders.forEach((m, index) => fn(m.rect, { kind: "slider", index }));
    this.thumpers.forEach((m, index) => fn(m.rect, { kind: "thumper", index }));
  }
}

// ─── Kinematics ───────────────────────────────────────────────────────────────

export function sliderRect(s: SliderData, time: number): Rect {
  const k = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (time / s.period + s.phase));
  return { x: s.x + s.dx * k, y: s.y + s.dy * k, w: s.w, h: s.h };
}

/** Up (wait) → slam → hold → rise, as a fraction of the drop. */
export function thumperDrop(t: ThumperData, time: number): number {
  const p = (((time / t.period + t.phase) % 1) + 1) % 1;
  if (p < 0.45) return 0;
  if (p < 0.52) return ((p - 0.45) / 0.07) ** 2;
  if (p < 0.75) return 1;
  const k = (p - 0.75) / 0.25;
  return 1 - k * k * (3 - 2 * k);
}

export function thumperRect(t: ThumperData, time: number): Rect {
  return { x: t.x, y: t.y + t.drop * thumperDrop(t, time), w: t.w, h: t.h };
}

/** Deeper than one step of max fall: anything shallower is a floor or ceiling touch. */
const SKIN = 14;
const penUp = (p: Vec, r: Rect) => p.y + RUNNER.r - r.y;
const penDown = (p: Vec, r: Rect) => r.y + r.h - (p.y - RUNNER.r);

function overlaps(p: Vec, r: Rect) {
  return p.x - RUNNER.r < r.x + r.w && p.x + RUNNER.r > r.x && p.y - RUNNER.r < r.y + r.h && p.y + RUNNER.r > r.y;
}

function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  return vec(a.x + abx * t, a.y + aby * t);
}

function approachTo(v: number, target: number, delta: number) {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

/** Ground speed never exceeds a dive's, so landing a dive can't be chained into a sprint. */
function clampSpeed(v: number) {
  return clamp(v, -DIVE.speed, DIVE.speed);
}
