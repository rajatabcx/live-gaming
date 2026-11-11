// Scripted solutions for every level, run headless against the real sim.
// pnpm playtest — fails if a tuning or level change makes any level unsolvable.
import { LEVELS } from "../levels";
import { frog, idle, play, settled, swing, wait, walkTo, type Held, type Phase } from "./harness";
import type { World } from "../sim/world";

const both = (w: World, fn: (f: World["frogs"][number]) => Held) => w.frogs.map(fn) as [Held, Held];
const toPad = (x: number): Phase => ({
  name: "both to the moon pad",
  input: (w) => both(w, (f) => walkTo(f, x + f.slot * 30, 12)),
  until: (w) => w.complete,
});

const solutions: Phase[][] = [
  // First Light: stack, jump up, reel the other up.
  [
    {
      name: "walk to the wall",
      input: (w) => both(w, (f) => ({ ...walkTo(f, f.slot === 0 ? 1027 : 940), a: f.pos.x > 340 && f.pos.x < 600 })),
      until: (w) => settled(frog(w, 0)) && frog(w, 0).pos.x > 1020 && settled(frog(w, 1)) && frog(w, 1).pos.x > 935,
    },
    { name: "hop onto partner", input: (w) => [{}, { a: true, x: frog(w, 1).pos.x < frog(w, 0).pos.x - 3 ? 1 : 0 }], until: (w) => frog(w, 1).support?.kind === "frog" },
    wait("settle", 0.15),
    { name: "jump to the ledge", input: () => [{}, { a: true, x: 1 }], until: (w) => frog(w, 1).grounded && frog(w, 1).pos.y < 570 },
    { name: "back to the lip", input: (w) => [{}, walkTo(frog(w, 1), 1068)], until: (w) => settled(frog(w, 1)) && frog(w, 1).pos.x < 1072 },
    { name: "grab partner", input: () => [{}, { b: true }], until: (w) => frog(w, 1).tongue.phase === "attached", max: 1 },
    { name: "reel them up", input: () => [{}, { b: true, y: -1 }], until: (w) => frog(w, 0).grounded && frog(w, 0).pos.y < 570, max: 4 },
    wait("let go", 0.1),
    toPad(1440),
  ],
  // Lantern Line: one holds the flower, the other swings; then swap.
  (() => {
    const lanterns = (i: 0 | 1) => {
      let stage = 0;
      return (w: World): Held => {
        const f = frog(w, i);
        const held = f.tongue.phase === "attached" && f.tongue.target.kind === "anchor" ? f.tongue.target.index : -1;
        if (stage === 0) {
          if (f.pos.x < 440) return { x: 1 };
          stage = 1;
        }
        if (stage === 1) {
          if (held !== 0) return { b: true };
          stage = 2;
        }
        if (stage === 2) {
          if (!(f.pos.x > 700 && f.vel.x > 0 && f.pos.y < 600)) return { x: 1, b: true };
          stage = 3;
          return { x: 1 };
        }
        if (stage === 3) {
          if (held !== 1) return { x: 0.5, y: -0.85, b: true };
          stage = 4;
        }
        if (stage === 4) {
          if (!(f.pos.x > 990 && f.vel.x > 0)) return { x: 1, b: true };
          stage = 5;
        }
        return { x: 1 };
      };
    };
    const a = lanterns(0);
    const b = lanterns(1);
    const across = (i: 0 | 1) => (w: World) => frog(w, i).grounded && frog(w, i).pos.x > 960 && frog(w, i).pos.y > 600;
    return [
      { name: "hold flower A", input: (w) => [{}, walkTo(frog(w, 1), 238)], until: (w) => w.plates[0].pressed && settled(frog(w, 1)) },
      { name: "swing across", input: (w) => [a(w), {}], until: across(0), max: 10 },
      { name: "hold flower B", input: (w) => [walkTo(frog(w, 0), 1328), {}], until: (w) => w.plates[1].pressed && settled(frog(w, 0)) },
      { name: "partner swings", input: (w) => [{}, b(w)], until: across(1), max: 10 },
      { name: "through the gate", input: () => [{}, { x: 1 }], until: (w) => frog(w, 1).pos.x > 1250 },
      toPad(1490),
    ];
  })(),
  // Tightrope: be the bridge, then reel the bridge over.
  [
    { name: "to the edge", input: (w) => [walkTo(frog(w, 0), 530), walkTo(frog(w, 1), 470)], until: (w) => settled(frog(w, 0)) && frog(w, 0).pos.x > 525 && frog(w, 1).pos.x > 465 },
    { name: "tongue the stump", input: () => [{ b: true }, {}], until: (w) => w.bridge(0) !== null, max: 1 },
    { name: "walk the tongue", input: () => [{ b: true }, { x: 1 }], until: (w) => frog(w, 1).pos.x > 960 && frog(w, 1).support?.kind === "solid", max: 4 },
    { name: "back to the edge", input: (w) => [{ b: true }, walkTo(frog(w, 1), 900)], until: (w) => settled(frog(w, 1)) && frog(w, 1).pos.x < 905 },
    { name: "bridge lets go", input: idle, until: (w) => frog(w, 0).tongue.phase === "idle", max: 1 },
    { name: "grab partner", input: () => [{}, { x: -1, b: true }], until: (w) => frog(w, 1).tongue.phase === "attached", max: 1 },
    { name: "reel them over", input: () => [{}, { y: -1, b: true }], until: (w) => frog(w, 0).grounded && frog(w, 0).pos.x > 850, max: 5 },
    wait("let go", 0.1),
    toPad(1450),
  ],
  // Moonrise: stack + reel, swing, flower + lift, reel.
  (() => {
    const s0 = swing(0, 670, 1000);
    const s1 = swing(1, 670, 1000);
    const onIsland = (i: 0 | 1) => (w: World) => frog(w, i).grounded && frog(w, i).pos.x > 1060 && frog(w, i).pos.y > 560;
    return [
      { name: "to the wall", input: (w) => [walkTo(frog(w, 0), 397), walkTo(frog(w, 1), 330)], until: (w) => settled(frog(w, 0)) && Math.abs(frog(w, 0).pos.x - 397) < 4 && Math.abs(frog(w, 1).pos.x - 330) < 4 },
      { name: "hop onto partner", input: (w) => [{}, { a: true, x: frog(w, 1).pos.x < frog(w, 0).pos.x - 3 ? 1 : 0 }], until: (w) => frog(w, 1).support?.kind === "frog" },
      wait("settle", 0.15),
      { name: "jump up", input: () => [{}, { a: true, x: 1 }], until: (w) => frog(w, 1).grounded && frog(w, 1).pos.y < 520 },
      { name: "to the lip", input: (w) => [{}, walkTo(frog(w, 1), 448)], until: (w) => settled(frog(w, 1)) && Math.abs(frog(w, 1).pos.x - 448) < 4 },
      { name: "grab partner", input: () => [{}, { b: true }], until: (w) => frog(w, 1).tongue.phase === "attached", max: 1 },
      { name: "reel them up", input: () => [{}, { y: -1, b: true }], until: (w) => frog(w, 0).grounded && frog(w, 0).pos.y < 520, max: 4 },
      wait("let go", 0.1),
      { name: "swing to the island", input: (w) => [s0(w), {}], until: onIsland(0) },
      { name: "partner swings", input: (w) => [walkTo(frog(w, 0), 1205), s1(w)], until: onIsland(1) },
      { name: "step onto the lift", input: (w) => [walkTo(frog(w, 0), 1205), walkTo(frog(w, 1), 1322)], until: (w) => frog(w, 1).support?.kind === "mover" && settled(frog(w, 1)) },
      { name: "hold the flower", input: (w) => [walkTo(frog(w, 0), 1128), {}], until: (w) => w.movers[0].t >= 1 },
      { name: "step onto the top", input: (w) => [walkTo(frog(w, 0), 1128), walkTo(frog(w, 1), 1400)], until: (w) => frog(w, 1).support?.kind === "solid" && Math.abs(frog(w, 1).pos.x - 1400) < 4 },
      { name: "ride the lift down", input: (w) => [w.movers[0].t <= 0 ? walkTo(frog(w, 0), 1322) : walkTo(frog(w, 0), 1205), {}], until: (w) => frog(w, 0).support?.kind === "mover" && settled(frog(w, 0)) && w.movers[0].t <= 0 },
      { name: "grab partner", input: () => [{}, { x: -0.5, y: 0.86, b: true }], until: (w) => frog(w, 1).tongue.phase === "attached", max: 1 },
      { name: "reel them up", input: () => [{}, { y: -1, b: true }], until: (w) => frog(w, 0).grounded && frog(w, 0).pos.y < 380, max: 4 },
      wait("let go", 0.1),
      toPad(1490),
    ];
  })(),
];

let failures = 0;
LEVELS.forEach((level, i) => {
  const r = play(level, solutions[i]);
  if (r.ok) console.log(`✓ ${i + 1} ${level.name} — solved in ${r.seconds.toFixed(1)}s`);
  else {
    failures++;
    console.log(`✗ ${i + 1} ${level.name} — stuck at "${r.failed}" (${r.frogs})`);
  }
});
if (failures) process.exit(1);
