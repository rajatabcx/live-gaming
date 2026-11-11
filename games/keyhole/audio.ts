import { PENTATONIC, Synth } from "../kit/synth";

// A quiet old house: a low room tone and, now and then, a far-off clock tick.
// Locks click, lamps and piano keys ring their own notes — the same notes the
// music box hums, so a melody heard on one side can be played on the other.

export type Cue = "open" | "close" | "cursor" | "turn" | "wrong" | "solved" | "item" | "reveal" | "pass" | "peek" | "eyes" | "bump" | "unlocked" | "opened" | "finale";

export class Sfx extends Synth {
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

  play(cue: Cue) {
    const t = this.now;
    if (t === null) return;
    switch (cue) {
      case "open":
        this.hiss(t, 0.18, 2400, 0.04);
        this.tone("triangle", 220, 330, t, 0.12, 0.03);
        break;
      case "close":
        this.hiss(t, 0.12, 1600, 0.03);
        this.tone("triangle", 300, 200, t, 0.1, 0.025);
        break;
      case "cursor":
        this.tone("sine", 1400, 1400, t, 0.04, 0.02);
        break;
      case "turn":
        this.hiss(t, 0.05, 5000, 0.05);
        this.tone("square", 1800, 900, t, 0.03, 0.012);
        break;
      case "wrong":
        this.tone("triangle", 180, 120, t, 0.35, 0.08);
        this.tone("triangle", 170, 110, t + 0.08, 0.3, 0.06);
        break;
      case "solved":
        this.tone("triangle", 160, 90, t, 0.15, 0.1);
        [0, 2, 4].forEach((n, i) => this.bell(PENTATONIC[n], t + 0.12 + i * 0.1, 1.4, 0.04));
        break;
      case "item":
        [4, 7].forEach((n, i) => this.bell(PENTATONIC[n], t + i * 0.08, 1, 0.035));
        break;
      case "reveal":
        [7, 5, 4, 2].forEach((n, i) => this.bell(PENTATONIC[n] * 2, t + i * 0.06, 1.2, 0.015));
        this.pad(PENTATONIC[0], t, 2, 0.02, 0.3);
        break;
      case "pass":
        this.hiss(t, 0.35, 3000, 0.04);
        this.bell(PENTATONIC[5], t + 0.2, 0.9, 0.03);
        break;
      case "peek":
        this.hiss(t, 0.25, 800, 0.03);
        break;
      case "eyes":
        [0, 4].forEach((n) => this.pad(PENTATONIC[n], t, 2.4, 0.03, 0.2));
        [2, 4, 7].forEach((n, i) => this.bell(PENTATONIC[n], t + 0.1 + i * 0.14, 1.6, 0.03));
        break;
      case "bump":
        this.tone("triangle", 140, 70, t, 0.18, 0.08);
        break;
      case "unlocked":
        this.tone("triangle", 200, 80, t, 0.25, 0.12);
        this.hiss(t, 0.1, 4000, 0.06);
        [0, 4, 7].forEach((n, i) => this.bell(PENTATONIC[n], t + 0.3 + i * 0.12, 2, 0.04));
        break;
      case "opened":
        [0, 2, 4, 7].forEach((n, i) => this.bell(PENTATONIC[n], t + i * 0.14, 2.4, 0.05));
        [0, 4].forEach((n) => this.pad(PENTATONIC[n] / 2, t, 4, 0.03, 0.4));
        break;
      case "finale":
        [0, 4, 7].forEach((n) => this.pad(PENTATONIC[n] / 2, t, 7, 0.04, 1.5));
        [0, 2, 4, 5, 7].forEach((n, i) => this.bell(PENTATONIC[n] * 2, t + 0.8 + i * 0.22, 2.5, 0.03));
        break;
    }
  }

  /** A lamp or piano key: note `n` of the shared scale. Lamps ring, keys strike. */
  note(n: number, style: "lamps" | "piano") {
    const t = this.now;
    if (t === null) return;
    const f = PENTATONIC[n % PENTATONIC.length];
    if (style === "piano") {
      this.tone("triangle", f, f, t, 1.1, 0.07);
      this.tone("sine", f * 2, f * 2, t, 0.5, 0.02);
    } else {
      this.bell(f * 2, t, 1.2, 0.035);
    }
  }

  /** The music box: a tune once through, tinkly and a little slow. */
  melody(notes: number[]) {
    const t = this.now;
    if (t === null) return;
    notes.forEach((n, i) => {
      const f = PENTATONIC[n] * 2;
      this.bell(f, t + 0.25 + i * 0.4, 1.4, 0.04);
      this.tone("sine", f * 3, f * 3, t + 0.25 + i * 0.4, 0.3, 0.008);
    });
  }

  override destroy() {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    super.destroy();
  }

  protected override onReady() {
    const t = this.now;
    if (t !== null) {
      this.pad(PENTATONIC[0] / 4, t, 7, 0.01, 2.5);
      this.tone("square", 2400, 2200, t + 0.5, 0.015, 0.004);
    }
    this.tickTimer = setTimeout(() => this.onReady(), 5000 + Math.random() * 3000);
  }
}
