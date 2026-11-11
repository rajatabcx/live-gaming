import { STEP } from "../sim/constants";
import type { LevelData } from "../sim/level";
import { World, type Frog, type FrogInput } from "../sim/world";

/** Held buttons/stick for one step; edges are derived like the real input path. */
export interface Held {
  x?: number;
  y?: number;
  a?: boolean;
  b?: boolean;
}

export interface Phase {
  name: string;
  input: (w: World) => [Held, Held];
  until: (w: World) => boolean;
  /** Seconds before the phase counts as failed. */
  max?: number;
}

export type Result = { ok: true; seconds: number } | { ok: false; failed: string; frogs: string };

export function play(level: LevelData, phases: Phase[]): Result {
  const w = new World(level);
  const prev = [
    { a: false, b: false },
    { a: false, b: false },
  ];
  for (const phase of phases) {
    let t = 0;
    while (!phase.until(w)) {
      if (t > (phase.max ?? 8)) return { ok: false, failed: phase.name, frogs: w.frogs.map(describe).join(" | ") };
      const held = phase.input(w);
      const inputs = held.map((h, i): FrogInput => {
        const a = !!h.a;
        const b = !!h.b;
        const input = { x: h.x ?? 0, y: h.y ?? 0, jump: a, tongue: b, jumpPressed: a && !prev[i].a, tonguePressed: b && !prev[i].b };
        prev[i] = { a, b };
        return input;
      }) as [FrogInput, FrogInput];
      w.step(inputs);
      t += STEP;
    }
  }
  return { ok: true, seconds: w.time };
}

const describe = (f: Frog) => `${f.pos.x.toFixed(0)},${f.pos.y.toFixed(0)} ${f.grounded ? "grounded" : "air"} ${f.tongue.phase}`;

// ─── Building blocks ──────────────────────────────────────────────────────────

export const frog = (w: World, i: 0 | 1) => w.frogs[i];
export const idle = (): [Held, Held] => [{}, {}];
export const walkTo = (f: Frog, x: number, tol = 3): Held => ({ x: f.pos.x < x - tol ? 1 : f.pos.x > x + tol ? -1 : 0 });
export const settled = (f: Frog) => f.grounded && Math.abs(f.vel.x) < 1;

export function wait(name: string, seconds: number): Phase {
  let start = -1;
  return {
    name,
    input: idle,
    until: (w) => {
      if (start < 0) start = w.time;
      return w.time - start > seconds;
    },
  };
}

/** Walk off `edgeX`, grab the nearest lantern, ride it, let go past `releaseX`. */
export function swing(i: 0 | 1, edgeX: number, releaseX: number) {
  let stage = 0;
  return (w: World): Held => {
    const f = frog(w, i);
    if (stage === 0) {
      if (f.pos.x < edgeX) return { x: 1 };
      stage = 1;
    }
    if (stage === 1) {
      if (f.tongue.phase !== "attached") return { b: true };
      stage = 2;
    }
    if (stage === 2) {
      if (f.pos.x > releaseX && f.vel.x > 0) stage = 3;
      else return { x: 1, b: true };
    }
    return { x: 0.4 };
  };
}
