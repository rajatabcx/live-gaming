import type { Rect, Vec } from "../../kit/math";
import type { World } from "./world";

/**
 * - knot: a hanging glow-berry. Swing from it; push up/down to climb the tongue.
 * - post: a low stump. Fixed length — a tongue to it is a bridge your partner can walk.
 */
export type AnchorKind = "knot" | "post";

export interface AnchorData {
  x: number;
  y: number;
  kind: AnchorKind;
}

/** A flower switch lying on a surface. `y` is the surface it sits on. */
export interface PlateData {
  x: number;
  y: number;
  w: number;
}

/** A solid that slides between its rest rect and `to` while any linked plate is held. */
export interface MoverData extends Rect {
  to: Vec;
  plates: number[];
  /** Units per second. */
  speed: number;
  look: "gate" | "lift";
}

export interface Hint {
  text: string;
  /** The last hint whose condition holds is shown. Omit for the default. */
  when?: (world: World) => boolean;
}

export interface LevelData {
  id: string;
  name: string;
  subtitle: string;
  /** Short line for the phones. */
  caption: string;
  hints: Hint[];
  /** Static solids, drawn in order. */
  solids: Rect[];
  /** Water surface y; falling in respawns you. */
  water: number | null;
  /** Feet positions (x, surface y). */
  spawns: [Vec, Vec];
  /** Both frogs standing inside this together finishes the level. */
  goal: Rect;
  anchors: AnchorData[];
  plates: PlateData[];
  movers: MoverData[];
  fireflies: Vec[];
}
