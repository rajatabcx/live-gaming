import { palette } from "@/design-system/palette";
import { mix } from "../../kit/color";

/** Dusk-candy scene colors. Player hues come from the design system; the candy is this game's own. */
export const SCENE = {
  skyTop: "#160f20",
  skyMid: "#3a1d3c",
  skyLow: "#94485c",
  horizon: "#f0956f",
  sun: "#ffd2a1",
  hillFar: "#4f2744",
  hillNear: "#2f1730",
  cloud: "#ffc2cf",
  pit: "#0f0a13",
  frosting: "#ffe3ea",
  frostingShade: "#f2b2c4",
  jam: "#d9577e",
  cakeTop: "#7c3456",
  cakeLow: "#2c1226",
  biscuit: "#e8b07a",
  biscuitShade: "#a8703f",
  jelly: "#7ee0c8",
  jellyShade: "#2f9b86",
  cane: "#ff5f7e",
  caneWhite: "#fff2f5",
  raft: "#ffd36e",
  raftShade: "#c98f35",
  gum: "#4b3f8f",
  gumTop: "#7468c8",
  gold: "#ffd36e",
  cream: palette.fgPrimary,
  ink: palette.surfaceBase,
  blush: "#ff8fa8",
} as const;

export const CONFETTI = [SCENE.gold, SCENE.cane, SCENE.jelly, SCENE.cloud, SCENE.caneWhite, SCENE.gumTop];

export interface RunnerColors {
  body: string;
  light: string;
  shade: string;
  rim: string;
}

export function runnerColors(base: string): RunnerColors {
  return {
    body: base,
    light: mix(base, SCENE.cream, 0.5),
    shade: mix(base, SCENE.ink, 0.38),
    rim: mix(base, SCENE.ink, 0.7),
  };
}
