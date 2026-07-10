"use client";

/**
 * Stage SFX — a fully SYNTHESIZED Web Audio kit for the Showtime stage. No asset
 * files: every cue is built from oscillators + a shared white-noise buffer, so the
 * stage boots instantly and works offline inside TikTok LIVE Studio's capture
 * browser. Follows the proven lib/games/audio.ts pattern (lazy context, gesture
 * unlock, graceful failure) with a master gain bus added so the voice hosts can
 * duck the whole SFX layer while speaking.
 *
 * Design constraints:
 *  - Master peak stays modest (~0.5) so stacked cues never clip the capture feed.
 *  - Every voice envelope starts/ends at ~0 via exponential ramps — click-free.
 *  - arm() resumes a suspended context; call it on load AND on the first pointer
 *    event (inside LIVE Studio autoplay is typically allowed, in a normal tab the
 *    pointer event does the unlock). All failures are silent — the show never
 *    depends on audio.
 */

import type { GiftTier } from "@/lib/showtime/types";

/** Master gain when fully open. Voices peak well under 1.0 pre-master. */
const MASTER_LEVEL = 0.5;
/** Duck multiplier while a host voice is speaking. */
const DUCK_LEVEL = 0.35;

type SweepFilter = { type: BiquadFilterType; from: number; to?: number; q?: number };

type ToneOpts = {
  /** Seconds after "now" to start. */
  at?: number;
  type?: OscillatorType;
  /** Peak voice gain (pre-master). */
  vol?: number;
  /** Attack seconds (default 0.008). */
  attack?: number;
  /** Seconds held at peak after the attack before the decay begins. */
  sustain?: number;
  /** Exponential frequency glide target (Hz). */
  glideTo?: number;
  /** Glide duration in seconds (defaults to the full duration). */
  glideTime?: number;
  /** Cents. */
  detune?: number;
  filter?: SweepFilter;
};

type BurstOpts = {
  at?: number;
  vol?: number;
  attack?: number;
  sustain?: number;
  filter?: SweepFilter;
};

export class StageAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted: boolean;
  private ducked = false;
  private disposed = false;

  constructor(muted = false) {
    this.muted = muted;
  }

  /** Resume/create the context. Call on load and on the first pointer event. */
  arm(): void {
    this.ensure();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyLevel(0.05);
  }

  /** duck(true) drops the SFX bus to ~35% while a host voice speaks. */
  duck(on: boolean): void {
    this.ducked = on;
    this.applyLevel(0.08);
  }

  /* ── Cues ──────────────────────────────────────────────────────────────── */

  /** Soft pluck — a unit entering the field. */
  spawn(): void {
    this.tone(740, 0.12, { type: "triangle", vol: 0.09, attack: 0.004, glideTo: 620, glideTime: 0.12 });
    this.tone(1480, 0.08, { type: "sine", vol: 0.04, at: 0.012, attack: 0.004 });
  }

  /** Gift strike — escalates by coin-value tier. */
  strike(tier: GiftTier): void {
    if (tier === 0) {
      // Short whoosh + snap.
      this.burst(0.14, { vol: 0.1, attack: 0.01, filter: { type: "bandpass", from: 500, to: 2600, q: 1.2 } });
      this.burst(0.04, { at: 0.11, vol: 0.16, attack: 0.003, filter: { type: "highpass", from: 2000 } });
      this.tone(220, 0.08, { at: 0.11, type: "square", vol: 0.05, attack: 0.003, glideTo: 140 });
    } else if (tier === 1) {
      // Brass hit — detuned saws, punchy closing lowpass.
      for (const d of [-14, 0, 12]) {
        this.tone(196, 0.4, {
          type: "sawtooth",
          vol: 0.07,
          attack: 0.012,
          detune: d,
          glideTo: 185,
          glideTime: 0.4,
          filter: { type: "lowpass", from: 1600, to: 500, q: 0.8 },
        });
      }
      this.burst(0.05, { vol: 0.12, attack: 0.003, filter: { type: "highpass", from: 1200 } });
    } else if (tier === 2) {
      // Deep boom + rumble.
      this.burst(0.05, { vol: 0.14, attack: 0.003, filter: { type: "highpass", from: 1500 } });
      this.tone(150, 0.7, { type: "sine", vol: 0.3, attack: 0.006, glideTo: 44, glideTime: 0.5 });
      this.burst(0.9, { vol: 0.14, attack: 0.01, filter: { type: "lowpass", from: 900, to: 120 } });
    } else if (tier === 3) {
      // Cinematic impact with sub drop + metallic ring.
      this.burst(0.06, { vol: 0.18, attack: 0.002, filter: { type: "highpass", from: 900 } });
      this.tone(120, 1.3, { type: "sine", vol: 0.34, attack: 0.005, glideTo: 30, glideTime: 1.0 });
      this.burst(1.4, { vol: 0.16, attack: 0.008, filter: { type: "lowpass", from: 4000, to: 150, q: 0.7 } });
      this.tone(880, 1.6, { type: "triangle", vol: 0.04, attack: 0.01, detune: -8 });
      this.tone(1244.5, 1.6, { type: "triangle", vol: 0.04, attack: 0.01, detune: 6 });
    } else {
      // Legend: 3s riser → huge impact → shimmer tail.
      this.burst(3.0, { vol: 0.14, attack: 2.8, filter: { type: "bandpass", from: 300, to: 3600, q: 1.1 } });
      this.tone(110, 3.0, {
        type: "sawtooth",
        vol: 0.07,
        attack: 2.6,
        glideTo: 440,
        glideTime: 3.0,
        filter: { type: "lowpass", from: 800, to: 3000 },
      });
      this.tone(110, 3.0, { type: "sawtooth", vol: 0.06, attack: 2.6, detune: 10, glideTo: 442, glideTime: 3.0 });
      this.burst(0.07, { at: 3.0, vol: 0.2, attack: 0.002, filter: { type: "highpass", from: 800 } });
      this.tone(140, 1.4, { at: 3.0, type: "sine", vol: 0.38, attack: 0.005, glideTo: 28, glideTime: 1.1 });
      this.burst(1.8, { at: 3.0, vol: 0.18, attack: 0.006, filter: { type: "lowpass", from: 5000, to: 120 } });
      this.tone(1567.98, 2.6, { at: 3.15, type: "sine", vol: 0.035, attack: 0.4, detune: -6 });
      this.tone(2093, 2.6, { at: 3.15, type: "sine", vol: 0.035, attack: 0.4, detune: 5 });
      this.tone(2637, 2.6, { at: 3.15, type: "sine", vol: 0.03, attack: 0.4, detune: -4 });
    }
  }

  /** Rising filtered sweep — surge meter fills / surge triggers. */
  surge(): void {
    this.tone(90, 1.0, {
      type: "sawtooth",
      vol: 0.12,
      attack: 0.05,
      glideTo: 360,
      glideTime: 0.9,
      filter: { type: "lowpass", from: 300, to: 3200, q: 1.4 },
    });
    this.burst(1.0, { vol: 0.07, attack: 0.5, filter: { type: "bandpass", from: 400, to: 2400, q: 1.5 } });
  }

  /** War horn — detuned saws swelling through a lowpass, with a sub root. */
  horn(): void {
    for (const d of [-14, 0, 11]) {
      this.tone(98, 1.8, {
        type: "sawtooth",
        vol: 0.09,
        attack: 0.22,
        sustain: 0.9,
        detune: d,
        filter: { type: "lowpass", from: 480, to: 900, q: 1.1 },
      });
    }
    this.tone(49, 1.8, { type: "sine", vol: 0.1, attack: 0.25, sustain: 0.9 });
  }

  /** Tense pulse — sudden death begins. */
  suddenDeath(): void {
    this.tone(110, 2.2, { type: "sine", vol: 0.05, attack: 0.3, sustain: 1.4 });
    this.tone(116.5, 2.2, { type: "sine", vol: 0.05, attack: 0.3, sustain: 1.4 }); // dissonant beat
    for (let i = 0; i < 5; i++) {
      this.tone(82, 0.16, { at: i * 0.4, type: "triangle", vol: 0.1 + i * 0.015, attack: 0.006 });
    }
    this.tone(1320, 0.05, { at: 1.6, type: "sine", vol: 0.05, attack: 0.004 });
  }

  /** Crack + debris — a keep's core shatters. */
  coreBreak(): void {
    this.burst(0.07, { vol: 0.24, attack: 0.002, filter: { type: "highpass", from: 700 } });
    this.tone(160, 0.25, { type: "square", vol: 0.09, attack: 0.004, glideTo: 50, glideTime: 0.25 });
    this.tone(60, 1.2, { type: "sine", vol: 0.22, attack: 0.01, glideTo: 34, glideTime: 0.9 });
    for (let i = 0; i < 7; i++) {
      const at = 0.08 + i * 0.12 + Math.random() * 0.05;
      const f = 2600 - i * 280 + Math.random() * 200;
      this.burst(0.06, { at, vol: 0.1 * (1 - i / 9), attack: 0.004, filter: { type: "bandpass", from: f, q: 2.5 } });
    }
  }

  /** Short layered victory motif. */
  fanfare(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const starts = [0, 0.15, 0.3, 0.48];
    for (let i = 0; i < notes.length; i++) {
      const last = i === notes.length - 1;
      const dur = last ? 0.9 : 0.2;
      this.tone(notes[i], dur, { at: starts[i], type: "square", vol: 0.06, attack: 0.008, sustain: last ? 0.3 : 0 });
      this.tone(notes[i], dur, { at: starts[i], type: "triangle", vol: 0.08, attack: 0.008, detune: 6 });
      this.tone(notes[i] / 2, dur, { at: starts[i], type: "sine", vol: 0.05, attack: 0.008 });
    }
    this.burst(0.5, { at: 0.5, vol: 0.04, attack: 0.05, filter: { type: "highpass", from: 5000 } });
  }

  /** Tiny UI blip. */
  tick(): void {
    this.tone(1245, 0.045, { type: "sine", vol: 0.05, attack: 0.004 });
  }

  dispose(): void {
    this.disposed = true;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  /* ── Engine ────────────────────────────────────────────────────────────── */

  private ensure(): AudioContext | null {
    if (this.disposed || typeof window === "undefined") return null;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.targetLevel();
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Context gate for cue scheduling — skip work entirely while muted. */
  private ready(): AudioContext | null {
    if (this.muted || this.disposed) return null;
    return this.ensure();
  }

  private targetLevel(): number {
    if (this.muted) return 0.0001;
    return MASTER_LEVEL * (this.ducked ? DUCK_LEVEL : 1);
  }

  /** Smoothly move the master bus to the current mute/duck target. */
  private applyLevel(timeConstant: number): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.targetLevel(), this.ctx.currentTime, timeConstant);
  }

  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  /** Click-free attack/(sustain)/decay envelope shared by tone() and burst(). */
  private envelope(ctx: AudioContext, t: number, dur: number, vol: number, attackIn: number, sustainIn: number): GainNode {
    const attack = Math.min(Math.max(attackIn, 0.003), dur * 0.9);
    const sustain = Math.max(0, Math.min(sustainIn, dur - attack - 0.05));
    const peak = Math.max(vol, 0.001);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (sustain > 0) g.gain.setValueAtTime(peak, t + attack + sustain);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private sweep(ctx: AudioContext, t: number, dur: number, f: SweepFilter): BiquadFilterNode {
    const node = ctx.createBiquadFilter();
    node.type = f.type;
    node.frequency.setValueAtTime(Math.max(20, f.from), t);
    if (f.to !== undefined) node.frequency.exponentialRampToValueAtTime(Math.max(20, f.to), t + dur);
    if (f.q !== undefined) node.Q.setValueAtTime(f.q, t);
    return node;
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}): void {
    const ctx = this.ready();
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (o.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glideTo), t + (o.glideTime ?? dur));
    }
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    const g = this.envelope(ctx, t, dur, o.vol ?? 0.12, o.attack ?? 0.008, o.sustain ?? 0);
    let head: AudioNode = osc;
    if (o.filter) {
      const f = this.sweep(ctx, t, dur, o.filter);
      head.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private burst(dur: number, o: BurstOpts = {}): void {
    const ctx = this.ready();
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    src.loop = true; // buffer is 2s; loop covers long risers/rumbles
    const g = this.envelope(ctx, t, dur, o.vol ?? 0.1, o.attack ?? 0.008, o.sustain ?? 0);
    let head: AudioNode = src;
    if (o.filter) {
      const f = this.sweep(ctx, t, dur, o.filter);
      head.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}
