import { palette } from "@/design-system/palette";

type RGB = [number, number, number];

const parse = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Blend two hex colors; t = 0 → a, 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${((1 << 24) | (c(r1, r2) << 16) | (c(g1, g2) << 8) | c(b1, b2)).toString(16).slice(1)}`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Scene colors. Player/accent hues come from the design system; the pond is this game's own. */
export const SCENE = {
  skyTop: "#121828",
  skyMid: "#0e111a",
  skyLow: palette.surfaceBase,
  hillFar: "#161c2a",
  hillNear: "#111621",
  reed: "#0a0c10",
  stoneTop: "#1d1c23",
  stoneLow: "#0f0e12",
  moss: palette.statusOnline,
  leaf: "#2c4d3c",
  pad: "#1d3a2d",
  wood: "#2a2326",
  water: "#10202a",
  waterDeep: "#07090c",
  moon: palette.fgPrimary,
  glow: palette.accentGlow,
  cream: palette.fgPrimary,
  ink: palette.surfaceBase,
  rose: "#ff7f9e",
  berry: "#ffd7a8",
} as const;

export interface FrogColors {
  body: string;
  shade: string;
  belly: string;
  tongue: string;
}

export function frogColors(base: string): FrogColors {
  return {
    body: base,
    shade: mix(base, SCENE.ink, 0.32),
    belly: mix(base, SCENE.cream, 0.55),
    tongue: mix(base, SCENE.rose, 0.5),
  };
}
