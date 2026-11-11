import { PENTATONIC, Synth } from "../kit/synth";

// The sea breathes under everything: slow filtered-noise swells. Over it, a
// foghorn, buoy bells, a glassy chime per bottle, and a warm chord at home.

export type Cue = "horn" | "flare" | "scrape" | "wreck" | "afloat" | "buoy" | "spotted" | "docked" | "home";

export class Sfx extends Synth {
  private swellTimer: ReturnType<typeof setTimeout> | null = null;

  play(cue: Cue) {
    const t = this.now;
    if (t === null) return;
    switch (cue) {
      case "horn":
        // Two detuned saws, low and long: a little boat's foghorn.
        this.tone("sawtooth", 116, 108, t, 1.3, 0.05);
        this.tone("sawtooth", 117.5, 109, t, 1.3, 0.04);
        this.tone("sine", 58, 55, t, 1.4, 0.08);
        break;
      case "flare":
        this.hiss(t, 0.9, 3200, 0.05);
        this.tone("sine", 440, 1320, t, 0.7, 0.025);
        break;
      case "scrape":
        this.hiss(t, 0.35, 900, 0.12);
        this.tone("triangle", 90, 50, t, 0.3, 0.12);
        break;
      case "wreck":
        this.hiss(t, 1.4, 700, 0.14);
        this.tone("triangle", 110, 40, t, 1.2, 0.12);
        [4, 2, 0].forEach((n, i) => this.bell(PENTATONIC[n] / 2, t + 0.3 + i * 0.22, 1.2, 0.03));
        break;
      case "afloat":
        [0, 2].forEach((n, i) => this.bell(PENTATONIC[n], t + i * 0.12, 1, 0.03));
        break;
      case "buoy":
        this.bell(PENTATONIC[4], t, 2.4, 0.05);
        this.bell(PENTATONIC[4] * 1.5, t + 0.02, 1.6, 0.015);
        break;
      case "spotted":
        this.tone("sine", PENTATONIC[2], PENTATONIC[2], t, 0.25, 0.025);
        this.tone("sine", PENTATONIC[5], PENTATONIC[5], t + 0.1, 0.5, 0.025);
        break;
      case "docked":
        [0, 2, 4, 7].forEach((n, i) => this.bell(PENTATONIC[n], t + i * 0.14, 2.4, 0.05));
        [0, 4].forEach((n) => this.pad(PENTATONIC[n] / 2, t, 4, 0.03, 0.4));
        break;
      case "home":
        [0, 4, 7].forEach((n) => this.pad(PENTATONIC[n] / 2, t, 7, 0.04, 1.5));
        [0, 2, 4, 5, 7].forEach((n, i) => this.bell(PENTATONIC[n] * 2, t + 0.8 + i * 0.22, 2.5, 0.03));
        break;
    }
  }

  /** Each bottle is the next note up. */
  bottle(n: number) {
    const t = this.now;
    if (t === null) return;
    const f = PENTATONIC[(n + 2) % PENTATONIC.length] * 2;
    this.bell(f, t, 1.4, 0.04);
    this.bell(f * 1.5, t + 0.08, 1, 0.02);
  }

  override destroy() {
    if (this.swellTimer) clearTimeout(this.swellTimer);
    super.destroy();
  }

  protected override onReady() {
    const t = this.now;
    if (t !== null) {
      this.hiss(t, 3.2, 420, 0.035);
      this.pad(PENTATONIC[0] / 4, t, 6, 0.012, 2);
    }
    this.swellTimer = setTimeout(() => this.onReady(), 2600 + Math.random() * 1800);
  }
}
