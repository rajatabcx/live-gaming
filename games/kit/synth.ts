// Tiny WebAudio synth shared by games: unlock-on-gesture, persistent mute,
// and a few voices (tone sweep, bell, filtered noise). Games map their own cues.

export const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
const MUTE_KEY = "duet.sound.muted";
const LEVEL = 0.55;

export class Synth {
  protected ctx: AudioContext | null = null;
  protected master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {}
  }

  /** Call from (or after) a user gesture — browsers keep audio locked until then. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : LEVEL;
      this.master.connect(comp);
      this.onReady();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : LEVEL, this.ctx.currentTime, 0.05);
  }

  destroy() {
    void this.ctx?.close();
    this.ctx = null;
  }

  /** Hook for subclasses (ambient beds). */
  protected onReady() {}

  /** Current audio time, or null while locked. */
  protected get now(): number | null {
    return this.ctx && this.master && this.ctx.state === "running" ? this.ctx.currentTime : null;
  }

  protected tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain: number) {
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

  protected bell(freq: number, at: number, dur: number, gain: number) {
    this.tone("sine", freq, freq, at, dur, gain);
    this.tone("sine", freq * 2.01, freq * 2.01, at, dur * 0.4, gain * 0.3);
  }

  protected hiss(at: number, dur: number, cutoff: number, gain: number) {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
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
}
