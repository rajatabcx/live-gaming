import { Emitter } from "./emitter";
import { randomId } from "./ids";
import { dial, type Link, type LinkMode } from "./link";
import {
  PROTOCOL_VERSION,
  isHostMessage,
  type ControllerLayout,
  type ControllerMessage,
  type InputState,
  type PlayerInfo,
} from "./protocol";
import { Signaling } from "./signaling";

export type ControllerStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "room-not-found"
  | "room-full"
  | "outdated";

type ControllerEvents = {
  status: ControllerStatus;
  /** `player` is null when a screen joined a full room as an audience. */
  welcome: { player: PlayerInfo | null; gameId: string | null };
  layout: { layout: ControllerLayout; caption?: string };
  rtt: number;
  mode: LinkMode;
  // Screens only ↓
  lobby: { players: PlayerInfo[]; gameId: string | null };
  frame: unknown;
  state: unknown;
};

export interface ControllerOptions {
  /** Join as a remote screen: receive the lobby and a mirror of the game. */
  screen?: boolean;
}

const CLIENT_ID_KEY = "duet.clientId";
const PING_INTERVAL_MS = 2000;
const NOT_FOUND_AFTER_MS = 8000;
const MAX_RETRY_DELAY_MS = 5000;
/** Broadcast relay has per-second limits; WebRTC doesn't. */
const RELAY_INPUT_INTERVAL_MS = 50;

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
 * The joining side of a room — a phone, or a partner's laptop far away
 * (`screen: true`), which also gets the lobby and a live mirror of the game
 * and satisfies the games' `ScreenFeed`. Finds the host via Supabase presence,
 * opens a link (WebRTC, or relay fallback), then sends input and receives layout/haptics.
 * Input is coalesced to one send per animation frame and sent as whole
 * snapshots with a sequence number, so the host can drop stale ones.
 */
export class ControllerClient extends Emitter<ControllerEvents> {
  private readonly selfId = randomId(8);
  private sig: Signaling | null = null;
  private link: Link | null = null;
  private dialing = false;
  private seq = 0;
  private pending: InputState | null = null;
  private flushScheduled = false;
  private lastSentAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private notFoundTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private destroyed = false;
  private terminal = false;
  status: ControllerStatus = "connecting";
  /** Last HUD state the host sent (screens). */
  lastState: unknown = undefined;

  constructor(
    readonly code: string,
    private name: string,
    private options: ControllerOptions = {},
  ) {
    super();
  }

  /** A remote screen's HUD button. */
  command(name: string): void {
    this.send({ t: "command", name });
  }

  start(): void {
    const sig = new Signaling(this.code, this.selfId, "controller");
    this.sig = sig;
    sig.on("presence", () => this.maybeDial());
    sig.on("status", (s) => s === "lost" && !this.link?.open && this.setStatus("reconnecting"));
    sig.join();
    this.armNotFound();
  }

  sendInput(state: InputState): void {
    this.pending = state;
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    const flush = () => {
      if (this.link?.mode === "relay" && performance.now() - this.lastSentAt < RELAY_INPUT_INTERVAL_MS) {
        requestAnimationFrame(flush);
        return;
      }
      this.flushScheduled = false;
      if (!this.pending) return;
      this.lastSentAt = performance.now();
      this.send({ t: "input", seq: ++this.seq, s: this.pending });
      this.pending = null;
    };
    requestAnimationFrame(flush);
  }

  /** User asked to try again after a terminal state. */
  retry(): void {
    this.terminal = false;
    this.retries = 0;
    this.setStatus("connecting");
    this.armNotFound();
    this.maybeDial();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.notFoundTimer) clearTimeout(this.notFoundTimer);
    if (this.link) this.sig?.send({ kind: "bye", from: this.selfId, to: this.link.peerId });
    this.link?.close();
    this.sig?.leave();
    this.clearListeners();
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private send(msg: ControllerMessage) {
    if (this.link?.open) this.link.send(msg);
  }

  private setStatus(status: ControllerStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }

  private armNotFound() {
    if (this.notFoundTimer) clearTimeout(this.notFoundTimer);
    this.notFoundTimer = setTimeout(() => {
      if (!this.link?.open && !this.terminal) this.setStatus("room-not-found");
    }, NOT_FOUND_AFTER_MS);
  }

  /** The host that owns the code is the oldest one present. */
  private host() {
    return this.sig?.peersWithRole("host")[0] ?? null;
  }

  private async maybeDial() {
    if (this.destroyed || this.terminal || this.dialing || this.link?.open) return;
    const host = this.host();
    if (!host || !this.sig) return;

    this.dialing = true;
    try {
      // `?relay` on the controller URL skips WebRTC — for testing the fallback path.
      const forceRelay = new URLSearchParams(location.search).has("relay");
      const link = await dial(this.sig, host.id, { forceRelay });
      if (this.destroyed) return link.close();
      this.attach(link);
    } finally {
      this.dialing = false;
    }
  }

  private attach(link: Link) {
    this.link = link;
    this.emit("mode", link.mode);
    link.on("message", (raw) => this.onMessage(raw));
    link.on("close", () => {
      if (this.link !== link) return;
      this.link = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.destroyed || this.terminal) return;
      this.setStatus("reconnecting");
      const delay = Math.min(500 * 2 ** this.retries++, MAX_RETRY_DELAY_MS);
      setTimeout(() => this.maybeDial(), delay);
    });
    this.send({ t: "hello", v: PROTOCOL_VERSION, clientId: clientId(), name: this.name, screen: this.options.screen });
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send({ t: "ping", at: performance.now() }), PING_INTERVAL_MS);
  }

  private onMessage(raw: unknown) {
    if (!isHostMessage(raw)) return;
    switch (raw.t) {
      case "welcome":
        this.retries = 0;
        if (this.notFoundTimer) clearTimeout(this.notFoundTimer);
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
      case "lobby":
        if (raw.gameId === null) this.lastState = undefined;
        this.emit("lobby", { players: raw.players, gameId: raw.gameId });
        break;
      case "frame":
        this.emit("frame", raw.f);
        break;
      case "state":
        this.lastState = raw.s;
        this.emit("state", raw.s);
        break;
    }
  }
}
