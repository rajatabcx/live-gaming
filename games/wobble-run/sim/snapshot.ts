import { lerp, type Rect } from "../../kit/math";
import type { CrumbleState, Runner, Slot, World } from "./world";

/**
 * What a remote screen needs to draw a Wobble Run heat. Course geometry never
 * travels — both sides load it by heat index.
 */
export interface WorldSnapshot {
  heat: number;
  /** Bumps whenever the host builds a fresh World (also on a restart of the same heat). */
  epoch: number;
  runners: [Runner, Runner];
  crumbles: { state: CrumbleState; timer: number; fall: number }[];
  sliders: Rect[];
  thumpers: Rect[];
  time: number;
  camX: number;
  winner: Slot | null;
  over: boolean;
}

export function capture(world: World, heat: number, epoch: number): WorldSnapshot {
  return {
    heat,
    epoch,
    runners: world.runners,
    crumbles: world.crumbles.map(({ state, timer, fall }) => ({ state, timer, fall })),
    sliders: world.sliders.map((m) => m.rect),
    thumpers: world.thumpers.map((m) => m.rect),
    time: world.time,
    camX: world.camX,
    winner: world.winner,
    over: world.over,
  };
}

const lerpRect = (a: Rect | undefined, b: Rect, t: number): Rect =>
  a ? { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: b.w, h: b.h } : b;

/**
 * Pose `world` as `to`. Runners and camera interpolate through the renderer's
 * prev → current alpha; moving platforms (which it draws as-is) are lerped here.
 */
export function restore(world: World, from: WorldSnapshot, to: WorldSnapshot, t: number) {
  const same = from.epoch === to.epoch;
  const a = same ? from : to;
  world.runners.forEach((r, i) => {
    Object.assign(r, to.runners[i]);
    r.prev = a.runners[i].pos;
  });
  world.crumbles.forEach((c, i) => Object.assign(c, to.crumbles[i]));
  world.sliders.forEach((m, i) => to.sliders[i] && (m.rect = lerpRect(a.sliders[i], to.sliders[i], t)));
  world.thumpers.forEach((m, i) => to.thumpers[i] && (m.rect = lerpRect(a.thumpers[i], to.thumpers[i], t)));
  world.time = lerp(a.time, to.time, t);
  world.camX = to.camX;
  world.prevCamX = a.camX;
  world.winner = to.winner;
  world.over = to.over;
}
