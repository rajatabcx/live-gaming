import { palette } from "@/design-system/palette";
import { mix } from "../../kit/color";

/** Night → dawn. The sky warms a little with every constellation. */
export const SKY = {
  night: { top: "#05060d", mid: "#0b0e1f", low: "#151a33" },
  dawn: { top: "#1b2140", mid: "#6a4a72", low: "#f2a77e" },
} as const;

export const SCENE = {
  star: palette.fgPrimary,
  starLit: "#fff1d6",
  line: palette.accentGlow,
  paper: "#ffe2b8",
  flame: palette.accentGlow,
  wood: "#2a1d1a",
  hill: "#070810",
  hillDawn: "#2a2034",
  mist: "#9aa6d6",
  wind: "#b9c4f0",
  cream: palette.fgPrimary,
  ink: palette.surfaceBase,
  sun: "#ffd9a8",
} as const;

export interface SkyColors {
  top: string;
  mid: string;
  low: string;
  hill: string;
}

export function skyAt(dawn: number): SkyColors {
  const k = Math.max(0, Math.min(1, dawn));
  return {
    top: mix(SKY.night.top, SKY.dawn.top, k),
    mid: mix(SKY.night.mid, SKY.dawn.mid, k * k),
    low: mix(SKY.night.low, SKY.dawn.low, k * k * k),
    hill: mix(SCENE.hill, SCENE.hillDawn, k),
  };
}

/** Paper lit from inside, tinted toward the player's colour. */
export function paperFor(base: string) {
  return {
    paper: mix(SCENE.paper, base, 0.35),
    glow: mix(SCENE.flame, base, 0.3),
    rib: mix(SCENE.wood, base, 0.25),
  };
}
