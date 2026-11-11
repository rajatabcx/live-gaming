import type { DataConnection, Peer } from "peerjs";
import { Emitter } from "./emitter";
import { hostPeerId, loadPeer, peerOptions } from "./peer-config";
import {
  PROTOCOL_VERSION,
  isHostMessage,
  type ControllerLayout,
  type ControllerMessage,
  type InputState,
  type PlayerInfo,
} from "./protocol";

export type ControllerStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "room-not-found"
  | "room-full"
  | "outdated";

type ControllerEvents = {
  status: ControllerStatus;
  welcome: { player: PlayerInfo; gameId: string | null };
  layout: { layout: ControllerLayout; caption?: string };
  rtt: number;
};

const CLIENT_ID_KEY = "duet.clientId";
const PING_INTERVAL_MS = 2000;
const MAX_RETRY_DELAY_MS = 5000;

/** randomUUID needs a secure context; LAN dev over http doesn't have one. */
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable per-device id so reconnecting reclaims the same seat. */
function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

/**
 * The phone side of a room. Sends input, receives layout/haptics.
 * Input is coalesced to one send per animation frame and sent as whole
 * snapshots with a sequence number, so the host can drop stale ones.
 */
export class ControllerClient extends Emitter<ControllerEvents> {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private seq = 0;
  private pending: InputState | null = null;
  private flushScheduled = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retries = 0;
  private destroyed = false;
  private terminal = false;
  status: ControllerStatus = "connecting";

  constructor(
    readonly code: string,
    private name: string,
  ) {
    super();
  }

  async start(): Promise<void> {
    const PeerCtor = await loadPeer();
    if (this.destroyed) return;
    const peer = new PeerCtor(peerOptions());
    this.peer = peer;

    peer.on("open", () => this.dial());
    peer.on("disconnected", () => !this.destroyed && peer.reconnect());
    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") {
        // Host isn't up (yet). Keep trying for a bit — they may be refreshing.
        if (this.retries >= 4) this.setStatus("room-not-found");
        this.scheduleRetry();
      } else if (err.type === "network" || err.type === "socket-closed" || err.type === "server-error") {
        this.setStatus("reconnecting");
      } else {
        console.error("[controller]", err.type, err);
      }
    });
  }

  sendInput(state: InputState): void {
    this.pending = state;
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    requestAnimationFrame(() => {
      this.flushScheduled = false;
      if (!this.pending) return;
      this.send({ t: "input", seq: ++this.seq, s: this.pending });
      this.pending = null;
    });
  }

  /** User asked to try again after a terminal state. */
  retry(): void {
    this.terminal = false;
    this.retries = 0;
    this.setStatus("connecting");
    this.dial();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.conn?.close();
    this.peer?.destroy();
    this.clearListeners();
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private send(msg: ControllerMessage) {
    if (this.conn?.open) this.conn.send(msg);
  }

  private setStatus(status: ControllerStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }

  private dial() {
    if (!this.peer || this.destroyed || this.terminal) return;
    this.conn?.close();
    const conn = this.peer.connect(hostPeerId(this.code), {
      reliable: true,
      serialization: "json",
    });
    this.conn = conn;

    conn.on("open", () => {
      this.retries = 0;
      this.send({ t: "hello", v: PROTOCOL_VERSION, clientId: clientId(), name: this.name });
      this.startPing();
    });

    conn.on("data", (raw) => {
      if (!isHostMessage(raw)) return;
      switch (raw.t) {
        case "welcome":
          this.setStatus("connected");
          this.emit("welcome", { player: raw.player, gameId: raw.gameId });
          break;
        case "rejected":
          this.terminal = true;
          this.setStatus(raw.reason === "full" ? "room-full" : "outdated");
          break;
        case "layout":
          this.emit("layout", { layout: raw.layout, caption: raw.caption });
          break;
        case "haptic":
          navigator.vibrate?.(raw.pattern);
          break;
        case "pong":
          this.emit("rtt", performance.now() - raw.at);
          break;
      }
    });

    conn.on("close", () => {
      if (this.conn !== conn || this.destroyed || this.terminal) return;
      this.setStatus("reconnecting");
      this.scheduleRetry();
    });
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send({ t: "ping", at: performance.now() }), PING_INTERVAL_MS);
  }

  private scheduleRetry() {
    if (this.destroyed || this.terminal) return;
    const delay = Math.min(500 * 2 ** this.retries++, MAX_RETRY_DELAY_MS);
    setTimeout(() => this.dial(), delay);
  }
}
