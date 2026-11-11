import type { PeerOptions } from "peerjs";

/**
 * Peer IDs live in a global namespace on the signaling broker, so we prefix them.
 * Bump the version segment if the protocol changes incompatibly.
 */
const NAMESPACE = "duet-v1";

export const hostPeerId = (roomCode: string) => `${NAMESPACE}-${roomCode.toLowerCase()}`;

/**
 * Signaling broker + ICE servers. Defaults to the public PeerJS cloud broker and
 * Google STUN; override with NEXT_PUBLIC_PEER_* env vars to self-host the broker.
 * Media never flows through the broker — only the WebRTC handshake does.
 */
export function peerOptions(): PeerOptions {
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  return {
    ...(host
      ? {
          host,
          port: Number(process.env.NEXT_PUBLIC_PEER_PORT ?? 443),
          path: process.env.NEXT_PUBLIC_PEER_PATH ?? "/",
          secure: true,
        }
      : {}),
    debug: 0,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    },
  };
}

/** PeerJS touches `window` at import time, so load it lazily on the client only. */
export async function loadPeer() {
  const mod = await import("peerjs");
  return mod.Peer;
}
