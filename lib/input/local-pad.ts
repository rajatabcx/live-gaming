import { NEUTRAL_INPUT, type InputState } from "@/lib/realtime/protocol";

/**
 * A controller made of whatever this computer has: the keyboard, plus any
 * gamepad that's plugged in. Produces the same `InputState` a phone sends,
 * so the room can't tell the difference.
 */

const KEYS = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  a: ["Space", "KeyJ"],
  b: ["KeyE", "KeyK", "ShiftLeft", "ShiftRight"],
} as const;

/** How the bindings read on screen. */
export const KEY_LABELS = { move: "WASD / arrows", a: "Space", b: "E" } as const;

const BOUND = new Set<string>(Object.values(KEYS).flat());
const DEADZONE = 0.2;

const isTyping = (el: Element | null) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);

export class LocalPad {
  private held = new Set<string>();
  private last: InputState = NEUTRAL_INPUT;
  private raf = 0;

  constructor(private onChange: (state: InputState) => void) {}

  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      if (!BOUND.has(e.code) || e.metaKey || e.ctrlKey || isTyping(document.activeElement)) return;
      e.preventDefault(); // Space would otherwise click the focused button or scroll
      if (e.repeat) return;
      this.held.add(e.code);
      this.sync();
    };
    const up = (e: KeyboardEvent) => {
      if (this.held.delete(e.code)) this.sync();
    };
    const blur = () => {
      this.held.clear();
      this.sync();
    };
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener("blur", blur);

    // Gamepads have no events for axes; poll only while one is connected.
    const poll = () => {
      this.sync();
      this.raf = this.gamepad() ? requestAnimationFrame(poll) : 0;
    };
    const connected = () => {
      if (!this.raf) this.raf = requestAnimationFrame(poll);
    };
    target.addEventListener("gamepadconnected", connected);
    if (this.gamepad()) connected();

    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
      target.removeEventListener("gamepadconnected", connected);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    };
  }

  private gamepad(): Gamepad | null {
    return navigator.getGamepads?.().find((g) => g?.connected) ?? null;
  }

  private read(): InputState {
    const h = (codes: readonly string[]) => codes.some((c) => this.held.has(c));
    let x = (h(KEYS.right) ? 1 : 0) - (h(KEYS.left) ? 1 : 0);
    let y = (h(KEYS.down) ? 1 : 0) - (h(KEYS.up) ? 1 : 0);
    let a = h(KEYS.a);
    let b = h(KEYS.b);

    const pad = this.gamepad();
    if (pad) {
      const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > DEADZONE) {
        x = ax;
        y = ay;
      }
      x += (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
      y += (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
      a ||= btn(0);
      b ||= btn(1) || btn(2);
    }

    // Diagonals shouldn't be faster than straight lines.
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, a, b };
  }

  private sync() {
    const next = this.read();
    const prev = this.last;
    if (next.x === prev.x && next.y === prev.y && next.a === prev.a && next.b === prev.b) return;
    this.last = next;
    this.onChange(next);
  }
}
