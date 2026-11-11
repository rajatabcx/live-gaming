import { clamp } from "../../kit/math";
import { DOOR_HOLD, FLICK, PEEK, REACH, SAY, STEP, WALK } from "./constants";
import { SYMBOLS, type ChapterData, type Device, type Hotspot, type ItemId, type SymbolId } from "./chapter";

export type Slot = 0 | 1;

export interface KeyholeInput {
  /** Stick: x walks; in a close-up, flicks move and turn. */
  x: number;
  y: number;
  /** Held, for opening the door together. */
  a: boolean;
  /** Presses latched since the last step (taps can be shorter than a step). */
  use: boolean;
  back: boolean;
}

export const IDLE_INPUT: KeyholeInput = { x: 0, y: 0, a: false, use: false, back: false };

/** Live state of one interactive thing. Which fields matter depends on its device. */
export interface SpotState {
  solved: boolean;
  revealed: boolean;
  /** dials: symbol index per dial · clock: [hour 1-12, quarter 0-3] */
  values: number[];
  /** sequence: keys pressed so far */
  entered: number[];
}

export interface Player {
  x: number;
  prevX: number;
  facing: 1 | -1;
  /** 0..1 walk cycle. */
  stride: number;
  moving: boolean;
  /** Close-up open on this hotspot, or null when walking. */
  panel: string | null;
  /** Which dial / key / hand the close-up cursor is on. */
  cursor: number;
  items: ItemId[];
  /** > 0 while looking through the keyhole. */
  peek: number;
  /** Seconds holding Use at the unlocked door. */
  holding: number;
  say: { text: string; until: number } | null;
}

export type WorldEvent =
  | { type: "open"; slot: Slot; id: string }
  | { type: "close"; slot: Slot }
  | { type: "cursor"; slot: Slot }
  | { type: "turn"; slot: Slot; value: number }
  | { type: "key"; slot: Slot; index: number }
  | { type: "wrong"; slot: Slot }
  | { type: "solved"; slot: Slot; id: string }
  | { type: "item"; slot: Slot; item: ItemId }
  | { type: "reveal"; slot: Slot; id: string }
  | { type: "pass"; from: Slot; item: ItemId }
  | { type: "peek"; slot: Slot }
  | { type: "eyes" }
  | { type: "bump"; slot: Slot }
  | { type: "unlocked" }
  | { type: "opened" };

const DIR_X = (v: number) => (v > FLICK ? 1 : v < -FLICK ? -1 : 0);

/**
 * One chapter of Keyhole: two rooms, one shared door, two players who can
 * each only see their own side. Deterministic fixed-step. Which rooms a
 * screen draws, and the peek through the keyhole, are render concerns.
 */
export class World {
  readonly chapter: ChapterData;
  readonly players: [Player, Player];
  /** Per room, per hotspot id. */
  readonly spots: [Record<string, SpotState>, Record<string, SpotState>];
  time = 0;
  unlocked = false;
  opened = false;
  /** Peeks that met; the renderer draws a heart. */
  eyes = 0;
  wrongs = 0;
  private flick: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  private bothPeeking = false;
  private events: WorldEvent[] = [];

  constructor(chapter: ChapterData) {
    this.chapter = chapter;
    const spawn = (slot: Slot): Player => {
      const x = slot === 0 ? 300 : 1300;
      return { x, prevX: x, facing: slot === 0 ? 1 : -1, stride: 0, moving: false, panel: null, cursor: 0, items: [], peek: 0, holding: 0, say: null };
    };
    this.players = [spawn(0), spawn(1)];
    this.spots = [initSpots(chapter.rooms[0].hotspots), initSpots(chapter.rooms[1].hotspots)];
  }

  hotspot(slot: Slot, id: string): Hotspot | undefined {
    return this.chapter.rooms[slot].hotspots.find((h) => h.id === id);
  }

  visible(slot: Slot, h: Hotspot) {
    return !h.hidden || this.spots[slot][h.id].revealed;
  }

  /** The thing a player would use if they pressed Use now. */
  nearest(slot: Slot): Hotspot | null {
    const p = this.players[slot];
    let best: Hotspot | null = null;
    let bestD = Infinity;
    for (const h of this.chapter.rooms[slot].hotspots) {
      if (!this.visible(slot, h)) continue;
      const d = Math.abs(h.x - p.x) - h.w / 2;
      if (d < REACH && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  atDoor(slot: Slot) {
    return this.nearest(slot)?.device.kind === "door";
  }

  step(inputs: [KeyholeInput, KeyholeInput]): WorldEvent[] {
    this.events = [];
    this.time += STEP;
    ([0, 1] as const).forEach((s) => this.stepPlayer(s, inputs[s]));
    this.stepDoor(inputs);
    return this.events;
  }

  // ─── Player ─────────────────────────────────────────────────────────────────

  private stepPlayer(slot: Slot, input: KeyholeInput) {
    const p = this.players[slot];
    p.prevX = p.x;
    p.peek = Math.max(0, p.peek - STEP);
    if (p.say && this.time > p.say.until) p.say = null;

    // Flicks: a stick push counts once until it returns past the deadzone.
    const f = this.flick[slot];
    const fx = DIR_X(input.x);
    const fy = DIR_X(input.y);
    const flickX = fx !== 0 && fx !== f.x ? fx : 0;
    const flickY = fy !== 0 && fy !== f.y ? fy : 0;
    f.x = fx;
    f.y = fy;

    if (this.opened) return;

    if (p.panel) {
      const h = this.hotspot(slot, p.panel)!;
      if (input.back) return this.close(slot);
      this.stepPanel(slot, h, input.use, flickX, flickY);
      return;
    }

    // Walking.
    const walk = Math.abs(input.x) > 0.2 && p.peek <= 0 ? input.x : 0;
    p.x = clamp(p.x + walk * WALK.speed * STEP, WALK.minX, WALK.maxX);
    p.moving = Math.abs(p.x - p.prevX) > 0.01;
    if (p.moving) {
      p.facing = walk > 0 ? 1 : -1;
      p.stride = (p.stride + (Math.abs(walk) * WALK.speed * STEP) / 140) % 1;
    }
    if (input.back && p.peek > 0) p.peek = 0;
    if (input.use) this.use(slot);
  }

  private use(slot: Slot) {
    const p = this.players[slot];
    const h = this.nearest(slot);
    if (!h) return;
    const st = this.spots[slot][h.id];
    const d = h.device;
    switch (d.kind) {
      case "door":
        return this.useDoor(slot);
      case "container":
        if (st.solved) return this.say(slot, "Already open.");
        if (!p.items.includes(d.needs)) {
          this.emit({ type: "bump", slot });
          return this.say(slot, lockedLine(d.needs));
        }
        p.items = p.items.filter((i) => i !== d.needs);
        return this.solve(slot, h);
      case "dials":
      case "sequence":
      case "clock":
        if (st.solved) return this.say(slot, "That's done.");
        return this.openPanel(slot, h);
      case "clue":
        return this.openPanel(slot, h);
    }
  }

  private openPanel(slot: Slot, h: Hotspot) {
    const p = this.players[slot];
    p.panel = h.id;
    p.cursor = 0;
    p.peek = 0;
    this.emit({ type: "open", slot, id: h.id });
  }

  private close(slot: Slot) {
    this.players[slot].panel = null;
    this.emit({ type: "close", slot });
  }

  private stepPanel(slot: Slot, h: Hotspot, use: boolean, fx: number, fy: number) {
    const p = this.players[slot];
    const st = this.spots[slot][h.id];
    const d: Device = h.device;
    if (d.kind === "clue") {
      if (use) this.close(slot);
      return;
    }
    const count = d.kind === "dials" ? d.solution.length : d.kind === "sequence" ? d.keys.length : d.kind === "clock" ? 2 : 0;
    if (fx !== 0 && count > 0) {
      const next = clamp(p.cursor + fx, 0, count - 1);
      if (next !== p.cursor) {
        p.cursor = next;
        this.emit({ type: "cursor", slot });
      }
    }
    if (d.kind === "dials" && fy !== 0) {
      // Up turns forward, like rolling a thumb wheel away from you.
      st.values[p.cursor] = mod(st.values[p.cursor] - fy, SYMBOLS.length);
      this.emit({ type: "turn", slot, value: st.values[p.cursor] });
      if (d.solution.every((s, i) => SYMBOLS[st.values[i]] === s)) this.solve(slot, h);
    } else if (d.kind === "clock" && fy !== 0) {
      if (p.cursor === 0) st.values[0] = mod(st.values[0] - 1 - fy, 12) + 1;
      else st.values[1] = mod(st.values[1] - fy, 4);
      this.emit({ type: "turn", slot, value: st.values[p.cursor] });
      if (st.values[0] === d.solution.h && st.values[1] * 15 === d.solution.m) this.solve(slot, h);
    } else if (d.kind === "sequence" && use) {
      st.entered.push(p.cursor);
      this.emit({ type: "key", slot, index: p.cursor });
      const n = st.entered.length;
      if (st.entered[n - 1] !== d.solution[n - 1]) {
        st.entered = [];
        this.wrongs++;
        this.emit({ type: "wrong", slot });
      } else if (n === d.solution.length) {
        this.solve(slot, h);
      }
    }
  }

  private solve(slot: Slot, h: Hotspot) {
    const p = this.players[slot];
    this.spots[slot][h.id].solved = true;
    if (p.panel === h.id) p.panel = null;
    this.emit({ type: "solved", slot, id: h.id });
    if (h.gives) {
      p.items.push(h.gives);
      this.emit({ type: "item", slot, item: h.gives });
    }
    if (h.reveals) {
      this.spots[slot][h.reveals].revealed = true;
      this.emit({ type: "reveal", slot, id: h.reveals });
    }
    if (!this.unlocked && this.chapter.doorNeeds.every((k) => this.isSolved(k))) {
      this.unlocked = true;
      this.emit({ type: "unlocked" });
    }
  }

  private isSolved(key: string) {
    const [room, id] = key.split(":");
    return this.spots[Number(room) as Slot][id]?.solved ?? false;
  }

  // ─── The door ───────────────────────────────────────────────────────────────

  private useDoor(slot: Slot) {
    const p = this.players[slot];
    const other = this.players[slot === 0 ? 1 : 0];
    if (p.items.length > 0) {
      const item = p.items.pop()!;
      other.items.push(item);
      this.emit({ type: "pass", from: slot, item });
      return;
    }
    if (this.unlocked) return; // holding Use opens it; see stepDoor
    p.peek = PEEK;
    this.emit({ type: "peek", slot });
  }

  private stepDoor(inputs: [KeyholeInput, KeyholeInput]) {
    const peeking = this.players[0].peek > 0 && this.players[1].peek > 0;
    if (peeking && !this.bothPeeking) {
      this.eyes++;
      this.emit({ type: "eyes" });
    }
    this.bothPeeking = peeking;

    if (!this.unlocked || this.opened) return;
    let both = true;
    ([0, 1] as const).forEach((s) => {
      const p = this.players[s];
      const on = inputs[s].a && !p.panel && this.atDoor(s) && p.items.length === 0;
      p.holding = on ? p.holding + STEP : 0;
      if (!on) both = false;
    });
    // Waiting at the door alone keeps your hand on the handle, not the count.
    if (!both) this.players.forEach((p) => (p.holding = Math.min(p.holding, 0.25)));
    if (both && Math.min(this.players[0].holding, this.players[1].holding) >= DOOR_HOLD) {
      this.opened = true;
      this.emit({ type: "opened" });
    }
  }

  private say(slot: Slot, text: string) {
    this.players[slot].say = { text, until: this.time + SAY };
  }

  private emit(e: WorldEvent) {
    this.events.push(e);
  }
}

function initSpots(hotspots: Hotspot[]): Record<string, SpotState> {
  const out: Record<string, SpotState> = {};
  for (const h of hotspots) {
    const d = h.device;
    let values: number[] = [];
    // Start every dial away from its answer so nothing opens by accident.
    if (d.kind === "dials") values = d.solution.map((s, i) => mod(SYMBOLS.indexOf(s as SymbolId) + 3 + i * 2, SYMBOLS.length));
    if (d.kind === "clock") values = [mod(d.solution.h + 4, 12) + 1, mod(d.solution.m / 15 + 2, 4)];
    out[h.id] = { solved: false, revealed: false, values, entered: [] };
  }
  return out;
}

const lockedLine = (item: ItemId) =>
  item === "brass-key" ? "Locked. It needs a key." : item === "seeds" ? "Just soil. Something should grow here." : "An empty mount. Something round goes here.";

const mod = (v: number, n: number) => ((v % n) + n) % n;

/** Doubles as "is this room on the left" — room 0's door is on its right. */
export const doorSide = (slot: Slot) => (slot === 0 ? 1 : -1);
