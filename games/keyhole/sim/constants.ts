// Tuning for Keyhole. Units: room px (each room is ROOM_W × ROOM_H, side view), seconds.

export const STEP = 1 / 120;

export const ROOM_W = 1600;
export const ROOM_H = 900;
/** Where feet touch the floorboards. */
export const FLOOR_Y = 760;

export const WALK = { speed: 340, minX: 110, maxX: 1490 } as const;

/** How close (beyond half a prop's width) you must stand to use it. */
export const REACH = 46;

/** Stick must pass this to count as a flick (menu moves). */
export const FLICK = 0.55;

/** Both must hold A at the unlocked door this long. */
export const DOOR_HOLD = 1.1;

/** Seconds a peek through the keyhole lasts. */
export const PEEK = 2.2;

/** Seconds a speech line stays up. */
export const SAY = 2.6;
