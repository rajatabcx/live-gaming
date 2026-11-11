// Wobble Run tuning. World units match Tongue Tied: a 1600×900 window,
// but courses scroll horizontally for several thousand units.
// Reach: jump clears ~166 up / ~300 across at full run; jump + dive ~430 across.

export const VIEW_W = 1600;
export const VIEW_H = 900;
export const STEP = 1 / 120;
/** Falling below this respawns you at your last checkpoint. */
export const FALL_Y = 1080;

export const RUNNER = { r: 22 } as const;

export const MOVE = {
  gravity: 2600,
  maxFall: 1500,
  run: 420,
  groundAccel: 3000,
  airAccel: 1700,
  airDrag: 700,
  jumpVelocity: 930,
  jumpCutAfter: 0.08,
  jumpCut: 0.5,
  coyote: 0.1,
  buffer: 0.13,
} as const;

export const DIVE = {
  speed: 660,
  lift: 300,
  time: 0.42,
  /** Belly-flop recovery after landing a dive. */
  flop: 0.36,
} as const;

export const HIT = {
  /** Shoulder bump between runners. */
  bump: 360,
  /** Getting dived into. */
  dived: 780,
  spinner: 760,
  thumper: 820,
  stun: 0.42,
} as const;

export const BOUNCE = 1380;
export const CRUMBLE = { delay: 0.42, respawn: 3.2 } as const;
export const RESPAWN_TIME = 0.7;
export const COUNTDOWN = 3;
/** After the winner crosses, how long the other runner has to finish. */
export const FINISH_GRACE = 3.5;
