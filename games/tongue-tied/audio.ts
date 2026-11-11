// Procedural sound: every effect is synthesized, so the game ships no audio files.
// Quiet by design — this is a couch game, not an arcade cabinet.

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
const MUTE_KEY = "duet.sound.muted";

export type Cue =
  | "jump"
  | "land"
  | "tongue"
  | "attach"
  | "tie"
  | "release"
  | "splash"
  | "plate"
  | "complete";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private cricketTimer: ReturnType<typeof setTimeout> | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {}
  }

  /** Call from a user gesture (or after one) — browsers keep audio locked until then. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(comp);
      this.noise = this.makeNoise();
      this.scheduleCricket();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  destroy() {
    if (this.cricketTimer) clearTimeout(this.cricketTimer);
    void this.ctx?.close();
    this.ctx = null;
  }

  play(cue: Cue, opts: { intensity?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== "running") return;
    const t = ctx.currentTime;
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
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    this.bell(PENTATONIC[index % PENTATONIC.length] * 2, ctx.currentTime, 0.5, 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private bell(freq: number, at: number, dur: number, gain: number) {
    this.tone("sine", freq, freq, at, dur, gain);
    this.tone("sine", freq * 2.01, freq * 2.01, at, dur * 0.4, gain * 0.3);
  }

  private hiss(at: number, dur: number, cutoff: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at);
    src.stop(at + dur);
  }

  private makeNoise() {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Distant crickets, every few seconds. Barely there. */
  private scheduleCricket() {
    this.cricketTimer = setTimeout(() => {
      const ctx = this.ctx;
      if (ctx && ctx.state === "running") {
        const t = ctx.currentTime;
        const pitch = 4000 + Math.random() * 600;
        for (let i = 0; i < 3; i++) this.tone("sine", pitch, pitch, t + i * 0.055, 0.035, 0.007);
      }
      this.scheduleCricket();
    }, 2500 + Math.random() * 4500);
  }
}
