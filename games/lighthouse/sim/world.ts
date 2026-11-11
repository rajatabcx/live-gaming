import { clamp, vec, type Vec } from "../../kit/math";
import { BEAM, BOAT, CHART_H, CHART_W, PICKUP, SPOT_AFTER, STEP } from "./constants";
import type { NightData } from "./night";

export type Slot = 0 | 1;
export type Role = "keeper" | "sailor";

export interface KeeperInput {
  /** Stick: points the lamp (screen space, y down). */
  x: number;
  y: number;
  flarePressed: boolean;
}

export interface SailorInput {
  /** Stick: the way to steer; how far it's pushed is the throttle. */
  x: number;
  y: number;
  hornPressed: boolean;
}

export const IDLE_KEEPER: KeeperInput = { x: 0, y: 0, flarePressed: false };
export const IDLE_SAILOR: SailorInput = { x: 0, y: 0, hornPressed: false };

export interface Boat {
  pos: Vec;
  prev: Vec;
  vel: Vec;
  heading: number;
  prevHeading: number;
  hull: number;
  invulnerable: number;
  /** > 0 while going down after a wreck. */
  sinking: number;
  hornCooldown: number;
  /** Index of the last buoy passed (-1: the start). */
  checkpoint: number;
  /** 0..1 how hard we're pushing, for the wake. */
  throttle: number;
}

export interface Lamp {
  angle: number;
  prevAngle: number;
  /** > 0 while the flare is burning. */
  flare: number;
  flareCooldown: number;
}

export type WorldEvent =
  | { type: "scrape"; x: number; y: number; hull: number }
  | { type: "wreck"; x: number; y: number }
  | { type: "afloat" }
  | { type: "buoy"; index: number; x: number; y: number }
  | { type: "bottle"; index: number; x: number; y: number; count: number }
  | { type: "horn"; x: number; y: number }
  | { type: "flare" }
  | { type: "spotted"; x: number; y: number }
  | { type: "docked" };

const TAU = Math.PI * 2;
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const turnToward = (a: number, target: number, max: number) => {
  const d = wrap(target - a);
  return a + clamp(d, -max, max);
};

/**
 * One night at sea. Deterministic fixed-step: a boat, a lamp, rocks, tides.
 * The world knows roles, not slots — the session decides who is the keeper.
 * Neither side's fog lives here: what each player can see is a render concern,
 * computed from `isLit` and the boat's own lantern.
 */
export class World {
  readonly night: NightData;
  readonly boat: Boat;
  readonly lamp: Lamp;
  /** Which bottles are still floating. */
  readonly bottles: boolean[];
  collected = 0;
  scrapes = 0;
  wrecks = 0;
  time = 0;
  docked = false;
  /** Where and when the horn last sounded (the keeper sees the ripple). */
  horn: { x: number; y: number; at: number } | null = null;
  /** Seconds the boat has been out of the light. */
  dark = 0;
  private events: WorldEvent[] = [];

  constructor(night: NightData) {
    this.night = night;
    const { x, y, heading } = night.spawn;
    this.boat = {
      pos: vec(x, y),
      prev: vec(x, y),
      vel: vec(),
      heading,
      prevHeading: heading,
      hull: BOAT.hull,
      invulnerable: 0,
      sinking: 0,
      hornCooldown: 0,
      checkpoint: -1,
      throttle: 0,
    };
    const toSpawn = Math.atan2(y - night.lighthouse.y, x - night.lighthouse.x);
    this.lamp = { angle: toSpawn, prevAngle: toSpawn, flare: 0, flareCooldown: 0 };
    this.bottles = night.bottles.map(() => true);
  }

  /** Is this point in the lamp's light right now? */
  isLit(p: Vec, margin = 0): boolean {
    const { lighthouse } = this.night;
    const dx = p.x - lighthouse.x;
    const dy = p.y - lighthouse.y;
    const d = Math.hypot(dx, dy);
    if (d > BEAM.length + margin) return false;
    const half = this.lamp.flare > 0 ? BEAM.flareHalfAngle : BEAM.halfAngle;
    // A little angular slack for the object's own size.
    return Math.abs(wrap(Math.atan2(dy, dx) - this.lamp.angle)) <= half + Math.atan2(margin, Math.max(1, d));
  }

  get boatLit() {
    return this.isLit(this.boat.pos, BOAT.radius);
  }

  currentAt(p: Vec): Vec {
    const v = vec();
    for (const c of this.night.currents) {
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
        v.x += c.vx;
        v.y += c.vy;
      }
    }
    return v;
  }

  step(keeper: KeeperInput, sailor: SailorInput): WorldEvent[] {
    this.events = [];
    this.time += STEP;
    this.stepLamp(keeper);
    this.stepBoat(sailor);
    this.stepLight();
    return this.events;
  }

  // ─── Lamp ───────────────────────────────────────────────────────────────────

  private stepLamp(input: KeeperInput) {
    const lamp = this.lamp;
    lamp.prevAngle = lamp.angle;
    lamp.flare = Math.max(0, lamp.flare - STEP);
    lamp.flareCooldown = Math.max(0, lamp.flareCooldown - STEP);
    if (Math.hypot(input.x, input.y) > BEAM.aimDeadzone) {
      lamp.angle = wrap(turnToward(lamp.angle, Math.atan2(input.y, input.x), BEAM.turnRate * STEP));
    }
    if (input.flarePressed && lamp.flareCooldown <= 0 && !this.docked) {
      lamp.flare = BEAM.flareTime;
      lamp.flareCooldown = BEAM.flareCooldown;
      this.emit({ type: "flare" });
    }
  }

  // ─── Boat ───────────────────────────────────────────────────────────────────

  private stepBoat(input: SailorInput) {
    const b = this.boat;
    b.prev.x = b.pos.x;
    b.prev.y = b.pos.y;
    b.prevHeading = b.heading;
    b.invulnerable = Math.max(0, b.invulnerable - STEP);
    b.hornCooldown = Math.max(0, b.hornCooldown - STEP);

    if (b.sinking > 0) {
      b.sinking -= STEP;
      b.vel.x *= 1 - 3 * STEP;
      b.vel.y *= 1 - 3 * STEP;
      if (b.sinking <= 0) this.refloat();
      return;
    }

    if (input.hornPressed && b.hornCooldown <= 0) {
      b.hornCooldown = BOAT.hornCooldown;
      this.horn = { x: b.pos.x, y: b.pos.y, at: this.time };
      this.emit({ type: "horn", x: b.pos.x, y: b.pos.y });
    }

    // Steering: the stick says where to go; the boat turns toward it and pushes forward.
    const push = this.docked ? 0 : Math.min(1, Math.hypot(input.x, input.y));
    b.throttle = push > 0.2 ? push : 0;
    if (b.throttle > 0) b.heading = wrap(turnToward(b.heading, Math.atan2(input.y, input.x), BOAT.turnRate * STEP * (0.4 + 0.6 * push)));

    const fx = Math.cos(b.heading);
    const fy = Math.sin(b.heading);
    let along = b.vel.x * fx + b.vel.y * fy;
    let side = -b.vel.x * fy + b.vel.y * fx;
    along += BOAT.accel * b.throttle * STEP;
    if (b.throttle === 0) along *= 1 - BOAT.drag * STEP;
    side *= 1 - BOAT.keel * STEP;
    along = clamp(along, -BOAT.maxSpeed * 0.3, BOAT.maxSpeed);
    b.vel.x = along * fx - side * fy;
    b.vel.y = along * fy + side * fx;

    const tide = this.currentAt(b.pos);
    b.pos.x += (b.vel.x + tide.x) * STEP;
    b.pos.y += (b.vel.y + tide.y) * STEP;

    this.collideRocks();
    this.collideEdges();
    if (b.sinking > 0) return;
    this.collect();
  }

  private collideRocks() {
    const b = this.boat;
    for (const rock of this.night.rocks) {
      const dx = b.pos.x - rock.x;
      const dy = b.pos.y - rock.y;
      const d = Math.hypot(dx, dy);
      const min = rock.r + BOAT.radius;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      b.pos.x = rock.x + nx * min;
      b.pos.y = rock.y + ny * min;
      const vn = b.vel.x * nx + b.vel.y * ny;
      if (vn >= 0) continue;
      b.vel.x -= 1.5 * vn * nx;
      b.vel.y -= 1.5 * vn * ny;
      if (-vn < BOAT.scrapeSpeed || b.invulnerable > 0) continue;
      b.hull--;
      b.invulnerable = BOAT.invulnerable;
      this.scrapes++;
      const at = { x: rock.x + nx * rock.r, y: rock.y + ny * rock.r };
      if (b.hull <= 0) {
        b.sinking = BOAT.sink;
        this.wrecks++;
        this.emit({ type: "wreck", ...at });
      } else {
        this.emit({ type: "scrape", ...at, hull: b.hull });
      }
    }
  }

  private collideEdges() {
    const b = this.boat;
    const r = BOAT.radius;
    if (b.pos.x < r || b.pos.x > CHART_W - r) {
      b.pos.x = clamp(b.pos.x, r, CHART_W - r);
      b.vel.x *= -0.4;
    }
    if (b.pos.y < r || b.pos.y > CHART_H - r) {
      b.pos.y = clamp(b.pos.y, r, CHART_H - r);
      b.vel.y *= -0.4;
    }
  }

  private collect() {
    const b = this.boat;
    const { buoys, bottles, harbor } = this.night;
    for (let i = b.checkpoint + 1; i < buoys.length; i++) {
      if (Math.hypot(buoys[i].x - b.pos.x, buoys[i].y - b.pos.y) < PICKUP.buoy) {
        b.checkpoint = i;
        this.emit({ type: "buoy", index: i, ...buoys[i] });
      }
    }
    bottles.forEach((p, i) => {
      if (!this.bottles[i] || Math.hypot(p.x - b.pos.x, p.y - b.pos.y) > PICKUP.bottle + BOAT.radius) return;
      this.bottles[i] = false;
      this.collected++;
      this.emit({ type: "bottle", index: i, ...p, count: this.collected });
    });
    if (!this.docked && Math.hypot(harbor.x - b.pos.x, harbor.y - b.pos.y) < harbor.r) {
      this.docked = true;
      this.emit({ type: "docked" });
    }
  }

  /** Back at the last buoy (or the start), facing onward. */
  private refloat() {
    const b = this.boat;
    const { spawn, buoys, route, harbor } = this.night;
    const at = b.checkpoint >= 0 ? buoys[b.checkpoint] : spawn;
    const next = b.checkpoint + 1 < buoys.length ? buoys[b.checkpoint + 1] : (route.at(-1) ?? harbor);
    b.pos = vec(at.x, at.y);
    b.prev = vec(at.x, at.y);
    b.vel = vec();
    b.heading = b.prevHeading = Math.atan2(next.y - at.y, next.x - at.x);
    b.hull = BOAT.hull;
    b.invulnerable = BOAT.invulnerable;
    this.emit({ type: "afloat" });
  }

  // ─── Light ──────────────────────────────────────────────────────────────────

  private stepLight() {
    if (this.boatLit) {
      if (this.dark >= SPOT_AFTER && this.boat.sinking <= 0) this.emit({ type: "spotted", x: this.boat.pos.x, y: this.boat.pos.y });
      this.dark = 0;
    } else {
      this.dark += STEP;
    }
  }

  private emit(e: WorldEvent) {
    this.events.push(e);
  }
}

/** Night n: who keeps the light. Roles swap every night so both get both. */
export const keeperSlot = (night: number): Slot => (night % 2 === 0 ? 0 : 1);
export const roleOf = (slot: Slot, night: number): Role => (slot === keeperSlot(night) ? "keeper" : "sailor");
