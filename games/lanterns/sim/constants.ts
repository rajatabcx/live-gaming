// Lanterns tuning. One 1600×900 sky per chapter; the camera "rises" between them.

export const VIEW_W = 1600;
export const VIEW_H = 900;
export const STEP = 1 / 120;

export const LANTERN = {
  r: 26,
  accel: 1300,
  /** Exponential drag per second: floaty, not slippery. */
  drag: 2.4,
  maxSpeed: 340,
  /** Soft walls this far inside the window. */
  margin: 50,
  wall: 2400,
} as const;

export const STAR = {
  /** Both lanterns inside this radius kindle a star. */
  reach: 96,
  /** Seconds of both being there to light it. */
  kindle: 1.5,
  /** Progress lost per second when one of you drifts off. */
  cool: 0.5,
} as const;

export const GLOW = {
  cooldown: 0.7,
  /** Hidden stars inside this radius of a glow are revealed. */
  reveal: 260,
  /** Two glows this close in time and space are a harmony… */
  harmonyWindow: 0.45,
  harmonyRange: 320,
  /** …which gives nearby visible stars a head start. */
  harmonyBoost: 0.4,
  harmonyRadius: 360,
} as const;

/** Lanterns dim as they drift apart. */
export const APART = { near: 420, far: 900, min: 0.35 } as const;
