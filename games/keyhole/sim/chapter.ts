/** Puzzle vocabulary. Everything a clue shows is something you can say out loud. */

export const SYMBOLS = ["moon", "star", "sun", "wave", "leaf", "heart", "key", "bird"] as const;
export type SymbolId = (typeof SYMBOLS)[number];

export const COLORS = ["rose", "gold", "sky", "sage", "plum"] as const;
export type ColorId = (typeof COLORS)[number];

export type ItemId = "brass-key" | "seeds" | "lens";

export const ITEMS: Record<ItemId, { label: string }> = {
  "brass-key": { label: "Brass key" },
  seeds: { label: "Seed packet" },
  lens: { label: "Glass lens" },
};

/** What a clue looks like up close. */
export type Art =
  | { kind: "symbols"; symbols: SymbolId[]; caption: string }
  | { kind: "colors"; colors: ColorId[]; caption: string }
  | { kind: "note"; lines: string[] }
  /** Notes 0 (lowest) … 4 (highest) on a little stave; also plays. */
  | { kind: "melody"; notes: number[]; caption: string };

export type Device =
  | { kind: "clue"; art: Art }
  /** Each dial cycles through `symbols`; open when they read `solution`. */
  | { kind: "dials"; solution: SymbolId[] }
  /** Press keys in order. Lamps have colours, piano keys have pitches (0 = lowest). */
  | { kind: "sequence"; style: "lamps" | "piano"; keys: ColorId[] | number[]; solution: number[] }
  | { kind: "clock"; solution: { h: number; m: number } }
  | { kind: "container"; needs: ItemId }
  /** The shared door. Its keyhole passes items and peeks; unlocked, both open it together. */
  | { kind: "door" };

/** Drawn furniture. */
export type Prop =
  | "painting"
  | "desk"
  | "letter"
  | "chest"
  | "lamps"
  | "clock"
  | "cabinet"
  | "note"
  | "pot"
  | "flower"
  | "musicbox"
  | "telescope"
  | "starchart"
  | "piano"
  | "safe"
  | "door";

export interface Hotspot {
  id: string;
  /** Centre, room px. */
  x: number;
  /** Footprint, for reach and drawing. */
  w: number;
  prop: Prop;
  label: string;
  device: Device;
  /** Not there until something reveals it. */
  hidden?: boolean;
  /** When solved / opened: */
  gives?: ItemId;
  reveals?: string;
}

export type Theme = "study" | "parlour" | "clock" | "greenhouse" | "attic" | "music";

export interface RoomData {
  name: string;
  theme: Theme;
  hotspots: Hotspot[];
}

export interface ChapterData {
  name: string;
  subtitle: string;
  hint: string;
  /** Room 0 has the door on its right wall, room 1 on its left: the same door. */
  rooms: [RoomData, RoomData];
  /** "<room>:<hotspot id>" — all solved unlocks the door. */
  doorNeeds: string[];
}
