import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import type { GameRoom, GameSource, ScreenFeed } from "../types";
import { FrameFollower, FramePublisher, INERT_ROOM, lerpNumbers, shareHud } from "../kit/mirror";
import { Store } from "../kit/store";
import { Sfx } from "./audio";
import { CHAPTERS } from "./chapters";
import { STEP } from "./sim/constants";
import { IDLE_INPUT, World, type LanternInput, type Slot, type WorldEvent } from "./sim/world";
import { capture, restore, type WorldSnapshot } from "./sim/snapshot";
import { Renderer, type FrameOptions } from "./render/renderer";

/**
 * - playing: find and light the stars
 * - found: the constellation is complete; its name shows
 * - rising: the sky scrolls up to the next chapter (lanterns still fly)
 * - dawn: the last one is done and the sun comes up
 */
export type Phase = "playing" | "found" | "rising" | "dawn";

export interface HudState {
  phase: Phase;
  chapter: number;
  chapterCount: number;
  subtitle: string;
  /** Revealed when found. */
  name: string;
  /** Bumps on every chapter start so the title card can replay. */
  chapterKey: number;
  lit: number;
  total: number;
  hint: string | null;
  /** Across the whole night, for the ending. */
  nightStars: number;
  nightTotal: number;
  harmonies: number;
  muted: boolean;
  waitingFor: string | null;
}

const FOUND_SECONDS = 3.4;
const RISE_SECONDS = 4;
const MAX_STEPS_PER_FRAME = 8;
const SLOTS: Slot[] = [0, 1];
const TOTAL_STARS = CHAPTERS.reduce((n, c) => n + c.stars.length, 0);
/** Dawn creeps up a little with every chapter, and fully after the last. */
const dawnFor = (chapter: number) => (chapter / CHAPTERS.length) * 0.7;

const HAPTICS: Partial<Record<WorldEvent["type"], number | number[]>> = {
  glow: 8,
};

/** HUD buttons a remote screen may ask the host for. */
type Command = "again" | "exit";

/**
 * One night of Lanterns. Owns the loop: phones' input in, fixed sim steps,
 * events out to sound/haptics/renderer, and a small HUD store React reads
 * with useSyncExternalStore. React never touches per-frame state.
 *
 * On a remote screen (long-distance) it runs as a mirror: no sim, no input —
 * it poses the sky from the host's frames, plays their events, shows the
 * host's HUD, and sends HUD buttons back as commands.
 */
export class Session {
  private world: World;
  private renderer: Renderer;
  private sfx = new Sfx();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private phaseTime = 0;
  private fade = 0;
  private fadeTarget = 1;
  private restartPending = false;
  private dawn = 0;
  private bloom = 0;
  private starsLitTonight = 0;
  private glowLatch: Record<Slot, boolean> = { 0: false, 1: false };
  private players: PlayerInfo[] = [];
  private store: Store<HudState>;
  private cleanup: (() => void)[] = [];
  private room: GameRoom;
  private feed: ScreenFeed | null;
  private publisher: FramePublisher<WorldSnapshot, FrameOptions, WorldEvent> | null = null;
  private follower: FrameFollower<WorldSnapshot, FrameOptions, WorldEvent> | null = null;
  /** Host: counts Worlds built. */
  private epoch = 0;
  /** Screen: what's currently posed. */
  private shown = { epoch: -1, chapter: -1, rising: false };

  constructor(
    source: GameSource,
    canvas: HTMLCanvasElement,
    private onExit: () => void,
  ) {
    this.room = source.role === "host" ? source.room : INERT_ROOM;
    this.feed = source.role === "screen" ? source.feed : null;
    this.renderer = new Renderer(canvas);
    this.world = new World(CHAPTERS[0]);
    this.store = new Store<HudState>({
      phase: "playing",
      chapter: 0,
      chapterCount: CHAPTERS.length,
      subtitle: CHAPTERS[0].subtitle,
      name: CHAPTERS[0].name,
      chapterKey: 0,
      lit: 0,
      total: CHAPTERS[0].stars.length,
      hint: CHAPTERS[0].hint ?? null,
      nightStars: 0,
      nightTotal: TOTAL_STARS,
      harmonies: 0,
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
    this.newNight();
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
    const absent = SLOTS.map(bySlot).filter((p) => !p?.connected);
    const waitingFor = absent.length === 0 ? null : (absent.find((p) => p !== undefined)?.name ?? "your partner");
    if (waitingFor !== this.hud.waitingFor) this.setHud({ waitingFor });
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
    // Sunrise is a phase change on the host, not a sim event.
    if (next.phase === "dawn" && this.hud.phase !== "dawn") this.sfx.play("dawn");
    this.store.set({ ...next, muted: this.sfx.muted });
  }

  private command(name: Command) {
    if (name === "again") this.playAgain();
    else if (name === "exit") this.exit();
  }

  // ─── Commands ───────────────────────────────────────────────────────────────

  /** From the dawn screen: another night. */
  playAgain() {
    if (this.feed) return this.feed.command("again");
    this.restartPending = true;
    this.fadeTarget = 0;
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

  /** Dev/console: jump straight to a chapter. */
  loadChapter(index: number) {
    this.epoch++;
    this.world = new World(CHAPTERS[index]);
    this.renderer.startChapter(this.world);
    this.dawn = dawnFor(index);
    this.enterChapter(index);
  }

  /** Exposed for automated playtests. */
  get debugWorld() {
    return this.world;
  }

  // ─── Flow ───────────────────────────────────────────────────────────────────

  private newNight() {
    this.starsLitTonight = 0;
    this.setHud({ nightStars: 0, harmonies: 0 });
    this.loadChapter(0);
  }

  private enterChapter(index: number) {
    const c = CHAPTERS[index];
    this.room.setLayout({ kind: "stick+buttons", a: "Glow" }, c.subtitle);
    this.phaseTime = 0;
    this.setHud({
      phase: "playing",
      chapter: index,
      subtitle: c.subtitle,
      name: c.name,
      chapterKey: this.hud.chapterKey + 1,
      lit: 0,
      total: c.stars.length,
      hint: c.hint ?? null,
    });
  }

  private onFound() {
    this.phaseTime = 0;
    this.sfx.play("complete");
    SLOTS.forEach((s) => this.buzz(s, [20, 60, 20, 60, 80]));
    this.setHud({ phase: "found", hint: null });
  }

  private beginRise() {
    const next = this.hud.chapter + 1;
    const previous = this.world.chapter;
    this.world.rise(CHAPTERS[next]);
    this.world.quiet = true;
    this.renderer.beginRise(this.world, previous);
    this.phaseTime = 0;
    this.setHud({ phase: "rising" });
  }

  private endRise() {
    this.world.quiet = false;
    this.renderer.endRise();
    this.enterChapter(this.hud.chapter + 1);
  }

  private beginDawn() {
    this.phaseTime = 0;
    this.sfx.play("dawn");
    this.room.setLayout({ kind: "buttons", a: "Again", b: "Lobby" }, "Good morning");
    this.setHud({ phase: "dawn" });
  }

  private onPress(playerId: string, button: "a" | "b") {
    const slot = this.players.find((p) => p.id === playerId)?.slot;
    if (slot === undefined) return;
    this.sfx.unlock();
    if (this.hud.phase === "dawn") {
      if (this.phaseTime < 2.5) return;
      if (button === "a") this.playAgain();
      else this.exit();
      return;
    }
    if (button === "a") this.glowLatch[slot] = true;
  }

  // ─── Loop ───────────────────────────────────────────────────────────────────

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    if (this.follower) return this.follow(now, dt);

    this.updateFade(dt);
    const paused = this.hud.waitingFor !== null || this.restartPending;
    if (!paused) {
      this.phaseTime += dt;
      this.updatePhase(dt);
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
        this.tick();
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }

    const phase = this.hud.phase;
    const rise = phase === "rising" ? Math.min(1, this.phaseTime / RISE_SECONDS) : 0;
    this.bloom += ((phase === "found" ? 1 : 0) - this.bloom) * Math.min(1, dt * 2);
    const opts: FrameOptions = { fade: this.fade, dawn: this.dawn, rise, bloom: this.bloom };
    this.renderer.draw(this.world, paused ? 1 : this.acc / STEP, dt, opts);
    this.publisher?.publish(now, () => ({
      world: capture(this.world, CHAPTERS.indexOf(this.world.chapter), this.epoch, phase === "rising"),
      opts,
    }));
  };

  /** Remote screen: pose the sky from the host's frames and play their events. */
  private follow(now: number, dt: number) {
    const s = this.follower!.sample(now);
    if (!s) return this.renderer.draw(this.world, 1, dt, { fade: 0, dawn: 0, rise: 0, bloom: 0 });
    const to = s.to.world;
    const shown = this.shown;
    if (to.epoch !== shown.epoch || (to.chapter !== shown.chapter && !(to.rising && to.chapter === shown.chapter + 1))) {
      this.world = new World(CHAPTERS[to.chapter] ?? CHAPTERS[0]);
      this.renderer.startChapter(this.world);
      if (to.rising) this.renderer.beginRise(this.world, CHAPTERS[Math.max(0, to.chapter - 1)]);
    } else if (to.rising && !shown.rising) {
      // Same moves the host made: keep the lanterns, swap the sky, slide the old one away.
      const previous = this.world.chapter;
      this.world.rise(CHAPTERS[to.chapter]);
      this.renderer.beginRise(this.world, previous);
    }
    if (!to.rising && shown.rising) this.renderer.endRise();
    this.shown = { epoch: to.epoch, chapter: to.chapter, rising: to.rising };

    restore(this.world, s.from.world, to, s.t);
    if (s.events.length) this.react(s.events);
    this.renderer.draw(this.world, s.t, dt, lerpNumbers(s.from.opts, s.to.opts, s.t));
  }

  private updatePhase(dt: number) {
    const { phase, chapter } = this.hud;
    if (phase === "found" && this.phaseTime >= FOUND_SECONDS) {
      if (chapter + 1 < CHAPTERS.length) this.beginRise();
      else this.beginDawn();
    } else if (phase === "rising") {
      const k = Math.min(1, this.phaseTime / RISE_SECONDS);
      this.dawn = dawnFor(chapter) + (dawnFor(chapter + 1) - dawnFor(chapter)) * k;
      if (k >= 1) this.endRise();
    } else if (phase === "dawn") {
      this.dawn = Math.min(1, this.dawn + dt * 0.12);
    }
  }

  private tick() {
    const flying = this.hud.phase !== "dawn";
    const inputs = SLOTS.map((s) => (flying ? this.readInput(s) : IDLE_INPUT)) as [LanternInput, LanternInput];
    const events = this.world.step(inputs);
    if (events.length) this.react(events);
  }

  private readInput(slot: Slot): LanternInput {
    const s = this.room.inputForSlot(slot);
    const input: LanternInput = { x: s.x, y: s.y, glowPressed: this.glowLatch[slot] };
    this.glowLatch[slot] = false;
    return input;
  }

  private react(events: readonly WorldEvent[]) {
    this.publisher?.events(events);
    this.renderer.handle(this.world, events);
    for (const e of events) {
      const pattern = HAPTICS[e.type];
      if (pattern !== undefined && "slot" in e) this.buzz(e.slot, pattern);
      switch (e.type) {
        case "kindle":
          this.sfx.play("kindle");
          SLOTS.forEach((s) => this.buzz(s, 6));
          break;
        case "lit":
          this.sfx.star(this.starsLitTonight++);
          SLOTS.forEach((s) => this.buzz(s, [12, 40, 12]));
          // A chapter's hint is about its new idea: lighting, or finding hidden stars.
          this.setHud({ lit: e.count, nightStars: this.starsLitTonight, ...(this.world.chapter.stars.some((st) => st.hidden) ? {} : { hint: null }) });
          break;
        case "line":
          this.sfx.play("line");
          break;
        case "glow":
          this.sfx.glow(e.slot);
          break;
        case "reveal":
          this.sfx.play("reveal");
          this.setHud({ hint: null });
          break;
        case "harmony":
          this.sfx.play("harmony");
          SLOTS.forEach((s) => this.buzz(s, [20, 30, 20]));
          this.setHud({ harmonies: this.hud.harmonies + 1 });
          break;
        case "complete":
          this.onFound();
          break;
      }
    }
  }

  private buzz(slot: Slot, pattern: number | number[]) {
    const id = this.players.find((p) => p.slot === slot)?.id;
    if (id) this.room.haptic(id, pattern);
  }

  private updateFade(dt: number) {
    const speed = this.fadeTarget > this.fade ? 0.9 : 2;
    this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + dt * speed) : Math.max(this.fadeTarget, this.fade - dt * speed);
    if (this.restartPending && this.fade <= 0) {
      this.restartPending = false;
      this.fadeTarget = 1;
      this.newNight();
    }
  }
}

