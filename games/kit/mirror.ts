import type { GameRoom, ScreenChannel, ScreenFeed } from "../types";
import { lerp } from "./math";

/**
 * Long-distance play, game side.
 *
 * The host's session stays the only simulation. About 30 times a second it
 * publishes a frame: a snapshot of what its renderer reads, the renderer's
 * frame options, and the sim events since the last frame. A remote screen
 * buffers frames and plays them back slightly in the past, so it can always
 * interpolate between two real frames (classic snapshot interpolation) and
 * fire each event's sound and particles at the moment it happened.
 *
 * Frames travel lossy. Snapshots are level-triggered (they say which level is
 * loaded, never "load level 2"), and every frame repeats the last few frames'
 * events, so a dropped frame costs nothing but a little smoothness.
 */

export interface MirrorFrame<W, O, E> {
  seq: number;
  /** Host clock, ms. */
  at: number;
  world: W;
  opts: O;
  /** Recent event batches, oldest first — repeated across frames for loss tolerance. */
  events: EventBatch<E>[];
}

interface EventBatch<E> {
  seq: number;
  at: number;
  list: E[];
}

const FRAME_INTERVAL_MS = 1000 / 30;
/** How far back each frame repeats events. Covers relay thinning (every ~3rd frame) plus a drop. */
const EVENT_WINDOW = 10;

// ─── Host side ──────────────────────────────────────────────────────────────

export class FramePublisher<W, O, E> {
  private seq = 0;
  private lastAt = -Infinity;
  private pending: E[] = [];
  private recent: EventBatch<E>[] = [];

  constructor(private screens: ScreenChannel) {}

  /** Sim events, as they happen. Dropped when nobody's watching. */
  events(list: readonly E[]) {
    if (this.screens.watching) this.pending.push(...list);
  }

  /** Call once per rendered frame; builds a snapshot only when one is due and someone's watching. */
  publish(now: number, build: () => { world: W; opts: O }) {
    if (!this.screens.watching) {
      this.pending.length = 0;
      this.recent.length = 0;
      return;
    }
    if (now - this.lastAt < FRAME_INTERVAL_MS) return;
    this.lastAt = now;
    const seq = ++this.seq;
    if (this.pending.length) this.recent.push({ seq, at: now, list: this.pending.splice(0) });
    while (this.recent.length && this.recent[0].seq <= seq - EVENT_WINDOW) this.recent.shift();
    const { world, opts } = build();
    this.screens.frame(quantize({ seq, at: now, world, opts, events: this.recent } satisfies MirrorFrame<W, O, E>));
  }
}

/** Forward HUD state to screens whenever it changes. `local` keys (mute, …) stay on each machine. */
export function shareHud<T extends object>(
  screens: ScreenChannel,
  store: { subscribe(fn: () => void): () => void; get(): T },
  local: readonly (keyof T)[],
): () => void {
  const send = () => {
    if (!screens.watching) return;
    const state = { ...store.get() };
    for (const k of local) delete state[k];
    screens.state(state);
  };
  send();
  // A screen that joins mid-game is caught up by the room from the last state sent,
  // so send once whenever someone starts watching even if nothing changed.
  let wasWatching = screens.watching;
  const poll = setInterval(() => {
    if (screens.watching && !wasWatching) send();
    wasWatching = screens.watching;
  }, 500);
  const off = store.subscribe(send);
  return () => {
    clearInterval(poll);
    off();
  };
}

// ─── Screen side ────────────────────────────────────────────────────────────

export interface Sample<W, O, E> {
  from: MirrorFrame<W, O, E>;
  to: MirrorFrame<W, O, E>;
  /** 0..1 between `from` and `to`. */
  t: number;
  /** Events whose moment has just been reached, in order. */
  events: E[];
}

const isFrame = (f: unknown): f is MirrorFrame<unknown, unknown, unknown> =>
  typeof f === "object" && f !== null && typeof (f as { seq?: unknown }).seq === "number" && typeof (f as { at?: unknown }).at === "number";

/**
 * Jitter buffer + playback clock for a remote screen. Tracks the host clock
 * from frame arrival times and renders `delay` behind it, where `delay`
 * adapts to how often frames actually arrive (≈30/s direct, ≈10/s relayed).
 */
export class FrameFollower<W, O, E> {
  private frames: MirrorFrame<W, O, E>[] = [];
  /** host clock − local clock, minus the fastest delivery seen. */
  private offset: number | null = null;
  private spacing = FRAME_INTERVAL_MS;
  private firedSeq = 0;
  private off: () => void;

  constructor(feed: ScreenFeed) {
    this.off = feed.on("frame", (f) => {
      if (isFrame(f)) this.push(f as MirrorFrame<W, O, E>, performance.now());
    });
  }

  dispose() {
    this.off();
  }

  private push(f: MirrorFrame<W, O, E>, now: number) {
    const last = this.frames.at(-1);
    if (last && f.seq <= last.seq) return; // reordered or duplicate: newer already here
    if (last) this.spacing = lerp(this.spacing, Math.min(500, f.at - last.at), 0.1);
    if (last && f.seq - last.seq > 60) this.offset = null; // host restarted its clock / long gap
    const est = f.at - now;
    this.offset = this.offset === null || est > this.offset ? est : this.offset + (est - this.offset) * 0.01;
    this.frames.push(f);
    if (this.frames.length > 40) this.frames.shift();
  }

  sample(now: number): Sample<W, O, E> | null {
    if (!this.frames.length || this.offset === null) return null;
    const delay = Math.min(450, this.spacing * 1.7 + 25);
    const target = now + this.offset - delay;
    while (this.frames.length > 2 && this.frames[1].at <= target) this.frames.shift();

    const from = this.frames[0];
    const to = this.frames[1] ?? from;
    const t = to === from ? 1 : Math.max(0, Math.min(1, (target - from.at) / (to.at - from.at)));

    const events: E[] = [];
    const due = this.frames.at(-1)!.events;
    for (const batch of due) {
      if (batch.seq <= this.firedSeq || batch.at > target) continue;
      events.push(...batch.list);
      this.firedSeq = batch.seq;
    }
    return { from, to, t, events };
  }
}

/** Interpolate the numeric fields of flat option bags (fade, dawn, …); others snap to `b`. */
export function lerpNumbers<O extends object>(a: O, b: O, t: number): O {
  const out = { ...b };
  for (const k in b) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === "number" && typeof vb === "number") (out as Record<string, unknown>)[k] = lerp(va, vb, t);
  }
  return out;
}

/** Round every number to 3 decimals: frames shrink by more than half and nothing visible changes. */
function quantize<T>(value: T): T {
  if (typeof value === "number") return (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value) as T;
  if (Array.isArray(value)) return value.map(quantize) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = quantize(v);
    return out as T;
  }
  return value;
}

/** A room that ignores everything — what a remote screen's session talks to. */
export const INERT_ROOM: GameRoom = {
  inputForSlot: () => ({ x: 0, y: 0, a: false, b: false }),
  on: () => () => {},
  setLayout() {},
  setLayoutFor() {},
  haptic() {},
  screens: { watching: false, frame() {}, state() {}, on: () => () => {} },
};
