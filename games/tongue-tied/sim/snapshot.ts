import { lerp, vec, type Vec } from "../../kit/math";
import type { Frog, World } from "./world";

/**
 * What a remote screen needs to draw a Tongue Tied world. Static level data
 * never travels — both sides load it by index.
 */
export interface WorldSnapshot {
  level: number;
  /** Bumps whenever the host builds a fresh World (also on a restart of the same level). */
  epoch: number;
  frogs: [Frog, Frog];
  plates: boolean[];
  movers: { t: number; pos: Vec; open: boolean }[];
  taken: boolean[];
  time: number;
  collected: number;
  goalCount: number;
  goalHold: number;
  complete: boolean;
}

export function capture(world: World, level: number, epoch: number): WorldSnapshot {
  return {
    level,
    epoch,
    frogs: world.frogs,
    plates: world.plates.map((p) => p.pressed),
    movers: world.movers.map((m) => ({ t: m.t, pos: m.pos, open: m.open })),
    taken: world.fireflies.map((f) => f.taken),
    time: world.time,
    collected: world.collected,
    goalCount: world.goalCount,
    goalHold: world.goalHold,
    complete: world.complete,
  };
}

/**
 * Pose `world` as `to`, with interpolation bases from `from`: the renderer
 * lerps prev → pos (frogs) and pos − delta → pos (movers) by its alpha.
 */
export function restore(world: World, from: WorldSnapshot, to: WorldSnapshot, t: number) {
  const same = from.epoch === to.epoch;
  world.frogs.forEach((f, i) => {
    Object.assign(f, to.frogs[i]);
    f.prev = same ? from.frogs[i].pos : to.frogs[i].pos;
  });
  world.plates.forEach((p, i) => (p.pressed = to.plates[i] ?? p.pressed));
  world.movers.forEach((m, i) => {
    const b = to.movers[i];
    if (!b) return;
    const a = same ? (from.movers[i] ?? b) : b;
    m.t = b.t;
    m.open = b.open;
    m.pos = b.pos;
    m.delta = vec(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
  });
  world.fireflies.forEach((f, i) => (f.taken = to.taken[i] ?? f.taken));
  world.time = same ? lerp(from.time, to.time, t) : to.time;
  world.collected = to.collected;
  world.goalCount = to.goalCount;
  world.goalHold = same ? lerp(from.goalHold, to.goalHold, t) : to.goalHold;
  world.complete = to.complete;
}
