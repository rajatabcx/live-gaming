import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { Emitter } from "./emitter";
import { roomTopic } from "./ids";

export type Role = "host" | "controller";

/** Everything that travels over the Supabase channel. `to` targets one peer. */
export type Envelope =
  | { kind: "offer" | "answer"; from: string; to: string; sdp: string }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: "relay"; from: string; to: string; data: unknown }
  | { kind: "bye"; from: string; to: string };

export interface PeerPresence {
  id: string;
  role: Role;
  since: number;
}

type SignalingEvents = {
  envelope: Envelope;
  presence: PeerPresence[];
  status: "joined" | "lost";
  left: string;
};

const EVENT = "signal";

/**
 * A room's Supabase Realtime channel: presence (who's here) + addressed
 * broadcast messages (WebRTC handshake, and the relay fallback).
 * Media/game data normally flows peer-to-peer; this is only the meeting point.
 */
export class Signaling extends Emitter<SignalingEvents> {
  private channel: RealtimeChannel | null = null;
  readonly joinedAt = Date.now();
  peers: PeerPresence[] = [];

  constructor(
    readonly code: string,
    readonly selfId: string,
    readonly role: Role,
  ) {
    super();
  }

  join(): void {
    const ch = supabase().channel(roomTopic(this.code), {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.selfId } },
    });
    this.channel = ch;

    ch.on("broadcast", { event: EVENT }, ({ payload }) => {
      const env = payload as Envelope;
      if (env?.to === this.selfId) this.emit("envelope", env);
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PeerPresence>();
      this.peers = Object.values(state)
        .map((metas) => metas[0])
        .filter((p): p is PeerPresence & { presence_ref: string } => !!p && p.id !== this.selfId);
      this.emit("presence", this.peers);
    });
    ch.on("presence", { event: "leave" }, ({ key }) => this.emit("left", key));

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        ch.track({ id: this.selfId, role: this.role, since: this.joinedAt } satisfies PeerPresence);
        this.emit("status", "joined");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        this.emit("status", "lost"); // supabase-js rejoins on its own
      }
    });
  }

  send(env: Envelope): void {
    this.channel?.send({ type: "broadcast", event: EVENT, payload: env });
  }

  /** Other peers with the given role, oldest first. */
  peersWithRole(role: Role): PeerPresence[] {
    return this.peers.filter((p) => p.role === role).sort((a, b) => a.since - b.since);
  }

  leave(): void {
    const ch = this.channel;
    this.channel = null;
    if (ch) {
      ch.untrack().catch(() => {});
      supabase().removeChannel(ch);
    }
    this.clearListeners();
  }
}
