// Tuning. World units are "pixels at 1600×900"; the renderer scales to fit.
// Reachability the levels are built around (feet clearance above the floor):
//   solo jump ≈ 157 · jump off partner's head ≈ 193 · tongue range 380.

export const WORLD_W = 1600;
export const WORLD_H = 900;
/** Fixed simulation step. Rendering interpolates between steps. */
export const STEP = 1 / 120;

export const FROG = {
  hw: 23,
  hh: 18,
  /** Mouth relative to the body centre, x mirrored by facing. */
  mouthX: 19,
  mouthY: 5,
} as const;

export const MOVE = {
  gravity: 2400,
  maxFall: 1350,
  run: 320,
  groundAccel: 3400,
  airAccel: 1800,
  /** Air drag with no stick input; gentler above run speed so flings carry. */
  airDrag: 900,
  flingDrag: 240,
  jumpVelocity: 870,
  /** Releasing Jump early cuts the rise — but only after this long, so taps still hop. */
  jumpCutAfter: 0.08,
  jumpCut: 0.5,
  coyote: 0.09,
  buffer: 0.13,
  swingPump: 450,
  maxSpeed: 1150,
} as const;

export const TONGUE = {
  range: 380,
  speed: 3400,
  retract: 4200,
  minLength: 52,
  reel: 300,
  /** The tongue is springy: slack is taken up at this rate, so ropes stay taut. */
  takeUp: 700,
  /** Aim-assist cones (radians) with the stick held vs. neutral. */
  coneAimed: 1.0,
  coneNeutral: 1.25,
  /** Neutral aim: this far above horizontal, toward facing. */
  neutralAim: (55 * Math.PI) / 180,
  /** Sideways stick aims this far above horizontal. */
  runningAim: (30 * Math.PI) / 180,
  /** Share of a rope correction a planted (grounded) frog absorbs. */
  plantedWeight: 0.05,
  releaseBoost: 1.06,
  releasePop: 90,
  /** Bridges steeper than this aren't walkable. */
  maxBridgeSlope: 1.2,
  /** Feet within this far below a bridge step up onto it. */
  bridgeStepUp: 16,
} as const;

export const GOAL_HOLD = 0.9;
export const RESPAWN_TIME = 0.9;
