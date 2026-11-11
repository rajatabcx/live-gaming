import type { ScreenChannel, ScreenCommand } from "@/games/types";
import { Emitter } from "./emitter";
import { randomId } from "./ids";
import { LinkAcceptor, type Link } from "./link";
import {
  NEUTRAL_INPUT,
  PROTOCOL_VERSION,
  isControllerMessage,
  type ControllerLayout,
  type HostMessage,
  type InputState,
  type PlayerInfo,
  type PlayerSlot,
} from "./protocol";
import { Signaling } from "./signaling";

export type HostStatus = "starting" | "open" | "reconnecting" | "code-taken" | "error";
export type Button = "a" | "b";

type HostEvents = {
  status: HostStatus;
  players: PlayerInfo[];
  press: { playerId: string; button: Button };
  release: { playerId: string; button: Button };
};

interface Seat {
  info: PlayerInfo;
  conn: Link | null;
  input: InputState;
  lastSeq: number;
  /** A remote screen holds this seat: it gets the lobby and game frames too. */
  screen: boolean;
  /** Played on the host's own keyboard/gamepad; no link at all. */
  local: boolean;
}

const MAX_PLAYERS = 2;
const LOCAL_ID = "local";
/** Supabase broadcast has per-second limits; WebRTC gets every frame. */
const RELAY_FRAME_INTERVAL_MS = 100;
/** After a reload the old tab's presence can linger briefly; only an older host that sticks around wins. */
const TAKEN_GRACE_MS = 3000;
const SLOTS: PlayerSlot[] = [0, 1];

/**
 * The authoritative side of a room. Runs on the big screen.
 *
 * - Owns seats (two of them). A phone keeps its seat across reconnects via a
 *   persistent clientId, so a locked screen doesn't kick someone out.
 * - Keeps the latest input snapshot per player for games to poll each frame,
 *   and emits press/release edges for event-style handling.
 * - Transport: Supabase channel for meeting + WebRTC (or relay) links per phone.
 */
export class HostRoom extends Emitter<HostEvents> {
  readonly selfId = randomId(8);
  private sig: Signaling | null = null;
  private acceptor: LinkAcceptor | null = null;
  private seats = new Map<string, Seat>();
  /** Screens that joined a full room: they watch, they don't play. Keyed by clientId. */
  private spectators = new Map<string, Link>();
  readonly screens = new ScreenHub(() => this.screenLinks());
  private layout: { layout: ControllerLayout; caption?: string } = { layout: { kind: "lobby" } };
  private gameId: string | null = null;
  private destroyed = false;
  private takenTimer: ReturnType<typeof setTimeout> | null = null;
  status: HostStatus = "starting";

  constructor(readonly code: string) {
    super();
  }

  start(): void {
    if (this.destroyed) return;
    const sig = new Signaling(this.code, this.selfId, "host");
    this.sig = sig;
    this.acceptor = new LinkAcceptor(sig, (link) => this.accept(link));

    sig.on("status", (s) => {
      if (this.status === "code-taken") return;
      this.setStatus(s === "joined" ? "open" : "reconnecting");
    });
    sig.on("presence", () => this.checkForOtherHost());
    sig.join();
  }

  /** Two screens on one code: the one that was there first keeps it. */
  private checkForOtherHost() {
    const older = this.sig?.peersWithRole("host").some((h) => h.since < this.sig!.joinedAt);
    if (!older) {
      if (this.takenTimer) clearTimeout(this.takenTimer);
      this.takenTimer = null;
      return;
    }
    this.takenTimer ??= setTimeout(() => {
      if (this.sig?.peersWithRole("host").some((h) => h.since < this.sig!.joinedAt)) this.setStatus("code-taken");
    }, TAKEN_GRACE_MS);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  get players(): PlayerInfo[] {
    return [...this.seats.values()].map((s) => s.info).sort((a, b) => a.slot - b.slot);
  }

  /** Latest input for a player. Cheap; call every frame. */
  input(playerId: string): InputState {
    return this.seats.get(playerId)?.input ?? NEUTRAL_INPUT;
  }

  inputForSlot(slot: PlayerSlot): InputState {
    for (const seat of this.seats.values()) if (seat.info.slot === slot) return seat.input;
    return NEUTRAL_INPUT;
  }

  // ─── Commands ──────────────────────────────────────────────────────────────

  setGame(gameId: string | null): void {
    this.gameId = gameId;
    this.screens.reset();
    this.sendLobby();
  }

  /** Seat a player on this machine (long-distance: the host plays too). */
  joinLocal(name: string): PlayerInfo | null {
    const existing = this.seats.get(LOCAL_ID);
    if (existing) {
      existing.info = { ...existing.info, name };
    } else {
      const seat = this.claimSeat(LOCAL_ID, name, null);
      if (!seat) return null;
      seat.local = true;
    }
    this.emitPlayers();
    return this.seats.get(LOCAL_ID)!.info;
  }

  leaveLocal(): void {
    const seat = this.seats.get(LOCAL_ID);
    if (!seat) return;
    this.applyInput(seat, NEUTRAL_INPUT);
    this.seats.delete(LOCAL_ID);
    this.emitPlayers();
  }

  setLocalInput(state: InputState): void {
    const seat = this.seats.get(LOCAL_ID);
    if (seat) this.applyInput(seat, state);
  }

  get localPlayer(): PlayerInfo | null {
    return this.seats.get(LOCAL_ID)?.info ?? null;
  }

  /** Change what every phone shows. Remembered and re-sent to late joiners. */
  setLayout(layout: ControllerLayout, caption?: string): void {
    this.layout = { layout, caption };
    this.broadcast({ t: "layout", ...this.layout });
  }

  haptic(playerId: string, pattern: number | number[]): void {
    this.send(playerId, { t: "haptic", pattern });
  }

  send(playerId: string, msg: HostMessage): void {
    const conn = this.seats.get(playerId)?.conn;
    if (conn?.open) conn.send(msg);
  }

  /** How each phone is connected — handy for a debug overlay. */
  linkMode(playerId: string) {
    return this.seats.get(playerId)?.conn?.mode ?? null;
  }

  broadcast(msg: HostMessage): void {
    for (const seat of this.seats.values()) if (seat.conn?.open) seat.conn.send(msg);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.takenTimer) clearTimeout(this.takenTimer);
    const links = [...[...this.seats.values()].map((s) => s.conn), ...this.spectators.values()];
    for (const conn of links) {
      if (!conn) continue;
      this.sig?.send({ kind: "bye", from: this.selfId, to: conn.peerId });
      conn.close();
    }
    this.screens.dispose();
    this.acceptor?.dispose();
    this.sig?.leave();
    this.clearListeners();
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private setStatus(status: HostStatus) {
    this.status = status;
    this.emit("status", status);
  }

  private emitPlayers() {
    this.emit("players", this.players);
    this.sendLobby();
  }

  private screenLinks(): Link[] {
    const links: Link[] = [...this.spectators.values()];
    for (const seat of this.seats.values()) if (seat.screen && seat.conn) links.push(seat.conn);
    return links.filter((l) => l.open);
  }

  private sendLobby() {
    const msg: HostMessage = { t: "lobby", players: this.players, gameId: this.gameId };
    for (const link of this.screenLinks()) link.send(msg);
  }

  /** Everything a screen needs to catch up: who's here, what's running, the HUD. */
  private greetScreen(conn: Link) {
    conn.send({ t: "lobby", players: this.players, gameId: this.gameId } satisfies HostMessage);
    const state = this.screens.lastState;
    if (state !== undefined) conn.send({ t: "state", s: state } satisfies HostMessage);
  }

  private accept(conn: Link) {
    let seat: Seat | null = null;
    let spectating: string | null = null;

    conn.on("message", (raw) => {
      if (!isControllerMessage(raw)) return;
      const msg = raw;

      if (msg.t === "hello") {
        if (msg.v !== PROTOCOL_VERSION) {
          conn.send({ t: "rejected", reason: "version" } satisfies HostMessage);
          return;
        }
        const screen = msg.screen === true;
        seat = this.seat(msg.clientId, msg.name, conn, screen);
        if (!seat && screen) {
          // A full room still has room for an audience.
          this.spectators.get(msg.clientId)?.close();
          this.spectators.set(msg.clientId, conn);
          spectating = msg.clientId;
          conn.send({ t: "welcome", player: null, gameId: this.gameId } satisfies HostMessage);
          this.greetScreen(conn);
          return;
        }
        if (!seat) {
          conn.send({ t: "rejected", reason: "full" } satisfies HostMessage);
          setTimeout(() => conn.close(), 250);
          return;
        }
        conn.send({ t: "welcome", player: seat.info, gameId: this.gameId } satisfies HostMessage);
        conn.send({ t: "layout", ...this.layout } satisfies HostMessage);
        this.emitPlayers();
        if (screen) this.greetScreen(conn);
        return;
      }

      if (msg.t === "ping") {
        conn.send({ t: "pong", at: msg.at } satisfies HostMessage);
        return;
      }
      if (msg.t === "command") {
        if (seat?.screen || spectating) this.screens.command({ playerId: seat?.info.id ?? null, name: msg.name });
        return;
      }

      if (!seat) return; // must say hello first

      if (msg.t === "input") {
        if (msg.seq <= seat.lastSeq) return; // stale / out-of-order
        seat.lastSeq = msg.seq;
        this.applyInput(seat, msg.s);
      }
    });

    conn.on("close", () => {
      if (spectating && this.spectators.get(spectating) === conn) this.spectators.delete(spectating);
      this.release(seat, conn);
    });
  }

  /** Find or assign a seat. Returning players reclaim theirs. */
  private seat(clientId: string, name: string, conn: Link, screen: boolean): Seat | null {
    const existing = this.seats.get(clientId);
    if (existing) {
      existing.conn?.close();
      existing.conn = conn;
      existing.info = { ...existing.info, name, connected: true };
      existing.lastSeq = 0;
      existing.screen = screen;
      return existing;
    }
    const seat = this.claimSeat(clientId, name, conn);
    if (seat) seat.screen = screen;
    return seat;
  }

  private claimSeat(clientId: string, name: string, conn: Link | null): Seat | null {
    const taken = new Set([...this.seats.values()].map((s) => s.info.slot));
    let slot = SLOTS.find((s) => !taken.has(s));

    // Room full — but a disconnected seat can be handed to a new device.
    if (slot === undefined && this.seats.size >= MAX_PLAYERS) {
      const stale = [...this.seats.values()].find((s) => !s.info.connected);
      if (!stale) return null;
      this.seats.delete(stale.info.id);
      slot = stale.info.slot;
    }
    if (slot === undefined) return null;

    const seat: Seat = {
      info: { id: clientId, slot, name, connected: true },
      conn,
      input: NEUTRAL_INPUT,
      lastSeq: 0,
      screen: false,
      local: false,
    };
    this.seats.set(clientId, seat);
    return seat;
  }

  private release(seat: Seat | null, conn: Link) {
    if (!seat || seat.conn !== conn) return; // superseded by a reconnect
    seat.conn = null;
    seat.info = { ...seat.info, connected: false };
    this.applyInput(seat, NEUTRAL_INPUT);
    this.emitPlayers();
  }

  private applyInput(seat: Seat, next: InputState) {
    const prev = seat.input;
    seat.input = next;
    for (const button of ["a", "b"] as const) {
      if (next[button] && !prev[button]) this.emit("press", { playerId: seat.info.id, button });
      if (!next[button] && prev[button]) this.emit("release", { playerId: seat.info.id, button });
    }
  }
}

/**
 * Fan-out to remote screens. Frames go lossy and are thinned per link when it
 * runs over the relay; HUD state goes reliable and is kept for late joiners.
 */
class ScreenHub extends Emitter<{ command: ScreenCommand }> implements ScreenChannel {
  private remembered: { value: unknown } | null = null;
  private lastFrameAt = new WeakMap<Link, number>();

  constructor(private links: () => Link[]) {
    super();
  }

  get watching() {
    return this.links().length > 0;
  }

  get lastState(): unknown {
    return this.remembered?.value;
  }

  frame(f: unknown): void {
    const now = performance.now();
    const msg: HostMessage = { t: "frame", f };
    for (const link of this.links()) {
      if (link.mode === "relay") {
        if (now - (this.lastFrameAt.get(link) ?? 0) < RELAY_FRAME_INTERVAL_MS) continue;
        this.lastFrameAt.set(link, now);
      }
      link.sendLossy(msg);
    }
  }

  state(s: unknown): void {
    this.remembered = { value: s };
    const msg: HostMessage = { t: "state", s };
    for (const link of this.links()) link.send(msg);
  }

  command(c: ScreenCommand) {
    this.emit("command", c);
  }

  /** A new game (or the lobby): forget the previous game's HUD. */
  reset() {
    this.remembered = null;
  }

  dispose() {
    this.clearListeners();
  }
}
