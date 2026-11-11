import type { Rect, Vec } from "../../kit/math";
import type { CourseData, PadData, SliderData, SpinnerData, ThumperData } from "../sim/course";

// Courses are strings of sections. Every section starts on the ground (760),
// owns its own run-in checkpoint, and ends where the next one's ground begins,
// so sections can be reordered freely. Checkpoints stay ≤ 1000 apart and clear
// of hazards — a runner carried off the left edge always has one in view.

const GROUND = 760;
const DEEP = 1200;

interface Piece {
  solids: Rect[];
  crumbles: Rect[];
  pads: PadData[];
  spinners: SpinnerData[];
  sliders: SliderData[];
  thumpers: ThumperData[];
  checkpoints: Vec[];
}

type Section = (x: number) => Partial<Piece> & { width: number };

/** A slab from x0 to x1 whose top is `y`, running down past the drop line. */
const slab = (x0: number, x1: number, y = GROUND): Rect => ({ x: x0, y, w: x1 - x0, h: DEEP - y });
const cp = (x: number, y = GROUND): Vec => ({ x, y });

/** Low windmill: sweeps the lane at runner height twice per turn. */
const windmill = (x: number, speed: number, phase = 0): SpinnerData => ({ x, y: GROUND - 170, arm: 160, speed, phase });

// ─── Sections ─────────────────────────────────────────────────────────────────

const flat =
  (w: number): Section =>
  (x) => ({ width: w, solids: [slab(x, x + w)], checkpoints: [cp(x + 100)] });

/** Two jumpable pits. */
const hops: Section = (x) => ({
  width: 1400,
  solids: [slab(x, x + 320), slab(x + 540, x + 840), slab(x + 1090, x + 1400)],
  checkpoints: [cp(x + 120), cp(x + 640), cp(x + 1190)],
});

/** A wall too tall to jump; the jelly pad in front of it is the way up. */
const padLedge: Section = (x) => ({
  width: 960,
  solids: [slab(x, x + 520), slab(x + 520, x + 960, 520)],
  pads: [{ x: x + 300, y: GROUND, w: 80 }],
  checkpoints: [cp(x + 100), cp(x + 620, 520)],
});

/** Biscuit tiles over a pit. Keep running. */
const crumbles: Section = (x) => {
  const n = 5;
  const w = 600 / n;
  return {
    width: 880,
    solids: [slab(x, x + 260)],
    crumbles: Array.from({ length: n }, (_, i) => ({ x: x + 270 + i * w + (i ? 2 : 0), y: GROUND, w: w - (i ? 2 : 0), h: 34 })),
    checkpoints: [cp(x + 120)],
  };
};

/** One or two windmills sweeping the lane. Opposite spins when there are two. */
const windmills =
  (count: 1 | 2, speed = 2.2, phase = 0): Section =>
  (x) => {
    const width = 300 + 330 * (count - 1) + 350;
    return {
      width,
      solids: [slab(x, x + width)],
      spinners: Array.from({ length: count }, (_, i) => windmill(x + 300 + 330 * i, i % 2 ? -speed * 1.1 : speed, phase + i * 0.8)),
      checkpoints: [cp(x + 100), cp(x + width - 60)],
    };
  };

/** A raft that ferries you across a wide pit. */
const ferry: Section = (x) => ({
  width: 744,
  solids: [slab(x, x + 240)],
  sliders: [{ x: x + 252, y: GROUND, w: 170, h: 30, dx: 310, dy: 0, period: 3.4, phase: 0 }],
  checkpoints: [cp(x + 110)],
});

/** Two bobbing lifts up to a ledge. */
const lifts: Section = (x) => ({
  width: 1100,
  solids: [slab(x, x + 240), slab(x + 760, x + 1100, 560)],
  sliders: [
    { x: x + 250, y: GROUND, w: 150, h: 30, dx: 0, dy: -200, period: 3, phase: 0 },
    { x: x + 500, y: GROUND, w: 150, h: 30, dx: 0, dy: -200, period: 3, phase: 0.3 },
  ],
  checkpoints: [cp(x + 110), cp(x + 860, 560)],
});

/** A row of thumpers slamming in a wave. */
const thumpers =
  (count: 1 | 2 | 3, period = 2.2): Section =>
  (x) => {
    const width = 260 + 220 * count + 200;
    return {
      width,
      solids: [slab(x, x + width)],
      thumpers: Array.from({ length: count }, (_, i) => ({
        x: x + 260 + 220 * i,
        y: GROUND - 110 - 260,
        w: 110,
        h: 110,
        drop: 260,
        period,
        phase: i * 0.33,
      })),
      checkpoints: [cp(x + 100), cp(x + width - 80)],
    };
  };

/** Bounce up to a high deck with a windmill on it, then ride a raft to the next. */
const highDeck: Section = (x) => ({
  width: 1680,
  solids: [slab(x, x + 480), slab(x + 480, x + 880, 460), slab(x + 1380, x + 1680, 460)],
  pads: [{ x: x + 260, y: GROUND, w: 80 }],
  spinners: [{ x: x + 700, y: 300, arm: 140, speed: 2.6, phase: 0.4 }],
  sliders: [{ x: x + 890, y: 460, w: 160, h: 30, dx: 320, dy: 0, period: 3.2, phase: 0 }],
  checkpoints: [cp(x + 100), cp(x + 530, 460), cp(x + 1420, 460)],
});

// ─── Assembly ─────────────────────────────────────────────────────────────────

const RUN_OUT = 700;

function course(id: string, name: string, subtitle: string, sections: Section[]): CourseData {
  const out: Piece = { solids: [], crumbles: [], pads: [], spinners: [], sliders: [], thumpers: [], checkpoints: [] };
  let x = 0;
  for (const section of [flat(500), ...sections, flat(RUN_OUT)]) {
    const { width, ...piece } = section(x);
    for (const key of Object.keys(out) as (keyof Piece)[]) out[key].push(...((piece[key] ?? []) as never[]));
    x += width;
  }
  // The start line sits a little in from the left edge.
  out.checkpoints[0] = cp(160);
  // Sections meet flush; fuse level neighbours so there's no seam in the cake.
  out.solids = out.solids.reduce<Rect[]>((acc, s) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.x + prev.w === s.x && prev.y === s.y && prev.h === s.h) prev.w += s.w;
    else acc.push({ ...s });
    return acc;
  }, []);
  return { id, name, subtitle, length: x, finish: x - RUN_OUT + 250, ...out };
}

export const COURSES: CourseData[] = [
  course("sugar-rush", "Sugar Rush", "Jump, bounce, don't look down", [
    hops,
    padLedge,
    crumbles,
    windmills(1),
    ferry,
    thumpers(1),
    hops,
    crumbles,
    padLedge,
  ]),
  course("spin-cycle", "Spin Cycle", "Mind the windmills", [
    windmills(2, 2.0),
    hops,
    highDeck,
    lifts,
    windmills(2, 2.4, 1.2),
    ferry,
    windmills(1, 2.8),
    windmills(2, 2.2, 0.4),
  ]),
  course("grand-wobble", "Grand Wobble", "Everything, all at once", [
    crumbles,
    thumpers(2),
    highDeck,
    hops,
    windmills(2),
    lifts,
    thumpers(3, 2.0),
    crumbles,
    windmills(1, 2.6),
    ferry,
  ]),
];
