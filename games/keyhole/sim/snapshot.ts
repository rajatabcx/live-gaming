import { lerp } from "../../kit/math";
import type { Player, SpotState, World } from "./world";

/** What a remote screen needs to draw both rooms. The chapter itself never travels. */
export interface WorldSnapshot {
  chapter: number;
  /** Bumps whenever the host builds a fresh World. */
  epoch: number;
  players: [Player, Player];
  spots: [Record<string, SpotState>, Record<string, SpotState>];
  time: number;
  unlocked: boolean;
  opened: boolean;
  eyes: number;
}

export function capture(world: World, chapter: number, epoch: number): WorldSnapshot {
  const { players, spots, time, unlocked, opened, eyes } = world;
  return { chapter, epoch, players, spots, time, unlocked, opened, eyes };
}

/** Pose `world` as `to`; walkers interpolate through the renderer's prev → current alpha. */
export function restore(world: World, from: WorldSnapshot, to: WorldSnapshot, t: number) {
  const a = from.epoch === to.epoch ? from : to;
  to.players.forEach((p, i) => Object.assign(world.players[i], p, { prevX: a.players[i].x }));
  to.spots.forEach((room, i) => {
    for (const id in room) Object.assign(world.spots[i][id] ?? {}, room[id]);
  });
  world.time = lerp(a.time, to.time, t);
  world.unlocked = to.unlocked;
  world.opened = to.opened;
  world.eyes = to.eyes;
}
