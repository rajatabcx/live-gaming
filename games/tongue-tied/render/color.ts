import { palette } from "@/design-system/palette";
import { mix } from "../../kit/color";

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
