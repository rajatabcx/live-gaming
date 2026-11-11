import { lerp } from "../../kit/math";
import type { Boat, Lamp, World } from "./world";

/** What a remote screen needs to draw a night at sea. The chart itself never travels. */
export interface WorldSnapshot {
  night: number;
  /** Bumps whenever the host builds a fresh World. */
  epoch: number;
  boat: Boat;
  lamp: Lamp;
  bottles: boolean[];
  collected: number;
  scrapes: number;
  wrecks: number;
  time: number;
  docked: boolean;
  horn: World["horn"];
  dark: number;
}

export function capture(world: World, night: number, epoch: number): WorldSnapshot {
  const { boat, lamp, bottles, collected, scrapes, wrecks, time, docked, horn, dark } = world;
  return { night, epoch, boat, lamp, bottles, collected, scrapes, wrecks, time, docked, horn, dark };
}

/** Pose `world` as `to`; boat and lamp interpolate through the renderer's prev → current alpha. */
export function restore(world: World, from: WorldSnapshot, to: WorldSnapshot, t: number) {
  const same = from.epoch === to.epoch;
  const a = same ? from : to;
  Object.assign(world.boat, to.boat, { prev: a.boat.pos, prevHeading: a.boat.heading });
  Object.assign(world.lamp, to.lamp, { prevAngle: a.lamp.angle });
  to.bottles.forEach((b, i) => (world.bottles[i] = b));
  world.collected = to.collected;
  world.scrapes = to.scrapes;
  world.wrecks = to.wrecks;
  world.time = lerp(a.time, to.time, t);
  world.docked = to.docked;
  world.horn = to.horn;
  world.dark = to.dark;
}
