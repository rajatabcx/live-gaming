import type { ControllerLayout, InputState, PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import type { ButtonEdge, GameButton, GameRoom, ScreenChannel } from "../types";

interface Binding {
  left: string;
  right: string;
  up: string;
  down: string;
  a: string;
  b: string;
}

/** One keyboard, two players. Each side fits under one hand. */
export const KEYBOARD_BINDINGS: Record<PlayerSlot, Binding> = {
  0: { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", a: "Space", b: "KeyE" },
  1: { left: "KeyJ", right: "KeyL", up: "KeyI", down: "KeyK", a: "KeyU", b: "KeyO" },
};

export const KEYBOARD_PLAYERS: PlayerInfo[] = [
  { id: "kbd-0", slot: 0, name: "Left", connected: true, device: "local" },
  { id: "kbd-1", slot: 1, name: "Right", connected: true, device: "local" },
];

const SLOTS: PlayerSlot[] = [0, 1];

/** Nobody watches a keyboard room remotely. */
const NO_SCREENS: ScreenChannel = { watching: false, frame() {}, state() {}, on: () => () => {} };
const BUTTONS: GameButton[] = ["a", "b"];

/**
 * A `GameRoom` driven by the local keyboard, for playtesting without phones.
 * `drive()` lets scripts (or the console) puppet a seat for automated checks.
 */
export class KeyboardRoom implements GameRoom {
  private held = new Set<string>();
  private scripted: Record<PlayerSlot, Partial<InputState> | null> = { 0: null, 1: null };
  private last: Record<PlayerSlot, InputState> = {
    0: { x: 0, y: 0, a: false, b: false },
    1: { x: 0, y: 0, a: false, b: false },
  };
  private listeners = { press: new Set<(e: ButtonEdge) => void>(), release: new Set<(e: ButtonEdge) => void>() };
  layout: { layout: ControllerLayout; caption?: string } = { layout: { kind: "lobby" } };
  readonly screens = NO_SCREENS;

  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      if (!this.isBound(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.sync();
    };
    const up = (e: KeyboardEvent) => {
      if (!this.held.delete(e.code)) return;
      this.sync();
    };
    const blur = () => {
      this.held.clear();
      this.sync();
    };
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener("blur", blur);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
    };
  }

  /** Override a seat's input (null hands it back to the keyboard). */
  drive(slot: PlayerSlot, state: Partial<InputState> | null): void {
    this.scripted[slot] = state;
    this.sync();
  }

  inputForSlot(slot: PlayerSlot): InputState {
    return this.last[slot];
  }

  on(event: "press" | "release", fn: (edge: ButtonEdge) => void): () => void {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }

  setLayout(layout: ControllerLayout, caption?: string): void {
    this.layout = { layout, caption };
  }

  setLayoutFor(): void {}

  haptic(): void {}

  private isBound(code: string) {
    return SLOTS.some((s) => Object.values(KEYBOARD_BINDINGS[s]).includes(code));
  }

  private read(slot: PlayerSlot): InputState {
    const k = KEYBOARD_BINDINGS[slot];
    const h = (code: string) => this.held.has(code);
    const fromKeys: InputState = {
      x: (h(k.right) ? 1 : 0) - (h(k.left) ? 1 : 0),
      y: (h(k.down) ? 1 : 0) - (h(k.up) ? 1 : 0),
      a: h(k.a),
      b: h(k.b),
    };
    return { ...fromKeys, ...this.scripted[slot] };
  }

  /** Recompute snapshots and emit edges, mirroring HostRoom.applyInput. */
  private sync() {
    for (const slot of SLOTS) {
      const prev = this.last[slot];
      const next = this.read(slot);
      this.last[slot] = next;
      const playerId = KEYBOARD_PLAYERS[slot].id;
      for (const button of BUTTONS) {
        if (next[button] && !prev[button]) this.listeners.press.forEach((fn) => fn({ playerId, button }));
        if (!next[button] && prev[button]) this.listeners.release.forEach((fn) => fn({ playerId, button }));
      }
    }
  }
}
