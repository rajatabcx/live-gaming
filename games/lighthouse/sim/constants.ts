// Tuning for Lighthouse. Units: world px (the sea chart is CHART_W × CHART_H), seconds.

export const STEP = 1 / 120;

export const CHART_W = 2000;
export const CHART_H = 1250;

/** How much sea the sailor's screen shows around the boat. */
export const SAILOR_VIEW = { w: 1000, h: 625 } as const;

export const BOAT = {
  radius: 16,
  maxSpeed: 105,
  accel: 110,
  /** Fraction of forward speed lost per second with no thrust. */
  drag: 0.7,
  /** Sideways slip lost per second — the keel. */
  keel: 3.2,
  turnRate: 2.6,
  hull: 3,
  /** Impacts slower than this just nudge. */
  scrapeSpeed: 40,
  invulnerable: 1.4,
  /** Seconds sinking before the boat is back at the last buoy. */
  sink: 1.6,
  hornCooldown: 2.2,
} as const;

export const BEAM = {
  length: 1250,
  halfAngle: 0.2,
  turnRate: 1.7,
  /** A flare throws the beam wide for a moment. */
  flareHalfAngle: 0.6,
  flareTime: 1.5,
  flareCooldown: 6,
  /** Stick must be pushed this far before it re-aims the lamp. */
  aimDeadzone: 0.35,
} as const;

export const PICKUP = { buoy: 70, bottle: 34 } as const;

/** The boat has been dark this long when the beam finds it again → "spotted". */
export const SPOT_AFTER = 1.5;
