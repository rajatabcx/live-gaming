import type { Vec } from "../../kit/math";

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Current {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Drift, px/s. */
  vx: number;
  vy: number;
}

/** One night's sea. Plain data; both screens load it by index. */
export interface NightData {
  name: string;
  subtitle: string;
  /** Shown to both until the boat passes the first buoy. */
  hint: string;
  lighthouse: Vec;
  spawn: Vec & { heading: number };
  harbor: Circle;
  rocks: Circle[];
  /** Checkpoints, in route order. */
  buoys: Vec[];
  bottles: Vec[];
  currents: Current[];
  /** How far the sailor's own lantern sees through the fog. */
  lantern: number;
  /** A safe line home — for the playtest bot, never shown. */
  route: Vec[];
}
