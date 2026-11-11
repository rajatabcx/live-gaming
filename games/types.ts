import type { ComponentType } from "react";
import type { ControllerLayout, InputState, PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";

export type GameMood = "co-op" | "versus" | "chill" | "talk";

export type GameButton = "a" | "b";
export interface ButtonEdge {
  playerId: string;
  button: GameButton;
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
}

/** Props every game's host-screen component receives from the room. */
export interface GameProps {
  room: GameRoom;
  players: PlayerInfo[];
  /** Return to the lobby. */
  onExit: () => void;
}

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
