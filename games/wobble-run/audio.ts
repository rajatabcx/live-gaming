import { PENTATONIC, Synth } from "../kit/synth";

// Bouncy and short. Everything here is rubber, sugar and air.

export type Cue =
  | "jump"
  | "land"
  | "dive"
  | "flop"
  | "bump"
  | "bonk"
  | "whack"
  | "bounce"
  | "crumble"
  | "slam"
  | "fall"
  | "respawn"
  | "checkpoint"
  | "finish"
  | "runnerUp"
  | "match";

export class Sfx extends Synth {
  play(cue: Cue, opts: { intensity?: number } = {}) {
    const t = this.now;
    if (t === null) return;
    switch (cue) {
      case "jump":
        this.tone("sine", 300, 620, t, 0.1, 0.06);
        break;
      case "land":
        this.tone("triangle", 140, 60, t, 0.09, 0.04 + 0.08 * (opts.intensity ?? 0.5));
        break;
      case "dive":
        this.hiss(t, 0.18, 2400, 0.05);
        this.tone("sine", 520, 260, t, 0.16, 0.04);
        break;
      case "flop":
        this.hiss(t, 0.12, 700, 0.09);
        this.tone("triangle", 180, 70, t, 0.14, 0.07);
        break;
      case "bump":
        this.tone("sine", 240, 180, t, 0.08, 0.05);
        break;
      case "bonk":
        this.tone("square", 320, 120, t, 0.12, 0.035);
        this.tone("sine", 660, 300, t, 0.18, 0.05);
        break;
      case "whack":
        this.hiss(t, 0.08, 4200, 0.08);
        this.tone("triangle", 420, 140, t, 0.22, 0.07);
        // The wobble after the hit.
        for (let i = 0; i < 3; i++) this.tone("sine", 300 - i * 40, 340 - i * 40, t + 0.08 + i * 0.07, 0.07, 0.03);
        break;
      case "bounce":
        this.tone("sine", 220, 880, t, 0.22, 0.07);
        this.tone("sine", 440, 1320, t + 0.03, 0.18, 0.03);
        break;
      case "crumble":
        this.hiss(t, 0.22, 1400, 0.06);
        this.hiss(t + 0.06, 0.12, 900, 0.04);
        break;
      case "slam":
        this.tone("sine", 110, 40, t, 0.25, 0.09);
        this.hiss(t, 0.12, 600, 0.05);
        break;
      case "fall":
        this.tone("sine", 900, 220, t, 0.55, 0.04);
        break;
      case "respawn":
        this.tone("sine", 500, 900, t, 0.12, 0.05);
        break;
      case "checkpoint":
        this.bell(PENTATONIC[4], t, 0.4, 0.04);
        break;
      case "finish":
        [0, 2, 4, 7].forEach((n, i) => this.bell(PENTATONIC[n], t + i * 0.09, 1.1, 0.07));
        break;
      case "runnerUp":
        this.bell(PENTATONIC[2], t, 0.6, 0.05);
        break;
      case "match":
        [0, 2, 4, 5, 7, 4, 7].forEach((n, i) => this.bell(PENTATONIC[n] * (i > 4 ? 2 : 1), t + i * 0.12, 1.4, 0.06));
        break;
    }
  }

  /** 3, 2, 1 … go. */
  countdown(n: number) {
    const t = this.now;
    if (t === null) return;
    if (n > 0) this.tone("sine", 440, 440, t, 0.16, 0.06);
    else {
      this.tone("sine", 880, 880, t, 0.36, 0.07);
      this.tone("sine", 1320, 1320, t, 0.3, 0.03);
    }
  }
}
