import { palette } from "@/design-system/palette";
import type { ColorId, Theme } from "../sim/chapter";

/** Lamplit rooms at night: warm walls, dark wood, small pools of gold. */
export const INK = palette.surfaceBase;
export const CREAM = palette.fgPrimary;
export const GLOW = palette.accentGlow;

export const WOOD = { dark: "#2a1c16", mid: "#4a3226", light: "#6e4b36", edge: "#8a6248" } as const;
export const BRASS = { base: "#c9a35a", light: "#f0d38f", dark: "#7a5f2e" } as const;
export const PAPER = { base: "#efe3cc", ink: "#3b2a22", shade: "#cdbb9c" } as const;

export interface RoomColors {
  wall: string;
  wallLow: string;
  trim: string;
  floor: string;
  floorLine: string;
  pattern: string;
}

export const THEMES: Record<Theme, RoomColors> = {
  study: { wall: "#2b2230", wallLow: "#1f1822", trim: "#3d2f37", floor: "#24170f", floorLine: "#3a261a", pattern: "#3a2d40" },
  parlour: { wall: "#33222a", wallLow: "#24171d", trim: "#4a2f38", floor: "#26170f", floorLine: "#3c2619", pattern: "#452c37" },
  clock: { wall: "#1f2630", wallLow: "#161b23", trim: "#2e3742", floor: "#21170f", floorLine: "#36261a", pattern: "#2a3440" },
  greenhouse: { wall: "#1b2a25", wallLow: "#13201b", trim: "#2a3d35", floor: "#2a2118", floorLine: "#3e3022", pattern: "#24382f" },
  attic: { wall: "#2a2420", wallLow: "#1e1915", trim: "#3d342c", floor: "#2b1d13", floorLine: "#40291b", pattern: "#362e27" },
  music: { wall: "#231f33", wallLow: "#181525", trim: "#332d48", floor: "#22160f", floorLine: "#38251a", pattern: "#2f2944" },
};

export const COLOR_HEX: Record<ColorId, string> = {
  rose: palette.playerOne,
  gold: "#f2c45a",
  sky: palette.playerTwo,
  sage: "#93c49a",
  plum: "#b58ad6",
};
