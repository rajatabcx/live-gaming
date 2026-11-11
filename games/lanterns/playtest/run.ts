// Headless check that every chapter can be finished by two lanterns that
// steer toward the same star (fighting the wind) and glow at hidden ones,
// and that one lantern alone can't light anything.
//   node --no-warnings --import ./scripts/ts-resolve.mjs games/lanterns/playtest/run.ts

import { CHAPTERS } from "../chapters";
import { STAR, STEP } from "../sim/constants";
import { IDLE_INPUT, World, type LanternInput } from "../sim/world";

const LIMIT = 150;

function steer(from: { x: number; y: number }, to: { x: number; y: number }, wind: { x: number; y: number }): LanternInput {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, d / 140);
  // Lean into the wind a little, like a person would.
  const x = (dx / d) * k - wind.x / 1300;
  const y = (dy / d) * k - wind.y / 1300;
  const m = Math.hypot(x, y);
  return { x: m > 1 ? x / m : x, y: m > 1 ? y / m : y, glowPressed: false };
}

let failed = false;
const world = new World(CHAPTERS[0]);
let total = 0;
for (const [i, chapter] of CHAPTERS.entries()) {
  if (i > 0) world.rise(chapter);
  const start = world.time;
  let harmonies = 0;
  let glowClock = 0;
  while (!world.complete && world.time - start < LIMIT) {
    const target = world.stars.find((s) => s.visible && !s.lit) ?? world.stars.find((s) => !s.lit);
    if (!target) break;
    glowClock += STEP;
    const near = world.lanterns.every((l) => Math.hypot(l.pos.x - target.x, l.pos.y - target.y) < 120);
    const pulse = !target.visible && near && glowClock > 0.8;
    if (pulse) glowClock = 0;
    const inputs = world.lanterns.map((l, slot) => ({
      ...steer(l.pos, { x: target.x + (slot ? 30 : -30), y: target.y }, world.windAt(l.pos)),
      glowPressed: pulse,
    })) as [LanternInput, LanternInput];
    for (const e of world.step(inputs)) if (e.type === "harmony") harmonies++;
  }
  const t = world.time - start;
  total += t;
  const ok = world.complete;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${chapter.name.padEnd(16)} ${t.toFixed(1)}s  ${world.litCount}/${world.stars.length} stars  ${harmonies} harmonies`);
}

// One lantern parked on a star for longer than kindling takes must not light it.
const solo = new World(CHAPTERS[0]);
const s = solo.stars[0];
for (let t = 0; t < STAR.kindle * 4; t += STEP) {
  const l = solo.lanterns[0];
  solo.step([steer(l.pos, s, { x: 0, y: 0 }), IDLE_INPUT]);
}
const soloOk = !s.lit;
if (!soloOk) failed = true;
console.log(`${soloOk ? "✓" : "✗"} one lantern alone can't light a star`);
console.log(`  bots: ${(total / 60).toFixed(1)} min for the whole sky`);
if (failed) process.exitCode = 1;
