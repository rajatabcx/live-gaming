/**
 * Raw token values for places CSS variables can't reach (canvas 2D, WebGL).
 * Mirrors design-system/tokens.css primitives — keep in sync with Figma "Primitives".
 */
export const palette = {
  surfaceBase: "#0b0a0d",
  fgPrimary: "#f4ece2",
  playerOne: "#ff8a7a",
  playerTwo: "#8fb8ff",
  accentGlow: "#ffc58a",
  statusOnline: "#7ee0a1",
} as const;

/** Slot-indexed player colors: PLAYER_COLORS[player.slot]. */
export const PLAYER_COLORS = [palette.playerOne, palette.playerTwo] as const;
