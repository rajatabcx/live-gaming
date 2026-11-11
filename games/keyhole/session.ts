import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import type { GameRoom, GameSource, ScreenFeed } from "../types";
import { FrameFollower, FramePublisher, INERT_ROOM, lerpNumbers, shareHud } from "../kit/mirror";
import { Store } from "../kit/store";
import { viewSlots } from "../kit/views";
import { Sfx } from "./audio";
import { CHAPTERS } from "./chapters";
import { STEP } from "./sim/constants";
import { capture, restore, type WorldSnapshot } from "./sim/snapshot";
import { IDLE_INPUT, World, type KeyholeInput, type Slot, type WorldEvent } from "./sim/world";
import { Renderer, type FrameOptions } from "./render/renderer";

/**
 * - playing: two rooms, one locked door
 * - done: the door opened; a card, then the next chapter
 * - finale: every door open
 */
export type Phase = "playing" | "done" | "finale";

export interface HudState {
  phase: Phase;
  chapter: number;
  chapterCount: number;
  name: string;
  subtitle: string;
  /** Bumps on every chapter start so the title card can replay. */
  chapterKey: number;
  rooms: [string, string];
  names: [string, string];
  hint: string | null;
  unlocked: boolean;
  /** The chapter just finished. */
  time: number;
  wrongs: number;
  /** Across the whole evening, for the finale. */
  runTime: number;
  runEyes: number;
  muted: boolean;
  waitingFor: string | null;
}

/** HUD buttons a remote screen may ask the host for. */
type Command = "advance" | "restart" | "exit";

const INTRO_SECONDS = 4.5;
const DONE_DELAY = 1.8;
const MAX_STEPS_PER_FRAME = 8;
const SLOTS: Slot[] = [0, 1];
const UNLOCKED_HINT = "The door's unlocked. Stand at it and both hold Use.";

/**
 * One evening of Keyhole: three chapters, each two rooms either side of a
 * locked door. Owns the loop — input in, fixed sim steps, events out to
 * sound/haptics/renderer, and a HUD store React reads with useSyncExternalStore.
 *
 * On a remote screen it runs as a mirror: it poses both rooms from the host's
 * frames and draws this player's room; HUD buttons go back as commands.
 */
export class Session {
  private world: World;
  private renderer: Renderer;
  private sfx = new Sfx();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private chapterTime = 0;
  private openedAt: number | null = null;
  private fade = 0;
  private fadeTarget = 1;
  private pending: number | null = null;
  private latch: Record<Slot, { use: boolean; back: boolean }> = { 0: { use: false, back: false }, 1: { use: false, back: false } };
  private players: PlayerInfo[] = [];
  private views: PlayerSlot[] = [0, 1];
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
    this.world = new World(CHAPTERS[0]);
    const first = CHAPTERS[0];
    this.store = new Store<HudState>({
      phase: "playing",
      chapter: 0,
      chapterCount: CHAPTERS.length,
      name: first.name,
      subtitle: first.subtitle,
      chapterKey: 0,
      rooms: [first.rooms[0].name, first.rooms[1].name],
      names: ["", ""],
      hint: first.hint,
      unlocked: false,
      time: 0,
      wrongs: 0,
      runTime: 0,
      runEyes: 0,
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
    this.loadChapter(0);
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
    const names: [string, string] = [bySlot(0)?.name ?? "", bySlot(1)?.name ?? ""];
    this.renderer.setNames(names);
    this.views = viewSlots(this.source, players);
    this.renderer.setViews(this.views);
    const absent = SLOTS.map(bySlot).filter((p) => !p?.connected);
    const waitingFor = absent.length === 0 ? null : (absent.find((p) => p !== undefined)?.name ?? "your partner");
    this.setHud({ waitingFor, names });
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
    if (next.phase === "finale" && this.hud.phase !== "finale") this.sfx.play("finale");
    this.store.set({ ...next, muted: this.sfx.muted });
  }

  private command(name: Command) {
    if (name === "advance") this.advance();
    else if (name === "restart") this.restartChapter();
    else if (name === "exit") this.exit();
  }

  // ─── Commands (HUD buttons and controller buttons) ──────────────────────────

  advance() {
    if (this.feed) return this.feed.command("advance");
    const { phase, chapter } = this.hud;
    if (phase === "done") {
      if (chapter + 1 < CHAPTERS.length) this.transitionTo(chapter + 1);
      else this.showFinale();
    } else if (phase === "finale") {
      this.setHud({ runTime: 0, runEyes: 0 });
      this.transitionTo(0);
    }
  }

  restartChapter() {
    if (this.feed) return this.feed.command("restart");
    this.transitionTo(this.hud.chapter);
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
    const chapter = CHAPTERS[index];
    this.epoch++;
    this.world = new World(chapter);
    this.renderer.startChapter();
    this.chapterTime = 0;
    this.openedAt = null;
    this.acc = 0;
    this.fade = 0;
    this.fadeTarget = 1;
    this.clearLatch();
    this.setHud({
      phase: "playing",
      chapter: index,
      name: chapter.name,
      subtitle: chapter.subtitle,
      chapterKey: this.hud.chapterKey + 1,
      rooms: [chapter.rooms[0].name, chapter.rooms[1].name],
      hint: chapter.hint,
      unlocked: false,
    });
    this.applyLayouts();
  }

  /** Exposed for automated playtests. */
  get debugWorld() {
    return this.world;
  }

  // ─── Flow ───────────────────────────────────────────────────────────────────

  private applyLayouts() {
    const rooms = this.world.chapter.rooms;
    for (const p of this.players) this.room.setLayoutFor(p.id, { kind: "stick+buttons", a: "Use", b: "Back" }, `In the ${rooms[p.slot].name.toLowerCase()}`);
  }

  private transitionTo(index: number) {
    this.pending = index;
    this.fadeTarget = 0;
  }

  private onDone() {
    const last = this.hud.chapter + 1 >= CHAPTERS.length;
    this.room.setLayout({ kind: "buttons", a: last ? "Finish" : "Next room" }, "Together again");
    this.setHud({
      phase: "done",
      time: this.chapterTime,
      wrongs: this.world.wrongs,
      runTime: this.hud.runTime + this.chapterTime,
      runEyes: this.hud.runEyes + this.world.eyes,
    });
  }

  private showFinale() {
    this.sfx.play("finale");
    this.room.setLayout({ kind: "buttons", a: "Play again", b: "Lobby" }, "Every door open");
    this.setHud({ phase: "finale" });
  }

  private onPress(playerId: string, button: "a" | "b") {
    const slot = this.players.find((p) => p.id === playerId)?.slot;
    if (slot === undefined) return;
    this.sfx.unlock();
    const phase = this.hud.phase;
    if (phase === "playing") {
      if (button === "a") this.latch[slot].use = true;
      else this.latch[slot].back = true;
      return;
    }
    if (this.openedAt !== null && this.chapterTime - this.openedAt < DONE_DELAY + 0.4) return;
    if (button === "a") this.advance();
    else if (phase === "finale") this.exit();
  }

  private clearLatch() {
    this.latch = { 0: { use: false, back: false }, 1: { use: false, back: false } };
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

    const opts: FrameOptions = { fade: this.fade, intro: clamp01((INTRO_SECONDS - this.chapterTime) / 0.8) };
    this.renderer.draw(this.world, paused ? 1 : this.acc / STEP, dt, opts);
    this.publisher?.publish(now, () => ({ world: capture(this.world, this.hud.chapter, this.epoch), opts }));
  };

  /** Remote screen: pose both rooms from the host's frames and play their events. */
  private follow(now: number, dt: number) {
    const s = this.follower!.sample(now);
    if (!s) return this.renderer.draw(this.world, 1, dt, { fade: 0, intro: 0 });
    const to = s.to.world;
    if (to.epoch !== this.shownEpoch && CHAPTERS[to.chapter]) {
      this.shownEpoch = to.epoch;
      this.world = new World(CHAPTERS[to.chapter]);
      this.renderer.startChapter();
    }
    restore(this.world, s.from.world, to, s.t);
    if (s.events.length) this.react(s.events);
    this.renderer.draw(this.world, s.t, dt, lerpNumbers(s.from.opts, s.to.opts, s.t));
  }

  private tick() {
    const playing = this.hud.phase === "playing";
    const inputs = SLOTS.map((s): KeyholeInput => {
      if (!playing) return IDLE_INPUT;
      const i = this.room.inputForSlot(s);
      return { x: i.x, y: i.y, a: i.a, use: this.latch[s].use, back: this.latch[s].back };
    }) as [KeyholeInput, KeyholeInput];
    this.clearLatch();
    const events = this.world.step(inputs);
    this.chapterTime += STEP;
    if (events.length) this.react(events);
    if (this.openedAt !== null && this.hud.phase === "playing" && this.chapterTime - this.openedAt > DONE_DELAY) this.onDone();
  }

  private react(events: readonly WorldEvent[]) {
    this.publisher?.events(events);
    this.renderer.handle(this.world, events);
    // Sound only for rooms this screen shows (and the door everyone shares).
    const here = (slot: Slot) => this.views.includes(slot);
    for (const e of events) {
      switch (e.type) {
        case "open": {
          if (here(e.slot)) this.sfx.play("open");
          const d = this.world.hotspot(e.slot, e.id)?.device;
          if (here(e.slot) && d?.kind === "clue" && d.art.kind === "melody") this.sfx.melody(d.art.notes);
          break;
        }
        case "close":
          if (here(e.slot)) this.sfx.play("close");
          break;
        case "cursor":
          if (here(e.slot)) this.sfx.play("cursor");
          break;
        case "turn":
          if (here(e.slot)) this.sfx.play("turn");
          this.buzz(e.slot, 6);
          break;
        case "key":
          if (here(e.slot)) this.sfx.note(e.note, e.style);
          this.buzz(e.slot, 10);
          break;
        case "wrong":
          if (here(e.slot)) this.sfx.play("wrong");
          this.buzz(e.slot, [40, 30, 40]);
          break;
        case "bump":
          if (here(e.slot)) this.sfx.play("bump");
          this.buzz(e.slot, 20);
          break;
        case "solved":
          if (here(e.slot)) this.sfx.play("solved");
          this.buzz(e.slot, [20, 40, 60]);
          this.setHud({ hint: null });
          break;
        case "item":
          if (here(e.slot)) this.sfx.play("item");
          break;
        case "reveal":
          if (here(e.slot)) this.sfx.play("reveal");
          break;
        case "pass":
          this.sfx.play("pass");
          this.buzz(e.from === 0 ? 1 : 0, [15, 40, 15]);
          break;
        case "peek":
          if (here(e.slot)) this.sfx.play("peek");
          break;
        case "eyes":
          this.sfx.play("eyes");
          SLOTS.forEach((s) => this.buzz(s, [30, 80, 30]));
          break;
        case "unlocked":
          this.sfx.play("unlocked");
          this.setHud({ unlocked: true, hint: UNLOCKED_HINT });
          break;
        case "opened":
          this.sfx.play("opened");
          SLOTS.forEach((s) => this.buzz(s, [30, 60, 30, 60, 90]));
          this.openedAt = this.chapterTime;
          this.setHud({ hint: null });
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
      this.loadChapter(next);
    }
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
