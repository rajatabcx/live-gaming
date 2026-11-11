/**
 * Wire protocol between the host screen and everyone who joins it:
 *  - phones (controllers): send input, receive layout + haptics
 *  - remote screens (a partner's laptop, long-distance): also receive the
 *    lobby and a live mirror of the running game, and may send HUD commands.
 * Everything that crosses the data channel is defined here, nowhere else.
 */

export const PROTOCOL_VERSION = 2;

/** Normalised controller state. Sent whole (idempotent), so dropped frames don't matter. */
export interface InputState {
  /** Stick, each axis in [-1, 1]. y is positive downward (screen space). */
  x: number;
  y: number;
  a: boolean;
  b: boolean;
}

export const NEUTRAL_INPUT: InputState = { x: 0, y: 0, a: false, b: false };

export type PlayerSlot = 0 | 1;

export interface PlayerInfo {
  id: string;
  slot: PlayerSlot;
  name: string;
  connected: boolean;
}

/** What the phone should show. Games pick a layout; the controller renders it. */
export type ControllerLayout =
  | { kind: "lobby" }
  | { kind: "stick+buttons"; a?: string; b?: string }
  | { kind: "buttons"; a: string; b?: string };

// ─── phone → host ────────────────────────────────────────────────────────────

export type ControllerMessage =
  /** `screen`: this peer wants the game mirrored to it (a laptop far away), not just a gamepad. */
  | { t: "hello"; v: number; clientId: string; name: string; screen?: boolean }
  | { t: "input"; seq: number; s: InputState }
  | { t: "ping"; at: number }
  /** A HUD button pressed on a remote screen ("advance", "exit", …). Games decide what they accept. */
  | { t: "command"; name: string };

// ─── host → phone ────────────────────────────────────────────────────────────

export type HostMessage =
  /** `player` is null for a screen that joined a full room: it watches, it doesn't play. */
  | { t: "welcome"; player: PlayerInfo | null; gameId: string | null }
  | { t: "rejected"; reason: "full" | "version" }
  | { t: "layout"; layout: ControllerLayout; caption?: string }
  | { t: "haptic"; pattern: number | number[] }
  | { t: "pong"; at: number }
  // Screens only ↓
  | { t: "lobby"; players: PlayerInfo[]; gameId: string | null }
  /** Latest-wins game frame. Sent lossy; opaque to the transport, typed by each game. */
  | { t: "frame"; f: unknown }
  /** The game's HUD state. Reliable, and re-sent to screens that join mid-game. */
  | { t: "state"; s: unknown };

const hasTag = (data: unknown): boolean =>
  typeof data === "object" && data !== null && typeof (data as { t?: unknown }).t === "string";

// Shape check only — the tag is switched on exhaustively by the receiver.
export const isControllerMessage = (data: unknown): data is ControllerMessage => hasTag(data);
export const isHostMessage = (data: unknown): data is HostMessage => hasTag(data);
