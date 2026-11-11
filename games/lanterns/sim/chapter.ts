import type { Rect, Vec } from "../../kit/math";

export interface StarData {
  x: number;
  y: number;
  /** Invisible until a glow pulse finds it. */
  hidden?: boolean;
}

/** A current that pushes lanterns while they're inside it (units/s²). */
export interface WindData extends Rect {
  fx: number;
  fy: number;
}

export interface ChapterData {
  id: string;
  /** The constellation's name, revealed when it's complete. */
  name: string;
  subtitle: string;
  stars: StarData[];
  /** Pairs of star indices; a line draws once both ends are lit. */
  lines: [number, number][];
  winds: WindData[];
  /** Only used when a chapter is loaded fresh (not risen into). */
  spawns: [Vec, Vec];
  /** Shown once, softly, until it's done. Lanterns is otherwise wordless. */
  hint?: string;
}
