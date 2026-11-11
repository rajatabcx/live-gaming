// Headless check that every course is finishable by a bot that only knows
// "go right", with no per-course scripting. Each runner replans every 0.1 s
// by cloning the world and trying a few short input plans.
//   node --no-warnings --import ./scripts/ts-resolve.mjs games/wobble-run/playtest/run.ts

import { COURSES } from "../courses";
import { COUNTDOWN, STEP, VIEW_W } from "../sim/constants";
import type { CourseData } from "../sim/course";
import { IDLE_INPUT, World, type RunnerInput, type Slot, type WorldEvent } from "../sim/world";

interface Held {
  x: number;
  jump: boolean;
  dive: boolean;
}

/** A plan is a held-input function of seconds since it started. */
type Plan = (t: number) => Held;

const run = (x = 1): Held => ({ x, jump: false, dive: false });
const PLANS: Plan[] = [
  () => run(),
  (t) => run(t < 0.35 ? 0 : 1),
  (t) => run(t < 0.8 ? 0 : 1),
  (t) => run(t < 0.3 ? -1 : t < 0.6 ? 0 : 1),
  (t) => ({ x: 1, jump: false, dive: t < 0.04 }),
];
// Run (or wait) up to an edge, then a short hop, a full jump, or a jump + dive.
for (const at of [0, 0.12, 0.25, 0.4, 0.55, 0.75]) {
  for (const wait of [false, true]) {
    const x = (t: number) => (wait && t < at ? 0 : 1);
    PLANS.push((t) => ({ x: x(t), jump: t >= at && t < at + 0.12, dive: false }));
    PLANS.push((t) => ({ x: x(t), jump: t >= at && t < at + 0.5, dive: false }));
    PLANS.push((t) => ({ x: x(t), jump: t >= at && t < at + 0.5, dive: t > at + 0.3 && t < at + 0.34 }));
  }
}

const TRACE = !!process.env.TRACE;
const HORIZON = 1.4;
/** After the plan, stand still a moment: catches plans that end mid-air over a pit. */
const SETTLE = 0.6;
const REPLAN = 12;

function clone(w: World): World {
  const { course, ...state } = w;
  return Object.assign(Object.create(World.prototype), structuredClone(state), { course }) as World;
}

class Driver {
  prev = { jump: false, dive: false };
  fork() {
    const d = new Driver();
    d.prev = { ...this.prev };
    return d;
  }
  input(h: Held): RunnerInput {
    const out = { x: h.x, jump: h.jump, jumpPressed: h.jump && !this.prev.jump, divePressed: h.dive && !this.prev.dive };
    this.prev = { jump: h.jump, dive: h.dive };
    return out;
  }
}

function score(w: World, slot: Slot, plan: Plan, driver: Driver): number {
  const sim = clone(w);
  const me = driver.fork();
  let penalty = 0;
  const steps = Math.round((HORIZON + SETTLE) / STEP);
  for (let i = 0; i < steps; i++) {
    const t = i * STEP;
    const held = t < HORIZON ? plan(t) : run(0);
    const inputs: [RunnerInput, RunnerInput] = [IDLE_INPUT, IDLE_INPUT];
    inputs[slot] = me.input(held);
    for (const e of sim.step(inputs)) {
      if ("slot" in e && e.slot !== slot) continue;
      if (e.type === "fall") penalty += 1e6;
      if (e.type === "whack") penalty += 3000;
      if (e.type === "finish") return 1e7 - i;
    }
    if (penalty >= 1e6) break;
  }
  const r = sim.runners[slot];
  return r.pos.x + r.checkpoint * 50 - penalty;
}

interface Report {
  course: string;
  finished: [number | null, number | null];
  falls: [number, number];
  whacks: [number, number];
  teleports: number;
}

function race(course: CourseData, limit = 90): Report {
  const w = new World(course);
  const drivers = [new Driver(), new Driver()];
  const active: { plan: Plan; t: number }[] = [
    { plan: PLANS[0], t: 0 },
    { plan: PLANS[0], t: 0 },
  ];
  const falls: [number, number] = [0, 0];
  const whacks: [number, number] = [0, 0];
  let teleports = 0;
  let step = 0;
  while (!w.over && w.time < limit) {
    const inputs = ([0, 1] as const).map((slot): RunnerInput => {
      const a = active[slot];
      // Runner 1 waits a beat so the two aren't glued together the whole way.
      if (w.raceTime < slot * 0.5) return drivers[slot].input(run(0));
      if (w.time >= COUNTDOWN && step % REPLAN === slot * 6) {
        // Carrying on with the current plan is a candidate too (with a tie-break
        // bonus), otherwise a "wait, then jump" plan restarts forever.
        const { plan: current, t: offset } = a;
        const carryOn: Plan = (t) => current(offset + t);
        let best = score(w, slot, carryOn, drivers[slot]) + 5;
        let chosen = carryOn;
        for (const plan of PLANS) {
          const s = score(w, slot, plan, drivers[slot]);
          if (s > best) {
            best = s;
            chosen = plan;
          }
        }
        if (chosen === carryOn) {
          a.plan = current;
        } else {
          a.plan = chosen;
          a.t = 0;
        }
      }
      const held = a.plan(a.t);
      a.t += STEP;
      return drivers[slot].input(held);
    }) as [RunnerInput, RunnerInput];
    for (const e of w.step(inputs) as WorldEvent[]) {
      if (e.type === "fall") falls[e.slot]++;
      if (TRACE && (e.type === "fall" || e.type === "whack" || e.type === "checkpoint")) {
        const r = w.runners[e.slot];
        console.log(`    ${w.raceTime.toFixed(2)}s P${e.slot + 1} ${e.type} at ${r.pos.x.toFixed(0)},${r.pos.y.toFixed(0)} cam ${w.camX.toFixed(0)} cp ${r.checkpoint}`);
      }
      if (e.type === "whack") whacks[e.slot]++;
    }
    step++;
    // No runner may move further in one step than its top speed allows (collision snaps).
    for (const r of w.runners) if (r.respawn <= 0 && Math.abs(r.pos.x - r.prev.x) > 30) teleports++;
    if (TRACE && step % 60 === 0) console.log(`      t${w.raceTime.toFixed(1)} ` + w.runners.map((r) => `${r.pos.x.toFixed(0)},${r.pos.y.toFixed(0)} v${r.vel.x.toFixed(0)},${r.vel.y.toFixed(0)} ${r.grounded ? "g" : "a"} cp${r.checkpoint} rs${r.respawn.toFixed(1)}`).join(" | "));
  }
  return { course: course.name, finished: [w.runners[0].finished, w.runners[1].finished], falls, whacks, teleports };
}

/** Wherever the camera sits, a carried-off runner must have a checkpoint to land on. */
function checkpointGaps(course: CourseData): string[] {
  const problems: string[] = [];
  const max = course.length - VIEW_W;
  for (let cam = 0; cam <= max; cam += 20) {
    const ok = course.checkpoints.some((c) => c.x >= cam + 60 && c.x <= cam + VIEW_W * 0.7);
    if (!ok) problems.push(`no checkpoint in view at camX ${cam}`);
  }
  return problems.slice(0, 3);
}

let failed = false;
for (const course of COURSES) {
  const gaps = checkpointGaps(course);
  const r = race(course);
  const t = r.finished.map((f) => (f === null ? "DNF" : `${f.toFixed(1)}s`)).join(" / ");
  // The runner-up may be timed out by FINISH_GRACE; the heat just needs a winner.
  const ok = r.finished.some((f) => f !== null) && gaps.length === 0 && r.teleports === 0;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${r.course.padEnd(14)} ${t.padEnd(14)} falls ${r.falls.join("/")}  whacks ${r.whacks.join("/")}`);
  for (const g of gaps) console.log(`    ${g}`);
  if (r.teleports) console.log(`    ${r.teleports} teleporting steps`);
}
if (failed) process.exitCode = 1;
