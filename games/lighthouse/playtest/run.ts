// Headless check that every night can be sailed home by a sailor who follows
// a safe line while the keeper keeps the light on them — and that a sailor
// steering blind, straight at the harbour, runs aground.
//   node --no-warnings --import ./scripts/ts-resolve.mjs games/lighthouse/playtest/run.ts

import { NIGHTS } from "../nights";
import { BOAT } from "../sim/constants";
import type { NightData } from "../sim/night";
import { IDLE_KEEPER, World, type KeeperInput, type SailorInput } from "../sim/world";

const LIMIT = 240;

function sail(night: NightData, steer: (w: World) => SailorInput, keep: (w: World) => KeeperInput) {
  const world = new World(night);
  let lit = 0;
  let steps = 0;
  while (!world.docked && world.time < LIMIT) {
    world.step(keep(world), steer(world));
    steps++;
    if (world.boatLit) lit++;
  }
  return { world, litShare: lit / Math.max(1, steps) };
}

/** Follow the route, leaning against the tide like a person would. */
function follower() {
  let i = 0;
  return (w: World): SailorInput => {
    const { route } = w.night;
    const b = w.boat;
    if (b.sinking > 0) return { x: 0, y: 0, hornPressed: false };
    while (i < route.length - 1 && Math.hypot(route[i].x - b.pos.x, route[i].y - b.pos.y) < 45) i++;
    const t = route[i];
    const tide = w.currentAt(b.pos);
    const dx = t.x - b.pos.x - tide.x * 0.6;
    const dy = t.y - b.pos.y - tide.y * 0.6;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, 0.45 + d / 200);
    return { x: (dx / d) * k, y: (dy / d) * k, hornPressed: false };
  };
}

/** A keeper who keeps the beam on the boat. */
const tracker = (w: World): KeeperInput => {
  const { lighthouse } = w.night;
  const dx = w.boat.pos.x - lighthouse.x;
  const dy = w.boat.pos.y - lighthouse.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d, flarePressed: false };
};

let failed = false;
let total = 0;
for (const night of NIGHTS) {
  const { world, litShare } = sail(night, follower(), tracker);
  total += world.time;
  const ok = world.docked && world.wrecks === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? "✓" : "✗"} ${night.name.padEnd(14)} ${world.time.toFixed(1)}s  scrapes ${world.scrapes}  wrecks ${world.wrecks}  lit ${(litShare * 100).toFixed(0)}%  ${world.collected}/${night.bottles.length} bottles`,
  );

  // Straight at the harbour with nobody looking: the rocks must be in the way.
  const blind = sail(
    night,
    (w) => {
      const dx = night.harbor.x - w.boat.pos.x;
      const dy = night.harbor.y - w.boat.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d, hornPressed: false };
    },
    () => IDLE_KEEPER,
  );
  const hard = blind.world.scrapes > 0 || !blind.world.docked;
  if (!hard) failed = true;
  console.log(`${hard ? "✓" : "✗"}   steering blind hits rocks (${blind.world.scrapes} scrapes)`);
}

// Route sanity: every waypoint of every night inside the sea and clear of rocks.
for (const night of NIGHTS) {
  for (const p of night.route) {
    const rock = night.rocks.find((r) => Math.hypot(r.x - p.x, r.y - p.y) < r.r + BOAT.radius);
    if (rock) {
      failed = true;
      console.log(`✗ ${night.name}: waypoint ${p.x},${p.y} is inside a rock`);
    }
  }
}

console.log(`  bots: ${(total / 60).toFixed(1)} min for all three nights`);
if (failed) process.exitCode = 1;
