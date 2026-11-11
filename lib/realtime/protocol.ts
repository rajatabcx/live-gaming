/**
 * Wire protocol between the host screen and phone controllers.
 * Everything that crosses the data channel is defined here, nowhere else.
 */

export const PROTOCOL_VERSION = 1;

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
  | { t: "hello"; v: number; clientId: string; name: string }
  | { t: "input"; seq: number; s: InputState }
  | { t: "ping"; at: number };

// ─── host → phone ────────────────────────────────────────────────────────────

export type HostMessage =
  | { t: "welcome"; player: PlayerInfo; gameId: string | null }
  | { t: "rejected"; reason: "full" | "version" }
  | { t: "layout"; layout: ControllerLayout; caption?: string }
  | { t: "haptic"; pattern: number | number[] }
  | { t: "pong"; at: number };

const hasTag = (data: unknown): boolean =>
  typeof data === "object" && data !== null && typeof (data as { t?: unknown }).t === "string";

// Shape check only — the tag is switched on exhaustively by the receiver.
export const isControllerMessage = (data: unknown): data is ControllerMessage => hasTag(data);
export const isHostMessage = (data: unknown): data is HostMessage => hasTag(data);
