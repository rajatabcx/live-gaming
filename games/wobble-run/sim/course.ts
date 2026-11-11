import type { Rect, Vec } from "../../kit/math";

/** A bar that windmills around a pivot in the side-view plane. Radians/s; negative spins backwards. */
export interface SpinnerData {
  x: number;
  y: number;
  arm: number;
  speed: number;
  phase: number;
}

/** A platform that oscillates between its rect and rect + (dx, dy). */
export interface SliderData extends Rect {
  dx: number;
  dy: number;
  period: number;
  phase: number;
}

/** A block that waits up high, slams down `drop` units, holds, then rises. */
export interface ThumperData extends Rect {
  drop: number;
  period: number;
  phase: number;
}

/** A springy pad lying on a surface; `y` is that surface. */
export interface PadData {
  x: number;
  y: number;
  w: number;
}

export interface CourseData {
  id: string;
  name: string;
  subtitle: string;
  length: number;
  solids: Rect[];
  /** Biscuit tiles that give way shortly after you step on them. */
  crumbles: Rect[];
  pads: PadData[];
  spinners: SpinnerData[];
  sliders: SliderData[];
  thumpers: ThumperData[];
  /** Respawn points (x, surface y), in course order. The first is the start. */
  checkpoints: Vec[];
  finish: number;
}
