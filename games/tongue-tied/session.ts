import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import type { GameRoom, GameSource, ScreenFeed } from "../types";
import { FrameFollower, FramePublisher, INERT_ROOM, lerpNumbers, shareHud } from "../kit/mirror";
import { Store } from "../kit/store";
import { Sfx } from "./audio";
import { LEVELS } from "./levels";
import { STEP } from "./sim/constants";
import { IDLE_INPUT, World, type FrogInput, type Slot, type WorldEvent } from "./sim/world";
import { capture, restore, type WorldSnapshot } from "./sim/snapshot";
import { Renderer, type FrameOptions } from "./render/renderer";

export type Phase = "playing" | "cleared" | "finale";

export interface HudState {
  levelIndex: number;
  levelCount: number;
  name: string;
  subtitle: string;
  phase: Phase;
  /** Bumps on every level start so the title card can replay. */
  levelKey: number;
  hint: string | null;
  fireflies: number;
  firefliesTotal: number;
  /** Across the whole run, for the finale. */
  runFireflies: number;
  runFirefliesTotal: number;
  clearTime: number;
  clearLine: string;
  muted: boolean;
  waitingFor: string | null;
}

const PROGRESS_KEY = "duet.tongue-tied.reached";
const CLEAR_LINES = ["Beautifully done.", "Like you rehearsed it.", "In perfect sync.", "Made for each other."];
const INTRO_SECONDS = 2.6;
const CLEAR_DELAY = 1.1;
const MAX_STEPS_PER_FRAME = 8;
const SLOTS: Slot[] = [0, 1];
const TOTAL_FIREFLIES = LEVELS.reduce((n, l) => n + l.fireflies.length, 0);

const HAPTICS: Partial<Record<WorldEvent["type"], number | number[]>> = {
  jump: 8,
  "tongue-attach": 22,
  firefly: [6, 30, 10],
  splash: [40, 40, 60],
  respawn: 12,
};

/** HUD buttons a remote screen may ask the host for. */
type Command = "advance" | "restart" | "exit";

/**
 * One play-through of Tongue Tied. Owns the loop: phones' input in, fixed
 * sim steps, events out to sound/haptics/renderer, and a small HUD store
 * React reads with useSyncExternalStore. React never touches per-frame state.
 *
 * On a remote screen (long-distance) the same session runs as a mirror: no
 * sim, no input — it poses the world from the host's frames, plays their
 * events, shows the host's HUD, and sends HUD buttons back as commands.
 */
export class Session {
  private world: World;
  private renderer: Renderer;
  private sfx = new Sfx();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private levelTime = 0;
  private hintClock = 0;
  private clearedAt: number | null = null;
  private fade = 0;
  private fadeTarget = 1;
  private pendingLevel: number | null = null;
  private latch: Record<Slot, { jump: boolean; tongue: boolean }> = { 0: { jump: false, tongue: false }, 1: { jump: false, tongue: false } };
  private players: PlayerInfo[] = [];
  private runFireflies = 0;
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
    source: GameSource,
    canvas: HTMLCanvasElement,
    private onExit: () => void,
  ) {
    this.room = source.role === "host" ? source.room : INERT_ROOM;
    this.feed = source.role === "screen" ? source.feed : null;
    this.renderer = new Renderer(canvas);
    const start = readProgress();
    this.world = new World(LEVELS[start]);
    this.store = new Store<HudState>({
      levelIndex: start,
      levelCount: LEVELS.length,
      name: LEVELS[start].name,
      subtitle: LEVELS[start].subtitle,
      phase: "playing",
      levelKey: 0,
      hint: null,
      fireflies: 0,
      firefliesTotal: LEVELS[start].fireflies.length,
      runFireflies: 0,
      runFirefliesTotal: TOTAL_FIREFLIES,
      clearTime: 0,
      clearLine: CLEAR_LINES[0],
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
    this.loadLevel(this.hud.levelIndex);
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
    if (state && typeof state === "object") this.store.set({ ...(state as HudState), muted: this.sfx.muted });
  }

  private command(name: Command) {
    if (name === "advance") this.advance();
    else if (name === "restart") this.restartLevel();
    else if (name === "exit") this.exit();
  }

  // ─── Commands (HUD buttons and phone buttons) ───────────────────────────────

  advance() {
    if (this.feed) return this.feed.command("advance");
    if (this.hud.phase === "cleared") {
      const next = this.hud.levelIndex + 1;
      if (next < LEVELS.length) this.transitionTo(next);
      else this.showFinale();
    } else if (this.hud.phase === "finale") {
      this.runFireflies = 0;
      this.transitionTo(0);
    }
  }

  restartLevel() {
    if (this.feed) return this.feed.command("restart");
    this.transitionTo(this.hud.levelIndex);
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

  /** Dev/console: jump straight to a level. */
  loadLevel(index: number) {
    const level = LEVELS[index];
    this.epoch++;
    this.world = new World(level);
    this.renderer.startLevel(this.world);
    this.levelTime = 0;
    this.clearedAt = null;
    this.acc = 0;
    this.fade = 0;
    this.fadeTarget = 1;
    this.latch = { 0: { jump: false, tongue: false }, 1: { jump: false, tongue: false } };
    this.room.setLayout({ kind: "stick+buttons", a: "Jump", b: "Tongue" }, level.caption);
    this.setHud({
      levelIndex: index,
      name: level.name,
      subtitle: level.subtitle,
      phase: "playing",
      levelKey: this.hud.levelKey + 1,
      hint: this.currentHint(),
      fireflies: 0,
      firefliesTotal: level.fireflies.length,
    });
  }

  /** Exposed for automated playtests. */
  get debugWorld() {
    return this.world;
  }

  // ─── Flow ───────────────────────────────────────────────────────────────────

  private transitionTo(index: number) {
    this.pendingLevel = index;
    this.fadeTarget = 0;
  }

  private onCleared() {
    const index = this.hud.levelIndex;
    this.runFireflies += this.world.collected;
    writeProgress(Math.min(index + 1, LEVELS.length - 1));
    this.room.setLayout({ kind: "buttons", a: index + 1 < LEVELS.length ? "Next level" : "Finish" }, "Level cleared");
    this.setHud({
      phase: "cleared",
      clearTime: this.levelTime,
      clearLine: CLEAR_LINES[index % CLEAR_LINES.length],
      runFireflies: this.runFireflies,
    });
  }

  private showFinale() {
    writeProgress(0);
    this.room.setLayout({ kind: "buttons", a: "Play again", b: "Lobby" }, "You made it");
    this.setHud({ phase: "finale" });
  }

  private onPress(playerId: string, button: "a" | "b") {
    const slot = this.players.find((p) => p.id === playerId)?.slot;
    if (slot === undefined) return;
    this.sfx.unlock();
    const phase = this.hud.phase;
    if (phase === "playing") {
      if (button === "a") this.latch[slot].jump = true;
      else this.latch[slot].tongue = true;
      return;
    }
    if (this.clearedAt !== null && this.levelTime - this.clearedAt < CLEAR_DELAY + 0.4) return;
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
    const paused = this.hud.waitingFor !== null || this.pendingLevel !== null;
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

    const opts: FrameOptions = { fade: this.fade, names: clamp01((INTRO_SECONDS + 1.6 - this.levelTime) / 1.2) };
    this.renderer.draw(this.world, paused ? 1 : this.acc / STEP, dt, opts);
    this.publisher?.publish(now, () => ({ world: capture(this.world, this.hud.levelIndex, this.epoch), opts }));
  };

  /** Remote screen: pose the world from the host's frames and play their events. */
  private follow(now: number, dt: number) {
    const s = this.follower!.sample(now);
    if (!s) return this.renderer.draw(this.world, 1, dt, { fade: 0, names: 0 });
    const level = s.to.world.level;
    if (s.to.world.epoch !== this.shownEpoch && LEVELS[level]) {
      this.shownEpoch = s.to.world.epoch;
      this.world = new World(LEVELS[level]);
      this.renderer.startLevel(this.world);
    }
    restore(this.world, s.from.world, s.to.world, s.t);
    if (s.events.length) this.react(s.events);
    this.renderer.draw(this.world, s.t, dt, lerpNumbers(s.from.opts, s.to.opts, s.t));
  }

  private tick() {
    const playing = this.hud.phase === "playing";
    const inputs = SLOTS.map((s) => (playing ? this.readInput(s) : IDLE_INPUT)) as [FrogInput, FrogInput];
    const events = this.world.step(inputs);
    this.levelTime += STEP;
    if (events.length) this.react(events);

    this.hintClock += STEP;
    if (this.hintClock > 0.25) {
      this.hintClock = 0;
      const hint = this.currentHint();
      if (hint !== this.hud.hint) this.setHud({ hint });
    }
    if (this.clearedAt !== null && this.hud.phase === "playing" && this.levelTime - this.clearedAt > CLEAR_DELAY) this.onCleared();
  }

  private readInput(slot: Slot): FrogInput {
    const s = this.room.inputForSlot(slot);
    const l = this.latch[slot];
    const input: FrogInput = { x: s.x, y: s.y, jump: s.a, tongue: s.b, jumpPressed: l.jump, tonguePressed: l.tongue };
    l.jump = false;
    l.tongue = false;
    return input;
  }

  private react(events: readonly WorldEvent[]) {
    this.publisher?.events(events);
    this.renderer.handle(this.world, events);
    for (const e of events) {
      const pattern = HAPTICS[e.type];
      if (pattern !== undefined && "slot" in e) this.buzz(e.slot, pattern);
      switch (e.type) {
        case "jump":
          this.sfx.play("jump");
          break;
        case "land":
          this.sfx.play("land", { intensity: Math.min(1, e.impact / 1300) });
          break;
        case "tongue-fire":
          this.sfx.play("tongue");
          break;
        case "tongue-attach":
          if (e.target.kind === "frog") {
            this.sfx.play("tie");
            this.buzz(e.target.slot, [20, 40, 20]);
          } else this.sfx.play("attach");
          break;
        case "tongue-release":
          this.sfx.play("release");
          break;
        case "firefly":
          this.sfx.firefly(e.collected - 1);
          this.setHud({ fireflies: e.collected });
          break;
        case "splash":
          this.sfx.play("splash");
          break;
        case "plate":
          if (e.pressed) {
            this.sfx.play("plate");
            SLOTS.forEach((s) => this.buzz(s, 12));
          }
          break;
        case "complete":
          this.sfx.play("complete");
          SLOTS.forEach((s) => this.buzz(s, [30, 60, 30, 60, 90]));
          this.clearedAt = this.levelTime;
          break;
      }
    }
  }

  private buzz(slot: Slot, pattern: number | number[]) {
    const id = this.players.find((p) => p.slot === slot)?.id;
    if (id) this.room.haptic(id, pattern);
  }

  private updateFade(dt: number) {
    const speed = this.fadeTarget > this.fade ? 1.6 : 3;
    this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + dt * speed) : Math.max(this.fadeTarget, this.fade - dt * speed);
    if (this.pendingLevel !== null && this.fade <= 0) {
      const next = this.pendingLevel;
      this.pendingLevel = null;
      this.loadLevel(next);
    }
  }

  private currentHint(): string | null {
    const hints = this.world.level.hints;
    for (let i = hints.length - 1; i >= 0; i--) {
      const h = hints[i];
      if (!h.when || h.when(this.world)) return h.text;
    }
    return null;
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function readProgress(): number {
  try {
    const n = Number(localStorage.getItem(PROGRESS_KEY));
    return Number.isInteger(n) && n >= 0 && n < LEVELS.length ? n : 0;
  } catch {
    return 0;
  }
}

function writeProgress(index: number) {
  try {
    localStorage.setItem(PROGRESS_KEY, String(index));
  } catch {}
}
