import type { ComponentType } from "react";
import type { HostRoom } from "@/lib/realtime/host-room";
import type { PlayerInfo } from "@/lib/realtime/protocol";

export type GameMood = "co-op" | "versus" | "chill" | "talk";

/** Props every game's host-screen component receives from the room. */
export interface GameProps {
  /** Poll `room.inputForSlot(slot)` each frame; subscribe to `press` for edges. */
  room: HostRoom;
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
