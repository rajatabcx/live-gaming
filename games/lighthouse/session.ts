import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import type { GameRoom, GameSource, ScreenFeed } from "../types";
import { FrameFollower, FramePublisher, INERT_ROOM, lerpNumbers, shareHud } from "../kit/mirror";
import { Store } from "../kit/store";
import { viewSlots } from "../kit/views";
import { Sfx } from "./audio";
import { NIGHTS } from "./nights";
import { BOAT, STEP } from "./sim/constants";
import { capture, restore, type WorldSnapshot } from "./sim/snapshot";
import { IDLE_KEEPER, IDLE_SAILOR, keeperSlot, roleOf, World, type Slot, type WorldEvent } from "./sim/world";
import { Renderer, type FrameOptions } from "./render/renderer";

/**
 * - playing: at sea
 * - docked: the boat made it; a card, then the next night (roles swap)
 * - finale: every night sailed
 */
export type Phase = "playing" | "docked" | "finale";

export interface HudState {
  phase: Phase;
  night: number;
  nightCount: number;
  name: string;
  subtitle: string;
  /** Bumps on every night start so the title card can replay. */
  nightKey: number;
  keeper: string;
  sailor: string;
  hull: number;
  bottles: number;
  bottlesTotal: number;
  hint: string | null;
  /** The night just sailed. */
  time: number;
  scrapes: number;
  /** Across the whole voyage, for the finale. */
  runTime: number;
  runBottles: number;
  runBottlesTotal: number;
  runScrapes: number;
  muted: boolean;
  waitingFor: string | null;
}

/** HUD buttons a remote screen may ask the host for. */
type Command = "advance" | "restart" | "exit";

const INTRO_SECONDS = 4.5;
const DOCK_DELAY = 1.6;
const MAX_STEPS_PER_FRAME = 8;
const SLOTS: Slot[] = [0, 1];
const TOTAL_BOTTLES = NIGHTS.reduce((n, night) => n + night.bottles.length, 0);

const HAPTICS: Partial<Record<WorldEvent["type"], number | number[]>> = {
  scrape: [40, 30, 40],
  wreck: [80, 40, 120],
  buoy: 14,
  bottle: [8, 30, 8],
};

/**
 * One voyage of Lighthouse: three nights, roles swapping each night. Owns
 * the loop — input in, fixed sim steps, events out to sound/haptics/renderer,
 * and a HUD store React reads with useSyncExternalStore.
 *
 * On a remote screen it runs as a mirror: it poses the sea from the host's
 * frames and draws this player's view (keeper or sailor); HUD buttons go
 * back to the host as commands.
 */
export class Session {
  private world: World;
  private renderer: Renderer;
  private sfx = new Sfx();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private nightTime = 0;
  private dockedAt: number | null = null;
  private fade = 0;
  private fadeTarget = 1;
  private pending: number | null = null;
  private latch: Record<Slot, boolean> = { 0: false, 1: false };
  private players: PlayerInfo[] = [];
  private store: Store<HudState>;
  private cleanup: (() => void)[] = [];
  private room: GameRoom;
  private feed: ScreenFeed | null;
  private publisher: FramePublisher<WorldSnapshot, FrameOptions, WorldEvent> | null = null;
  private follower: FrameFollower<WorldSnapshot, FrameOptions, WorldEvent> | null = null;
  /** Host: counts Worlds built. Screen: the epoch currently shown. */
  private epoch = 0;
  private shownEpoch = -1;

  constructor(
    private source: GameSource,
    canvas: HTMLCanvasElement,
    private onExit: () => void,
  ) {
    this.room = source.role === "host" ? source.room : INERT_ROOM;
    this.feed = source.role === "screen" ? source.feed : null;
    this.renderer = new Renderer(canvas);
    this.world = new World(NIGHTS[0]);
    this.store = new Store<HudState>({
      phase: "playing",
      night: 0,
      nightCount: NIGHTS.length,
      name: NIGHTS[0].name,
      subtitle: NIGHTS[0].subtitle,
      nightKey: 0,
      keeper: "",
      sailor: "",
      hull: BOAT.hull,
      bottles: 0,
      bottlesTotal: NIGHTS[0].bottles.length,
      hint: NIGHTS[0].hint,
      time: 0,
      scrapes: 0,
      runTime: 0,
      runBottles: 0,
      runBottlesTotal: TOTAL_BOTTLES,
      runScrapes: 0,
      muted: this.sfx.muted,
      waitingFor: null,
    });
  }

  private get hud() {
    return this.store.get();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    this.renderer.resize();
    const onResize = () => this.renderer.resize();
    window.addEventListener("resize", onResize);
    const unlock = () => this.sfx.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    this.sfx.unlock();
    this.cleanup.push(
      () => window.removeEventListener("resize", onResize),
      () => window.removeEventListener("pointerdown", unlock),
      () => window.removeEventListener("keydown", unlock),
    );
    if (this.feed) {
      const feed = this.feed;
      this.follower = new FrameFollower(feed);
      this.cleanup.push(() => this.follower?.dispose(), feed.on("state", (s) => this.applyHostHud(s)));
      if (feed.lastState) this.applyHostHud(feed.lastState);
    } else {
      this.publisher = new FramePublisher(this.room.screens);
      this.cleanup.push(
        this.room.on("press", ({ playerId, button }) => this.onPress(playerId, button)),
        this.room.screens.on("command", ({ name }) => this.command(name as Command)),
        shareHud(this.room.screens, this.store, ["muted"]),
      );
    }
    this.loadNight(0);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((fn) => fn());
    this.sfx.destroy();
    this.store.clear();
  }

  setPlayers(players: PlayerInfo[]) {
    this.players = players;
    const bySlot = (s: PlayerSlot) => players.find((p) => p.slot === s);
    this.renderer.setNames([bySlot(0)?.name ?? "", bySlot(1)?.name ?? ""]);
    this.renderer.setViews(viewSlots(this.source, players));
    const absent = SLOTS.map(bySlot).filter((p) => !p?.connected);
    const waitingFor = absent.length === 0 ? null : (absent.find((p) => p !== undefined)?.name ?? "your partner");
    this.setHud({ waitingFor, ...this.crew(this.hud.night) });
    if (this.hud.phase === "playing") this.applyLayouts();
  }

  // ─── HUD store (useSyncExternalStore) ───────────────────────────────────────

  subscribe = (fn: () => void) => this.store.subscribe(fn);

  getHud = () => this.store.get();

  /** The host owns the HUD; a remote screen only ever shows what it sends. */
  private setHud(patch: Partial<HudState>) {
    if (!this.feed) this.store.set(patch);
  }

  private applyHostHud(state: unknown) {
    if (!state || typeof state !== "object") return;
    const next = state as HudState;
    if (next.phase === "finale" && this.hud.phase !== "finale") this.sfx.play("home");
    this.store.set({ ...next, muted: this.sfx.muted });
  }

  private command(name: Command) {
    if (name === "advance") this.advance();
    else if (name === "restart") this.restartNight();
    else if (name === "exit") this.exit();
  }

  // ─── Commands (HUD buttons and controller buttons) ──────────────────────────

  advance() {
    if (this.feed) return this.feed.command("advance");
    const { phase, night } = this.hud;
    if (phase === "docked") {
      if (night + 1 < NIGHTS.length) this.transitionTo(night + 1);
      else this.showFinale();
    } else if (phase === "finale") {
      this.setHud({ runTime: 0, runBottles: 0, runScrapes: 0 });
      this.transitionTo(0);
    }
  }

  restartNight() {
    if (this.feed) return this.feed.command("restart");
    this.transitionTo(this.hud.night);
  }

  exit() {
    if (this.feed) return this.feed.command("exit");
    this.onExit();
  }

  toggleMute() {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.muted);
    this.store.set({ muted: this.sfx.muted });
  }

  /** Dev/console: jump straight to a night. */
  loadNight(index: number) {
    const night = NIGHTS[index];
    this.epoch++;
    this.world = new World(night);
    this.renderer.startNight(this.world, index);
    this.nightTime = 0;
    this.dockedAt = null;
    this.acc = 0;
    this.fade = 0;
    this.fadeTarget = 1;
    this.latch = { 0: false, 1: false };
    this.setHud({
      phase: "playing",
      night: index,
      name: night.name,
      subtitle: night.subtitle,
      nightKey: this.hud.nightKey + 1,
      hull: BOAT.hull,
      bottles: 0,
      bottlesTotal: night.bottles.length,
      hint: night.hint,
      ...this.crew(index),
    });
    this.applyLayouts();
  }

  /** Exposed for automated playtests. */
  get debugWorld() {
    return this.world;
  }

  // ─── Flow ───────────────────────────────────────────────────────────────────

  private crew(night: number) {
    const name = (role: "keeper" | "sailor") => this.players.find((p) => roleOf(p.slot, night) === role)?.name ?? "";
    return { keeper: name("keeper"), sailor: name("sailor") };
  }

  /** The two players have different jobs, so different controllers. */
  private applyLayouts() {
    const night = this.hud.night;
    for (const p of this.players) {
      if (roleOf(p.slot, night) === "keeper") this.room.setLayoutFor(p.id, { kind: "stick+buttons", a: "Flare" }, "You keep the light");
      else this.room.setLayoutFor(p.id, { kind: "stick+buttons", a: "Horn" }, "You sail the boat");
    }
  }

  private transitionTo(index: number) {
    this.pending = index;
    this.fadeTarget = 0;
  }

  private onDocked() {
    const w = this.world;
    const last = this.hud.night + 1 >= NIGHTS.length;
    this.room.setLayout({ kind: "buttons", a: last ? "Finish" : "Next night" }, "Home safe");
    this.setHud({
      phase: "docked",
      time: this.nightTime,
      scrapes: w.scrapes,
      runTime: this.hud.runTime + this.nightTime,
      runBottles: this.hud.runBottles + w.collected,
      runScrapes: this.hud.runScrapes + w.scrapes,
    });
  }

  private showFinale() {
    this.sfx.play("home");
    this.room.setLayout({ kind: "buttons", a: "Sail again", b: "Lobby" }, "Every night, home");
    this.setHud({ phase: "finale" });
  }

  private onPress(playerId: string, button: "a" | "b") {
    const slot = this.players.find((p) => p.id === playerId)?.slot;
    if (slot === undefined) return;
    this.sfx.unlock();
    const phase = this.hud.phase;
    if (phase === "playing") {
      if (button === "a") this.latch[slot] = true;
      return;
    }
    if (this.dockedAt !== null && this.nightTime - this.dockedAt < DOCK_DELAY + 0.4) return;
    if (button === "a") this.advance();
    else if (phase === "finale") this.exit();
  }

  // ─── Loop ───────────────────────────────────────────────────────────────────

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    if (this.follower) return this.follow(now, dt);

    this.updateFade(dt);
    const paused = this.hud.waitingFor !== null || this.pending !== null;
    if (!paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
        this.tick();
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }

    const opts: FrameOptions = { fade: this.fade, intro: clamp01((INTRO_SECONDS - this.nightTime) / 0.8) };
    this.renderer.draw(this.world, paused ? 1 : this.acc / STEP, dt, opts);
    this.publisher?.publish(now, () => ({ world: capture(this.world, this.hud.night, this.epoch), opts }));
  };

  /** Remote screen: pose the sea from the host's frames and play their events. */
  private follow(now: number, dt: number) {
    const s = this.follower!.sample(now);
    if (!s) return this.renderer.draw(this.world, 1, dt, { fade: 0, intro: 0 });
    const to = s.to.world;
    if (to.epoch !== this.shownEpoch && NIGHTS[to.night]) {
      this.shownEpoch = to.epoch;
      this.world = new World(NIGHTS[to.night]);
      this.renderer.startNight(this.world, to.night);
    }
    restore(this.world, s.from.world, to, s.t);
    if (s.events.length) this.react(s.events);
    this.renderer.draw(this.world, s.t, dt, lerpNumbers(s.from.opts, s.to.opts, s.t));
  }

  private tick() {
    const playing = this.hud.phase === "playing";
    const ks = keeperSlot(this.hud.night);
    const ss: Slot = ks === 0 ? 1 : 0;
    const k = this.room.inputForSlot(ks);
    const sl = this.room.inputForSlot(ss);
    const keeper = playing ? { x: k.x, y: k.y, flarePressed: this.latch[ks] } : IDLE_KEEPER;
    const sailor = playing ? { x: sl.x, y: sl.y, hornPressed: this.latch[ss] } : IDLE_SAILOR;
    this.latch = { 0: false, 1: false };
    const events = this.world.step(keeper, sailor);
    this.nightTime += STEP;
    if (events.length) this.react(events);
    if (this.dockedAt !== null && this.hud.phase === "playing" && this.nightTime - this.dockedAt > DOCK_DELAY) this.onDocked();
  }

  private react(events: readonly WorldEvent[]) {
    this.publisher?.events(events);
    this.renderer.handle(this.world, events);
    const night = this.hud.night;
    const sailor = (): Slot => (keeperSlot(night) === 0 ? 1 : 0);
    for (const e of events) {
      const pattern = HAPTICS[e.type];
      if (pattern !== undefined) this.buzz(sailor(), pattern);
      switch (e.type) {
        case "scrape":
          this.sfx.play("scrape");
          this.setHud({ hull: e.hull });
          break;
        case "wreck":
          this.sfx.play("wreck");
          this.setHud({ hull: 0 });
          break;
        case "afloat":
          this.sfx.play("afloat");
          this.setHud({ hull: BOAT.hull });
          break;
        case "buoy":
          this.sfx.play("buoy");
          this.setHud({ hint: null });
          break;
        case "bottle":
          this.sfx.bottle(e.count - 1);
          this.setHud({ bottles: e.count });
          break;
        case "horn":
          this.sfx.play("horn");
          this.buzz(keeperSlot(night), [30, 20, 30]);
          break;
        case "flare":
          this.sfx.play("flare");
          break;
        case "spotted":
          this.sfx.play("spotted");
          break;
        case "docked":
          this.sfx.play("docked");
          SLOTS.forEach((s) => this.buzz(s, [30, 60, 30, 60, 90]));
          this.dockedAt = this.nightTime;
          break;
      }
    }
  }

  private buzz(slot: Slot, pattern: number | number[]) {
    const id = this.players.find((p) => p.slot === slot)?.id;
    if (id) this.room.haptic(id, pattern);
  }

  private updateFade(dt: number) {
    const speed = this.fadeTarget > this.fade ? 1.4 : 2.6;
    this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + dt * speed) : Math.max(this.fadeTarget, this.fade - dt * speed);
    if (this.pending !== null && this.fade <= 0) {
      const next = this.pending;
      this.pending = null;
      this.loadNight(next);
    }
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
