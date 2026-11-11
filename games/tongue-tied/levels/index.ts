import type { LevelData } from "../sim/level";
import type { World } from "../sim/world";

// Single-screen levels on a 1600×900 grid. Numbers are tuned against
// sim/constants: solo jump clears ~157, a jump off your partner ~193,
// tongues reach 380. Every level needs both frogs — no solo route.

const onTop = (w: World, minX: number, maxY: number) =>
  w.frogs.filter((f) => f.respawn <= 0 && f.pos.x > minX && f.pos.y < maxY).length;

const togetherOnPad: LevelData["hints"][number] = { text: "Now the moon pad. Together.", when: (w) => w.goalCount > 0 };

/** 1 — stacking and pulling each other up. */
const firstLight: LevelData = {
  id: "first-light",
  name: "First Light",
  subtitle: "Lean on each other.",
  caption: "Jump · Tongue (hold) · push up to reel in",
  hints: [
    { text: "Hop onto your partner's head to reach the ledge." },
    {
      text: "Up top? Hold Tongue to grab your partner, then push up to reel them in.",
      when: (w) => onTop(w, 1030, 600) === 1,
    },
    { text: "Stand on the moon pad together.", when: (w) => onTop(w, 1030, 600) === 2 },
  ],
  solids: [
    { x: 0, y: 760, w: 1600, h: 140 },
    { x: 420, y: 690, w: 180, h: 70 },
    { x: 1050, y: 585, w: 550, h: 315 },
  ],
  water: null,
  spawns: [
    { x: 150, y: 760 },
    { x: 230, y: 760 },
  ],
  goal: { x: 1360, y: 465, w: 190, h: 120 },
  anchors: [],
  plates: [],
  movers: [],
  fireflies: [
    { x: 330, y: 690 },
    { x: 510, y: 630 },
    { x: 740, y: 650 },
    { x: 905, y: 690 },
    { x: 1000, y: 520 },
    { x: 1250, y: 530 },
  ],
};

/** 2 — swinging from lanterns, and holding a gate for each other. */
const lanternLine: LevelData = {
  id: "lantern-line",
  name: "Lantern Line",
  subtitle: "Hold on. Let go. Fly.",
  caption: "Aim at a lantern · hold Tongue to swing",
  hints: [
    { text: "One of you holds the flower. The other aims at a lantern and holds Tongue to swing." },
    {
      text: "Made it? Stand on the flower past the gate so your partner can follow.",
      when: (w) => onTop(w, 950, 680) === 1,
    },
    { text: "Moon pad. Together.", when: (w) => onTop(w, 1215, 680) === 2 },
  ],
  solids: [
    { x: 0, y: 560, w: 470, h: 340 },
    { x: 960, y: 660, w: 640, h: 240 },
  ],
  water: 820,
  spawns: [
    { x: 90, y: 560 },
    { x: 150, y: 560 },
  ],
  goal: { x: 1430, y: 540, w: 160, h: 120 },
  anchors: [
    { x: 620, y: 330, kind: "knot" },
    { x: 860, y: 340, kind: "knot" },
  ],
  plates: [
    { x: 200, y: 560, w: 80 },
    { x: 1290, y: 660, w: 80 },
  ],
  movers: [{ x: 1190, y: 460, w: 26, h: 200, to: { x: 1190, y: 250 }, plates: [0, 1], speed: 420, look: "gate" }],
  fireflies: [
    { x: 340, y: 480 },
    { x: 620, y: 600 },
    { x: 745, y: 560 },
    { x: 860, y: 620 },
    { x: 1070, y: 600 },
    { x: 1360, y: 560 },
  ],
};

/** 3 — one of you is the bridge, then the other reels them over. */
const tightrope: LevelData = {
  id: "tightrope",
  name: "Tightrope",
  subtitle: "Be the bridge.",
  caption: "Hold Tongue on the stump · stay still",
  hints: [
    { text: "One of you: stand at the very edge, aim at the stump and hold Tongue." },
    {
      text: "Hold still! Partner — walk across the tongue.",
      when: (w) => w.bridge(0) !== null || w.bridge(1) !== null,
    },
    {
      text: "Now reel them over: hold Tongue on your partner, push up.",
      when: (w) => onTop(w, 880, 640) === 1 && w.bridge(0) === null && w.bridge(1) === null,
    },
    togetherOnPad,
  ],
  solids: [
    { x: 0, y: 600, w: 540, h: 300 },
    { x: 880, y: 600, w: 720, h: 300 },
  ],
  water: 870,
  spawns: [
    { x: 120, y: 600 },
    { x: 190, y: 600 },
  ],
  goal: { x: 1380, y: 480, w: 180, h: 120 },
  anchors: [{ x: 894, y: 576, kind: "post" }],
  plates: [],
  movers: [],
  fireflies: [
    { x: 300, y: 540 },
    { x: 650, y: 535 },
    { x: 780, y: 535 },
    { x: 720, y: 720 },
    { x: 1110, y: 545 },
  ],
};

/** 4 — everything at once. */
const moonrise: LevelData = {
  id: "moonrise",
  name: "Moonrise",
  subtitle: "All of it, together.",
  caption: "Stack · swing · hold · pull",
  hints: [
    { text: "Everything you've learned: stack, swing, hold, pull." },
    {
      text: "One holds the flower. One rides the lily up.",
      when: (w) => w.frogs.some((f) => f.respawn <= 0 && f.pos.x > 1050 && f.pos.x < 1380 && f.pos.y > 480),
    },
    { text: "Reel your partner up.", when: (w) => onTop(w, 1380, 400) === 1 },
    { text: "Moon pad. Together.", when: (w) => onTop(w, 1380, 400) === 2 },
  ],
  solids: [
    { x: 0, y: 700, w: 420, h: 200 },
    { x: 420, y: 525, w: 260, h: 375 },
    { x: 1060, y: 600, w: 200, h: 300 },
    { x: 1380, y: 380, w: 220, h: 520 },
  ],
  water: 850,
  spawns: [
    { x: 120, y: 700 },
    { x: 200, y: 700 },
  ],
  goal: { x: 1450, y: 260, w: 140, h: 120 },
  anchors: [{ x: 870, y: 300, kind: "knot" }],
  plates: [{ x: 1090, y: 600, w: 76 }],
  movers: [{ x: 1270, y: 600, w: 104, h: 22, to: { x: 1270, y: 380 }, plates: [0], speed: 170, look: "lift" }],
  fireflies: [
    { x: 260, y: 640 },
    { x: 550, y: 450 },
    { x: 790, y: 470 },
    { x: 950, y: 470 },
    { x: 1160, y: 540 },
    { x: 1322, y: 470 },
    { x: 1420, y: 320 },
  ],
};

export const LEVELS: readonly LevelData[] = [firstLight, lanternLine, tightrope, moonrise];
