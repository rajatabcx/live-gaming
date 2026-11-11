// Tiny 2D helpers. The sim is plain data + functions so it runs headless (tests, bots).

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const vec = (x = 0, y = 0): Vec => ({ x, y });
export const copy = (v: Vec): Vec => ({ x: v.x, y: v.y });
export const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Move `v` toward `target` by at most `delta`. */
export const approach = (v: number, target: number, delta: number) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);

export const normalize = (x: number, y: number): Vec => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/** Angle in radians between unit vector `a` and direction (x, y). */
export const angleTo = (a: Vec, x: number, y: number) => {
  const l = Math.hypot(x, y) || 1;
  return Math.acos(clamp((a.x * x + a.y * y) / l, -1, 1));
};

export const contains = (r: Rect, p: Vec) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * Where segment p → p + d first enters `r`, as a fraction t ∈ [0, 1], or null.
 * Slab method; a segment starting inside the rect reports t = 0.
 */
export function segmentEnters(px: number, py: number, dx: number, dy: number, r: Rect): number | null {
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [px, dx, r.x, r.x + r.w],
    [py, dy, r.y, r.y + r.h],
  ];
  for (const [p, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (p <= lo || p >= hi) return null;
      continue;
    }
    let a = (lo - p) / d;
    let b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
