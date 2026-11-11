import { PENTATONIC, Synth } from "../kit/synth";

// Almost music. Each star you light is the next note of a slow melody;
// under it, a soft pad that drifts between two chords.

export type Cue = "kindle" | "line" | "reveal" | "harmony" | "complete" | "dawn";

const MELODY = [0, 2, 4, 3, 5, 4, 7, 5, 4, 2, 3, 0];
const CHORDS = [
  [130.81, 196.0, 329.63],
  [110.0, 164.81, 261.63],
  [146.83, 220.0, 349.23],
  [123.47, 185.0, 293.66],
];

export class Sfx extends Synth {
  private padTimer: ReturnType<typeof setTimeout> | null = null;
  private chord = 0;

  play(cue: Cue) {
    const t = this.now;
    if (t === null) return;
    switch (cue) {
      case "kindle":
        this.tone("sine", 880, 1320, t, 0.5, 0.012);
        break;
      case "line":
        this.bell(PENTATONIC[7] * 1.5, t, 0.9, 0.018);
        break;
      case "reveal":
        [7, 5, 7].forEach((n, i) => this.bell(PENTATONIC[n] * 2, t + i * 0.07, 0.5, 0.02));
        break;
      case "harmony":
        [0, 2, 4].forEach((n) => this.pad(PENTATONIC[n], t, 2.4, 0.03, 0.05));
        this.bell(PENTATONIC[4] * 2, t + 0.05, 1.4, 0.03);
        break;
      case "complete":
        [0, 2, 4, 5, 7].forEach((n, i) => this.bell(PENTATONIC[n], t + i * 0.16, 2.2, 0.05));
        break;
      case "dawn":
        [0, 4, 7].forEach((n) => this.pad(PENTATONIC[n] / 2, t, 7, 0.05, 2));
        [0, 2, 4, 5, 7].forEach((n, i) => this.bell(PENTATONIC[n] * 2, t + 1 + i * 0.25, 2.5, 0.03));
        break;
    }
  }

  /** The n-th star of the night plays the n-th note of the tune. */
  star(n: number) {
    const t = this.now;
    if (t === null) return;
    this.bell(PENTATONIC[MELODY[n % MELODY.length]], t, 1.8, 0.06);
  }

  /** Each player's glow has its own soft voice. */
  glow(slot: 0 | 1) {
    const t = this.now;
    if (t === null) return;
    const f = slot === 0 ? PENTATONIC[2] : PENTATONIC[4];
    this.tone("sine", f * 0.5, f, t, 0.6, 0.03);
  }

  override destroy() {
    if (this.padTimer) clearTimeout(this.padTimer);
    super.destroy();
  }

  protected override onReady() {
    const t = this.now;
    if (t !== null) {
      for (const f of CHORDS[this.chord % CHORDS.length]) this.pad(f, t, 10, 0.018, 3);
      this.chord++;
    }
    this.padTimer = setTimeout(() => this.onReady(), 8000);
  }
}
