// Headless check that every chapter can be solved by two players who only
// know what's on the other side of the wall once their partner can see it —
// a lock's answer counts as "known" only while its clue is visible next door.
//   node --no-warnings --import ./scripts/ts-resolve.mjs games/keyhole/playtest/run.ts

import { CHAPTERS } from "../chapters";
import { SYMBOLS, type ChapterData, type Hotspot } from "../sim/chapter";
import { STEP } from "../sim/constants";
import { IDLE_INPUT, World, type KeyholeInput, type Slot } from "../sim/world";

const LIMIT = 600;

/** The clue next door that tells you how to open `lock`, if it's visible. */
function knows(w: World, slot: Slot, lock: Hotspot): boolean {
  const other: Slot = slot === 0 ? 1 : 0;
  const d = lock.device;
  return w.chapter.rooms[other].hotspots.some((h) => {
    if (h.device.kind !== "clue" || !w.visible(other, h)) return false;
    const art = h.device.art;
    if (d.kind === "dials") return art.kind === "symbols" && art.symbols.join() === d.solution.join();
    if (d.kind === "clock") return art.kind === "note";
    if (d.kind === "sequence" && d.style === "lamps")
      return art.kind === "colors" && art.colors.join() === d.solution.map((i) => (d.keys as string[])[i]).join();
    if (d.kind === "sequence" && d.style === "piano") return art.kind === "melody" && art.notes.join() === d.solution.join();
    return false;
  });
}

/** A player who walks to the next useful thing and works it like a person with a stick would. */
function bot(slot: Slot) {
  let tick = 0;
  return (w: World): KeyholeInput => {
    tick++;
    const p = w.players[slot];
    // Every other step neutral, so flicks and presses register as fresh.
    const rest = tick % 2 === 0;
    const go = (x: number, y = 0, use = false): KeyholeInput => (rest ? IDLE_INPUT : { x, y, a: false, use, back: false });

    if (p.panel) {
      const h = w.hotspot(slot, p.panel)!;
      const st = w.spots[slot][h.id];
      const d = h.device;
      const toward = (target: number) => (target > p.cursor ? 1 : -1);
      if (d.kind === "dials") {
        const i = d.solution.findIndex((s, i) => SYMBOLS[st.values[i]] !== s);
        if (i !== p.cursor) return go(toward(i));
        const want = SYMBOLS.indexOf(d.solution[i]);
        return go(0, want > st.values[i] ? -1 : 1);
      }
      if (d.kind === "clock") {
        const want = [d.solution.h, d.solution.m / 15];
        const i = st.values[0] !== want[0] ? 0 : 1;
        if (i !== p.cursor) return go(toward(i));
        return go(0, want[i] > st.values[i] ? -1 : 1);
      }
      if (d.kind === "sequence") {
        const next = d.solution[st.entered.length];
        if (next !== p.cursor) return go(toward(next));
        return go(0, 0, true);
      }
      return rest ? IDLE_INPUT : { ...IDLE_INPUT, back: true };
    }

    const room = w.chapter.rooms[slot].hotspots;
    const door = room.find((h) => h.device.kind === "door")!;
    const container = room.find((h) => h.device.kind === "container" && !w.spots[slot][h.id].solved && p.items.includes(h.device.needs));
    const lock = room.find((h) => ["dials", "clock", "sequence"].includes(h.device.kind) && !w.spots[slot][h.id].solved && knows(w, slot, h));
    let target: Hotspot | null = null;
    let hold = false;
    if (container) target = container;
    else if (p.items.length) target = door;
    else if (lock) target = lock;
    else if (w.unlocked) (target = door), (hold = true);
    if (!target) return IDLE_INPUT;

    if (w.nearest(slot)?.id !== target.id) {
      const dx = target.x - p.x;
      return { ...IDLE_INPUT, x: Math.sign(dx) };
    }
    if (hold) return { ...IDLE_INPUT, a: true };
    return go(0, 0, true);
  };
}

function solve(chapter: ChapterData) {
  const w = new World(chapter);
  const bots = [bot(0), bot(1)];
  while (!w.opened && w.time < LIMIT) w.step([bots[0](w), bots[1](w)]);
  return w;
}

let failed = false;
let total = 0;
for (const chapter of CHAPTERS) {
  const w = solve(chapter);
  total += w.time;
  const ok = w.opened && w.wrongs === 0;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${chapter.name.padEnd(16)} ${w.time.toFixed(1)}s  wrong ${w.wrongs}`);

  // Nobody solves anything alone: every lock's clue is in the other room.
  for (const slot of [0, 1] as const) {
    for (const h of chapter.rooms[slot].hotspots) {
      if (!["dials", "clock", "sequence"].includes(h.device.kind)) continue;
      const elsewhere = chapter.rooms[slot].hotspots.some((c) => c.device.kind === "clue" && c.id !== h.id && sameAnswer(c, h));
      if (elsewhere) {
        failed = true;
        console.log(`✗   ${chapter.name}: ${h.label}'s clue is in the same room`);
      }
    }
  }

  // The door stays shut until the work is done.
  const idle = new World(chapter);
  for (let t = 0; t < 5; t += STEP) idle.step([{ ...IDLE_INPUT, a: true }, { ...IDLE_INPUT, a: true }]);
  if (idle.opened || idle.unlocked) {
    failed = true;
    console.log(`✗   ${chapter.name}: door opens without solving`);
  }
}

function sameAnswer(clue: Hotspot, lock: Hotspot) {
  if (clue.device.kind !== "clue" || lock.device.kind !== "dials") return false;
  const art = clue.device.art;
  return art.kind === "symbols" && art.symbols.join() === lock.device.solution.join();
}

console.log(`  bots: ${(total / 60).toFixed(1)} min for all three chapters`);
if (failed) process.exitCode = 1;
