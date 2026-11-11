import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import type { GameRoom } from "../types";
import { Store } from "../kit/store";
import { Sfx } from "./audio";
import { COURSES } from "./courses";
import { COUNTDOWN, STEP } from "./sim/constants";
import { IDLE_INPUT, World, type RunnerInput, type Slot, type WorldEvent } from "./sim/world";
import { Renderer } from "./render/renderer";

/**
 * - intro: title card, world frozen at the start line
 * - racing: the world runs (its own 3-2-1 first)
 * - heat-over: result card; the world keeps settling with no input
 * - match-over: someone took two heats
 */
export type Phase = "intro" | "racing" | "heat-over" | "match-over";

export interface HudState {
  phase: Phase;
  heat: number;
  heatCount: number;
  name: string;
  subtitle: string;
  /** Bumps on every heat start so the title card can replay. */
  heatKey: number;
  /** 3, 2, 1, 0 (= Go), or null when not counting. */
  countdown: number | null;
  wins: [number, number];
  names: [string, string];
  heatWinner: Slot | null;
  heatTime: number;
  /** Seconds the runner-up finished behind, or null if they didn't. */
  margin: number | null;
  matchWinner: Slot | null;
  line: string;
  muted: boolean;
  waitingFor: string | null;
}

const WINS_NEEDED = 2;
const INTRO_SECONDS = 1.8;
/** Result card shows at least this long before a press can skip it… */
const RESULT_LOCK = 1.2;
/** …and moves on by itself after this. */
const RESULT_AUTO = 5;
const GO_SHOW = 0.8;
const MAX_STEPS_PER_FRAME = 8;
const SLOTS: Slot[] = [0, 1];

const HEAT_LINES = ["Wobbled to victory.", "Pure jelly-legged grace.", "Sticky fingers, fast feet.", "Didn't even spill the sprinkles."];
const MATCH_LINES = ["Champion of the candy course.", "Undisputed wobble royalty.", "Sweetest win of the night."];

const HAPTICS: Partial<Record<WorldEvent["type"], number | number[]>> = {
  jump: 8,
  dive: 14,
  bounce: 16,
  whack: [30, 30, 50],
  fall: [40, 40, 60],
  respawn: 12,
  checkpoint: 10,
};

/**
 * A best-of-three match. Owns the loop: phones' input in, fixed sim steps,
 * events out to sound/haptics/renderer, and a small HUD store React reads
 * with useSyncExternalStore. React never touches per-frame state.
 */
export class Session {
  private world: World;
  private renderer: Renderer;
  private sfx = new Sfx();
  private raf = 0;
  private last = 0;
  private acc = 0;
  /** Seconds in the current phase. */
  private phaseTime = 0;
  private fade = 0;
  private fadeTarget = 1;
  private pendingHeat: number | null = null;
  private latch: Record<Slot, { jump: boolean; dive: boolean }> = { 0: { jump: false, dive: false }, 1: { jump: false, dive: false } };
  private players: PlayerInfo[] = [];
  private store: Store<HudState>;
  private cleanup: (() => void)[] = [];

  constructor(
    private room: GameRoom,
    private canvas: HTMLCanvasElement,
    private onExit: () => void,
  ) {
    this.renderer = new Renderer(canvas);
    this.renderer.onSlam = () => this.sfx.play("slam");
    this.world = new World(COURSES[0]);
    this.store = new Store<HudState>({
      phase: "intro",
      heat: 0,
      heatCount: COURSES.length,
      name: COURSES[0].name,
      subtitle: COURSES[0].subtitle,
      heatKey: 0,
      countdown: null,
      wins: [0, 0],
      names: ["", ""],
      heatWinner: null,
      heatTime: 0,
      margin: null,
      matchWinner: null,
      line: HEAT_LINES[0],
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
      this.room.on("press", ({ playerId, button }) => this.onPress(playerId, button)),
    );
    this.loadHeat(0);
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
    const names: [string, string] = [bySlot(0)?.name || "Player 1", bySlot(1)?.name || "Player 2"];
    this.renderer.setNames(names);
    const absent = SLOTS.map(bySlot).filter((p) => !p?.connected);
    const waitingFor = absent.length === 0 ? null : (absent.find((p) => p !== undefined)?.name ?? "your partner");
    if (waitingFor !== this.hud.waitingFor || names.join() !== this.hud.names.join()) this.setHud({ waitingFor, names });
  }

  // ─── HUD store (useSyncExternalStore) ───────────────────────────────────────

  subscribe = (fn: () => void) => this.store.subscribe(fn);

  getHud = () => this.store.get();

  private setHud(patch: Partial<HudState>) {
    this.store.set(patch);
  }

  // ─── Commands (HUD buttons and phone buttons) ───────────────────────────────

  /** Next heat, or a fresh match after the final. */
  advance() {
    const { phase, heat } = this.hud;
    if (phase === "heat-over") this.transitionTo(heat + 1);
    else if (phase === "match-over") {
      this.setHud({ wins: [0, 0], matchWinner: null });
      this.transitionTo(0);
    }
  }

  restartHeat() {
    this.transitionTo(this.hud.heat);
  }

  exit() {
    this.onExit();
  }

  toggleMute() {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.muted);
    this.setHud({ muted: this.sfx.muted });
  }

  /** Dev/console: jump straight to a heat. */
  loadHeat(index: number) {
    const course = COURSES[index % COURSES.length];
    this.world = new World(course);
    this.renderer.startHeat(this.world);
    this.acc = 0;
    this.fade = 0;
    this.fadeTarget = 1;
    this.latch = { 0: { jump: false, dive: false }, 1: { jump: false, dive: false } };
    this.room.setLayout({ kind: "stick+buttons", a: "Jump", b: "Dive" }, `Heat ${index + 1} · ${course.name}`);
    this.enter("intro", {
      heat: index,
      name: course.name,
      subtitle: course.subtitle,
      heatKey: this.hud.heatKey + 1,
      countdown: null,
      heatWinner: null,
      margin: null,
    });
  }

  /** Exposed for automated playtests. */
  get debugWorld() {
    return this.world;
  }

  // ─── Flow ───────────────────────────────────────────────────────────────────

  private enter(phase: Phase, patch: Partial<HudState> = {}) {
    this.phaseTime = 0;
    this.setHud({ phase, ...patch });
  }

  private transitionTo(index: number) {
    this.pendingHeat = index;
    this.fadeTarget = 0;
  }

  private onHeatOver() {
    const w = this.world;
    const winner = w.winner;
    const wins: [number, number] = [...this.hud.wins];
    if (winner !== null) wins[winner]++;
    const [a, b] = w.runners;
    const margin = a.finished !== null && b.finished !== null ? Math.abs(a.finished - b.finished) : null;
    const heatTime = winner !== null ? (w.runners[winner].finished ?? 0) : 0;
    const matchWinner = SLOTS.find((s) => wins[s] >= WINS_NEEDED) ?? null;
    const heat = this.hud.heat;

    if (matchWinner !== null || heat + 1 >= COURSES.length) {
      const champ = matchWinner ?? (wins[0] === wins[1] ? null : wins[0] > wins[1] ? 0 : 1);
      this.room.setLayout({ kind: "buttons", a: "Rematch", b: "Lobby" }, "Match over");
      this.sfx.play("match");
      SLOTS.forEach((s) => this.buzz(s, s === champ ? [30, 60, 30, 60, 120] : 20));
      this.enter("match-over", { wins, heatWinner: winner, heatTime, margin, matchWinner: champ, line: MATCH_LINES[(wins[0] + wins[1]) % MATCH_LINES.length] });
    } else {
      this.room.setLayout({ kind: "buttons", a: "Next heat" }, `${winner !== null ? this.hud.names[winner] : "Nobody"} takes heat ${heat + 1}`);
      this.enter("heat-over", { wins, heatWinner: winner, heatTime, margin, line: HEAT_LINES[heat % HEAT_LINES.length] });
    }
  }

  private onPress(playerId: string, button: "a" | "b") {
    const slot = this.players.find((p) => p.id === playerId)?.slot;
    if (slot === undefined) return;
    this.sfx.unlock();
    const phase = this.hud.phase;
    if (phase === "intro" || phase === "racing") {
      if (button === "a") this.latch[slot].jump = true;
      else this.latch[slot].dive = true;
      return;
    }
    if (this.phaseTime < RESULT_LOCK) return;
    if (button === "a") this.advance();
    else if (phase === "match-over") this.exit();
  }

  // ─── Loop ───────────────────────────────────────────────────────────────────

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;

    this.updateFade(dt);
    const paused = this.hud.waitingFor !== null || this.pendingHeat !== null;
    if (!paused) {
      this.phaseTime += dt;
      this.updatePhase();
      if (this.hud.phase !== "intro") {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
          this.tick();
          this.acc -= STEP;
          steps++;
        }
        if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      }
    }

    const showNames = this.hud.phase === "intro" ? 1 : clamp01((COUNTDOWN + 1 - this.world.time) / 0.8);
    this.renderer.draw(this.world, paused || this.hud.phase === "intro" ? 1 : this.acc / STEP, dt, { fade: this.fade, names: showNames });
  };

  private updatePhase() {
    const { phase } = this.hud;
    if (phase === "intro" && this.phaseTime >= INTRO_SECONDS) this.enter("racing");
    else if (phase === "heat-over" && this.phaseTime >= RESULT_AUTO) this.advance();

    if (this.hud.phase === "racing") {
      const left = COUNTDOWN - this.world.time;
      const countdown = left > 0 ? Math.ceil(left) : this.world.raceTime < GO_SHOW ? 0 : null;
      if (countdown !== this.hud.countdown) {
        if (countdown !== null) this.sfx.countdown(countdown);
        this.setHud({ countdown });
      }
    }
  }

  private tick() {
    const racing = this.hud.phase === "racing";
    const inputs = SLOTS.map((s) => (racing ? this.readInput(s) : IDLE_INPUT)) as [RunnerInput, RunnerInput];
    const events = this.world.step(inputs);
    if (events.length) this.react(events);
  }

  private readInput(slot: Slot): RunnerInput {
    const s = this.room.inputForSlot(slot);
    const l = this.latch[slot];
    // The world ignores input until GO, so presses during the countdown are dropped, not banked.
    const input: RunnerInput = { x: s.x, jump: s.a, jumpPressed: l.jump, divePressed: l.dive };
    l.jump = false;
    l.dive = false;
    return input;
  }

  private react(events: readonly WorldEvent[]) {
    this.renderer.handle(this.world, events);
    for (const e of events) {
      const pattern = HAPTICS[e.type];
      if (pattern !== undefined && "slot" in e) this.buzz(e.slot, pattern);
      switch (e.type) {
        case "jump":
        case "dive":
        case "flop":
        case "crumble":
        case "respawn":
        case "checkpoint":
          this.sfx.play(e.type);
          break;
        case "land":
          this.sfx.play("land", { intensity: Math.min(1, e.impact / 1500) });
          break;
        case "bounce":
          this.sfx.play("bounce");
          break;
        case "whack":
          this.sfx.play("whack");
          break;
        case "bump":
          this.sfx.play(e.hard ? "bonk" : "bump");
          if (e.hard && e.victim !== null) this.buzz(e.victim, [40, 20, 40]);
          break;
        case "fall":
          this.sfx.play("fall");
          break;
        case "finish":
          this.sfx.play(e.place === 1 ? "finish" : "runnerUp");
          if (e.place === 1) this.buzz(e.slot, [30, 60, 30, 60, 90]);
          break;
        case "over":
          this.onHeatOver();
          break;
      }
    }
  }

  private buzz(slot: Slot, pattern: number | number[]) {
    const id = this.players.find((p) => p.slot === slot)?.id;
    if (id) this.room.haptic(id, pattern);
  }

  private updateFade(dt: number) {
    const speed = this.fadeTarget > this.fade ? 1.8 : 3;
    this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + dt * speed) : Math.max(this.fadeTarget, this.fade - dt * speed);
    if (this.pendingHeat !== null && this.fade <= 0) {
      const next = this.pendingHeat;
      this.pendingHeat = null;
      this.loadHeat(next);
    }
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
