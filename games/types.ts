import type { ComponentType } from "react";
import type { ControllerLayout, InputState, PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";

export type GameMood = "co-op" | "versus" | "chill" | "talk";

export type GameButton = "a" | "b";
export interface ButtonEdge {
  playerId: string;
  button: GameButton;
}

export interface ScreenCommand {
  playerId: string | null;
  name: string;
}

/**
 * The host side of long-distance play: what a partner's remote screen sees.
 * Games publish a compact frame of whatever their renderer needs; the room
 * fans it out (throttled per link) to every watching screen.
 */
export interface ScreenChannel {
  /** True while at least one remote screen is connected — skip building frames otherwise. */
  readonly watching: boolean;
  /** Latest-wins, may drop. */
  frame(f: unknown): void;
  /** HUD state. Reliable; remembered and re-sent to screens that join mid-game. */
  state(s: unknown): void;
  /** HUD buttons pressed on a remote screen. */
  on(event: "command", fn: (c: ScreenCommand) => void): () => void;
}

export interface ScreenFeedEvents {
  frame: unknown;
  state: unknown;
}

/** A remote screen's view of the game the host is running. */
export interface ScreenFeed {
  on<K extends keyof ScreenFeedEvents>(event: K, fn: (payload: ScreenFeedEvents[K]) => void): () => void;
  /** Last HUD state received, so a game that mounts late starts from it. */
  readonly lastState: unknown;
  /** Ask the host to run a HUD command. */
  command(name: string): void;
}

/**
 * The slice of a room a game may touch. `HostRoom` satisfies it structurally;
 * so does the keyboard room used for local playtesting. Games never see the transport.
 */
export interface GameRoom {
  /** Latest input snapshot for a seat — poll once per simulation step. */
  inputForSlot(slot: PlayerSlot): InputState;
  /** Button edges, delivered as they arrive (taps shorter than a frame still register). */
  on(event: "press" | "release", fn: (edge: ButtonEdge) => void): () => void;
  /** What the phones should show. Remembered and re-sent to late joiners. */
  setLayout(layout: ControllerLayout, caption?: string): void;
  haptic(playerId: string, pattern: number | number[]): void;
  /** Remote screens watching this room. */
  readonly screens: ScreenChannel;
}

/**
 * Where a game runs. The host simulates; a remote screen only draws what the
 * host sends and forwards HUD commands — it never runs game logic.
 */
export type GameSource = { role: "host"; room: GameRoom } | { role: "screen"; feed: ScreenFeed };

/** The identity a game's session should be rebuilt on (stable across re-renders). */
export const sourceTarget = (s: GameSource): GameRoom | ScreenFeed => (s.role === "host" ? s.room : s.feed);
export const toSource = (t: GameRoom | ScreenFeed): GameSource =>
  "inputForSlot" in t ? { role: "host", room: t } : { role: "screen", feed: t };

/** Props every game component receives. */
export type GameProps = GameSource & {
  players: PlayerInfo[];
  /** Return to the lobby. */
  onExit: () => void;
};

export interface GameDefinition {
  id: string;
  title: string;
  tagline: string;
  description: string;
  mood: GameMood;
  minutes: string;
  /** Two CSS colors used for the card art gradient. */
  palette: [string, string];
  /** Lazily loaded so the landing page never ships game code. */
  load?: () => Promise<{ default: ComponentType<GameProps> }>;
}

export const isPlayable = (g: GameDefinition) => g.load !== undefined;
