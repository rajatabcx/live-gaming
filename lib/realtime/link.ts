import { Emitter } from "./emitter";
import type { Envelope, Signaling } from "./signaling";

/**
 * A bidirectional message pipe to one peer. Two flavours:
 *  - "p2p":   WebRTC data channel. Direct, ~1 frame of latency on the same Wi-Fi.
 *  - "relay": Supabase broadcast. Fallback when WebRTC can't punch through (strict
 *             NAT, corporate Wi-Fi). Slower, but the game still works.
 * Host/controller code only sees `Link`, never which flavour it got.
 */
export type LinkMode = "p2p" | "relay";

type LinkEvents = { message: unknown; close: void };

export abstract class Link extends Emitter<LinkEvents> {
  abstract readonly mode: LinkMode;
  abstract readonly open: boolean;
  abstract send(msg: unknown): void;
  protected closed = false;

  constructor(readonly peerId: string) {
    super();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.teardown();
    this.emit("close", undefined);
    this.clearListeners();
  }

  protected abstract teardown(): void;
  protected deliver(msg: unknown) {
    this.emit("message", msg);
  }
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
/** A blip on Wi-Fi often recovers; only give up after this long "disconnected". */
const DISCONNECT_GRACE_MS = 4000;

export class PeerLink extends Link {
  readonly mode = "p2p" as const;
  private dc: RTCDataChannel | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private offSignal: () => void;
  private pendingIce: RTCIceCandidateInit[] = [];
  private onReady: (() => void) | null = null;

  constructor(
    peerId: string,
    private sig: Signaling,
    readonly pc: RTCPeerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS }),
  ) {
    super(peerId);
    pc.onicecandidate = (e) => {
      if (e.candidate) sig.send({ kind: "ice", from: sig.selfId, to: peerId, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "failed" || s === "closed") this.close();
      else if (s === "disconnected") this.graceTimer ??= setTimeout(() => this.close(), DISCONNECT_GRACE_MS);
      else if (s === "connected" && this.graceTimer) {
        clearTimeout(this.graceTimer);
        this.graceTimer = null;
      }
    };
    pc.ondatachannel = (e) => this.attach(e.channel);
    this.offSignal = sig.on("envelope", (env) => this.onEnvelope(env));
  }

  get open() {
    return this.dc?.readyState === "open";
  }

  send(msg: unknown) {
    if (this.open) this.dc!.send(JSON.stringify(msg));
  }

  /** Resolves once the data channel is open. */
  ready(): Promise<void> {
    if (this.open) return Promise.resolve();
    return new Promise((resolve) => (this.onReady = resolve));
  }

  // ── Offerer (controller) ──
  async offer(): Promise<void> {
    this.attach(this.pc.createDataChannel("duet", { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    this.sig.send({ kind: "offer", from: this.sig.selfId, to: this.peerId, sdp: this.pc.localDescription!.sdp });
  }

  // ── Answerer (host) ──
  async answer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    await this.flushIce();
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    this.sig.send({ kind: "answer", from: this.sig.selfId, to: this.peerId, sdp: this.pc.localDescription!.sdp });
  }

  protected teardown() {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.offSignal();
    this.dc?.close();
    this.pc.close();
  }

  private attach(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => this.onReady?.();
    dc.onclose = () => this.close();
    dc.onmessage = (e) => {
      try {
        this.deliver(JSON.parse(e.data as string));
      } catch {
        /* ignore malformed frames */
      }
    };
  }

  private async onEnvelope(env: Envelope) {
    if (env.from !== this.peerId) return;
    if (env.kind === "bye") this.close();
    else if (env.kind === "answer") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: env.sdp });
      await this.flushIce();
    } else if (env.kind === "ice") {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(env.candidate).catch(() => {});
      else this.pendingIce.push(env.candidate);
    }
  }

  private async flushIce() {
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
  }
}

export class RelayLink extends Link {
  readonly mode = "relay" as const;
  private offSignal: () => void;
  private offLeft: () => void;

  constructor(
    peerId: string,
    private sig: Signaling,
  ) {
    super(peerId);
    this.offSignal = sig.on("envelope", (env) => {
      if (env.from !== peerId) return;
      if (env.kind === "relay") this.deliver(env.data);
      else if (env.kind === "bye") this.close();
    });
    this.offLeft = sig.on("left", (id) => id === peerId && this.close());
  }

  get open() {
    return !this.closed;
  }

  send(msg: unknown) {
    if (!this.closed) this.sig.send({ kind: "relay", from: this.sig.selfId, to: this.peerId, data: msg });
  }

  /** Feed the first relay message that caused this link to be created. */
  inject(msg: unknown) {
    this.deliver(msg);
  }

  protected teardown() {
    this.offSignal();
    this.offLeft();
  }
}

/** Controller side: try WebRTC, fall back to relay if it doesn't open in time. */
export async function dial(
  sig: Signaling,
  hostId: string,
  { timeoutMs = 5000, forceRelay = false }: { timeoutMs?: number; forceRelay?: boolean } = {},
): Promise<Link> {
  if (forceRelay) return new RelayLink(hostId, sig);
  const link = new PeerLink(hostId, sig);
  const opened = link.ready().then(() => true);
  await link.offer();
  const ok = await Promise.race([opened, new Promise<false>((r) => setTimeout(() => r(false), timeoutMs))]);
  if (ok) return link;
  link.close();
  return new RelayLink(hostId, sig);
}

/**
 * Host side: turn incoming envelopes into Links. Emits a link once it's usable.
 * A peer may arrive as p2p, relay, or first one then the other.
 */
export class LinkAcceptor {
  private offSignal: () => void;
  private relays = new Map<string, RelayLink>();

  constructor(
    private sig: Signaling,
    private onLink: (link: Link) => void,
  ) {
    this.offSignal = sig.on("envelope", (env) => this.onEnvelope(env));
  }

  dispose() {
    this.offSignal();
    for (const r of this.relays.values()) r.close();
  }

  private async onEnvelope(env: Envelope) {
    if (env.kind === "offer") {
      const link = new PeerLink(env.from, this.sig);
      link.ready().then(() => this.onLink(link));
      await link.answer(env.sdp).catch(() => link.close());
    } else if (env.kind === "relay") {
      let relay = this.relays.get(env.from);
      if (!relay) {
        relay = new RelayLink(env.from, this.sig);
        this.relays.set(env.from, relay);
        relay.on("close", () => this.relays.delete(env.from));
        this.onLink(relay);
        relay.inject(env.data); // the RelayLink's own listener was registered after this envelope fired
      }
    }
  }
}
