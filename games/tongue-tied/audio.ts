import { PENTATONIC, Synth } from "../kit/synth";

// Quiet by design — this is a couch game, not an arcade cabinet.

export type Cue = "jump" | "land" | "tongue" | "attach" | "tie" | "release" | "splash" | "plate" | "complete";

export class Sfx extends Synth {
  private cricketTimer: ReturnType<typeof setTimeout> | null = null;

  play(cue: Cue, opts: { intensity?: number } = {}) {
    const t = this.now;
    if (t === null) return;
    switch (cue) {
      case "jump":
        this.tone("sine", 420, 700, t, 0.09, 0.07);
        break;
      case "land":
        this.tone("triangle", 150, 70, t, 0.08, 0.05 + 0.08 * (opts.intensity ?? 0.5));
        break;
      case "tongue":
        this.tone("sine", 260, 1150, t, 0.07, 0.05);
        this.hiss(t, 0.05, 3200, 0.025);
        break;
      case "attach":
        this.tone("sine", 660, 640, t, 0.16, 0.07);
        break;
      case "tie":
        this.tone("sine", 660, 660, t, 0.32, 0.06);
        this.tone("sine", 990, 990, t + 0.06, 0.36, 0.05);
        break;
      case "release":
        this.tone("sine", 520, 300, t, 0.08, 0.035);
        break;
      case "splash":
        this.hiss(t, 0.35, 900, 0.12);
        this.tone("sine", 240, 110, t, 0.18, 0.05);
        break;
      case "plate":
        this.tone("triangle", 392, 392, t, 0.12, 0.05);
        this.tone("sine", 784, 784, t + 0.03, 0.22, 0.03);
        break;
      case "complete":
        [0, 2, 4, 5, 7].forEach((n, i) => this.bell(PENTATONIC[n], t + i * 0.11, 1.4, 0.07));
        break;
    }
  }

  /** Fireflies climb the scale as you collect them. */
  firefly(index: number) {
    const t = this.now;
    if (t !== null) this.bell(PENTATONIC[index % PENTATONIC.length] * 2, t, 0.5, 0.05);
  }

  override destroy() {
    if (this.cricketTimer) clearTimeout(this.cricketTimer);
    super.destroy();
  }

  /** Distant crickets, every few seconds. Barely there. */
  protected override onReady() {
    this.cricketTimer = setTimeout(() => {
      const t = this.now;
      if (t !== null) {
        const pitch = 4000 + Math.random() * 600;
        for (let i = 0; i < 3; i++) this.tone("sine", pitch, pitch, t + i * 0.055, 0.035, 0.007);
      }
      this.onReady();
    }, 2500 + Math.random() * 4500);
  }
}
