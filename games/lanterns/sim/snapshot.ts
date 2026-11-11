import { lerp } from "../../kit/math";
import type { Lantern, Star, World } from "./world";

/**
 * What a remote screen needs to draw a Lanterns sky. Chapter data never
 * travels — both sides load it by index.
 */
export interface WorldSnapshot {
  /** Index of `world.chapter` (already the next one while rising). */
  chapter: number;
  /** Bumps whenever the host builds a fresh World (a new night). */
  epoch: number;
  /** The sky is scrolling from the previous chapter to this one. */
  rising: boolean;
  lanterns: [Lantern, Lantern];
  stars: Star[];
  time: number;
  complete: boolean;
  quiet: boolean;
}

export function capture(world: World, chapter: number, epoch: number, rising: boolean): WorldSnapshot {
  return {
    chapter,
    epoch,
    rising,
    lanterns: world.lanterns,
    stars: world.stars,
    time: world.time,
    complete: world.complete,
    quiet: world.quiet,
  };
}

/** Pose `world` as `to`; lanterns interpolate through the renderer's prev → pos alpha. */
export function restore(world: World, from: WorldSnapshot, to: WorldSnapshot, t: number) {
  const same = from.epoch === to.epoch;
  world.lanterns.forEach((l, i) => {
    Object.assign(l, to.lanterns[i]);
    l.prev = same ? from.lanterns[i].pos : to.lanterns[i].pos;
  });
  if (world.stars.length === to.stars.length) world.stars.forEach((s, i) => Object.assign(s, to.stars[i]));
  world.time = same ? lerp(from.time, to.time, t) : to.time;
  world.complete = to.complete;
  world.quiet = to.quiet;
}
