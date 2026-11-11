import { palette } from "@/design-system/palette";

/** Night sea, warm light. Everything not lamplight is cool and low. */
export const SEA = {
  deep: "#060d18",
  mid: "#0a1626",
  shallow: "#10233a",
  wave: "#7fa6d6",
  foam: "#dfe9f7",
  rock: "#141c28",
  rockTop: "#253145",
  land: "#0b1018",
  landEdge: "#1c2636",
  grass: "#16261f",
  fog: "#0d1520",
  fogLight: "#26364c",
  grid: "#7fa6d6",
} as const;

export const LIGHT = {
  beam: "#ffd9a0",
  lamp: palette.accentGlow,
  warm: "#ffb36b",
  buoyRed: "#ff6b6b",
  buoyGreen: palette.statusOnline,
  bottle: "#bfe8d6",
  harbor: "#ffc98a",
  cream: palette.fgPrimary,
  ink: palette.surfaceBase,
} as const;

export const TOWER = { white: "#e9e2d6", red: "#c4473f", cap: "#2a2f3a" } as const;
