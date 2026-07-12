"use client";

/**
 * PENALTY SHOOTOUT — sound (fully synthesized, no asset files, no licensing risk).
 *
 * Deliberately event-driven, NOT a continuous bed (that read as noise):
 *  · WHISTLE   — the referee, a beat before every kick.
 *  · ROAR      — the crowd erupts the instant a goal hits the net (varied each time).
 *  · GROAN     — the disappointed "ohhh" the instant the keeper saves / a kick misses.
 *  · BIG ROAR  — a longer eruption for a match win.
 * Each roar/groan randomizes its timbre + length so no two sound identical. Everything
 * runs through a master compressor so peaks never clip the stream.
 */

export class MatchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private disposed = false;

  constructor(muted = false) {
    this.muted = muted;
  }

  /** Create/resume the context (call on load and on every pointer event). */
  arm(): void {
    if (this.disposed || this.muted) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.buildGraph();
      } catch {
        return;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (!m) this.arm();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.92, this.ctx.currentTime, 0.05);
  }

  isRunning(): boolean {
    return !!this.ctx && this.ctx.state === "running" && !this.muted;
  }

  isSuspended(): boolean {
    return !this.muted && (!this.ctx || this.ctx.state !== "running");
  }

  dispose(): void {
    this.disposed = true;
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }

  /* ── graph ────────────────────────────────────────────────────────────── */

  private buildGraph() {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 22;
    comp.ratio.value = 4.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.92;
    this.master.connect(comp);
  }

  private get t(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Pink-ish noise (running average softens the hiss into a crowd texture). */
  private noiseBuffer(seconds: number, smooth: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, Math.max(1, n), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = last * smooth + white * (1 - smooth);
      d[i] = last * 2.4;
    }
    return buf;
  }

  private env(node: GainNode, at: number, peak: number, attack: number, decay: number) {
    node.gain.setValueAtTime(0.0001, at);
    node.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  /* ── the referee's whistle ────────────────────────────────────────────── */

  whistle(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const blast = (at: number, dur: number) => {
      const g = ctx.createGain();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1200;
      g.connect(hp).connect(this.master!);
      for (const f of [2480, 2520]) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = 0.5;
        o.connect(og).connect(g);
        o.start(at);
        o.stop(at + dur + 0.02);
      }
      const am = ctx.createOscillator();
      am.frequency.value = 34;
      const amAmt = ctx.createGain();
      amAmt.gain.value = 0.35;
      am.connect(amAmt).connect(g.gain);
      am.start(at);
      am.stop(at + dur + 0.02);
      this.env(g, at, 0.16, 0.015, dur);
    };
    blast(this.t + 0.02, 0.3);
    blast(this.t + 0.44, 0.5);
  }

  /* ── crowd reactions ──────────────────────────────────────────────────── */

  /** A crowd swell: layered band-passed noise with a frequency sweep + shimmer AM. */
  private swell(opts: { at: number; dur: number; peak: number; from: number; to: number; q: number; shimmer: number; pans: number[] }) {
    const ctx = this.ctx!;
    for (const pan of opts.pans) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(opts.dur + 0.4, 0.58);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(opts.from, opts.at);
      bp.frequency.exponentialRampToValueAtTime(Math.max(60, opts.to), opts.at + opts.dur * 0.85);
      bp.Q.value = opts.q;
      const g = ctx.createGain();
      // "many voices" shimmer
      if (opts.shimmer > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5 + Math.random() * 4;
        const amt = ctx.createGain();
        amt.gain.value = opts.shimmer;
        lfo.connect(amt).connect(g.gain);
        lfo.start(opts.at);
        lfo.stop(opts.at + opts.dur + 0.3);
      }
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(bp).connect(g).connect(panner).connect(this.master!);
      this.env(g, opts.at, opts.peak, opts.dur * 0.16, opts.dur);
      src.start(opts.at);
    }
  }

  /** GOAL — the crowd erupts. Rises fast, sustains, sweeps up to a bright "aaah". */
  roar(): void {
    if (!this.ctx || !this.master) return;
    const at = this.t;
    const dur = 2.1 + Math.random() * 0.7;
    const bright = 780 + Math.random() * 260;
    this.swell({ at, dur, peak: 0.5, from: 460, to: bright, q: 0.45, shimmer: 0.16, pans: [-0.5, 0.5] });
    // a short brighter cheer crest on top
    this.swell({ at: at + 0.06, dur: dur * 0.6, peak: 0.2, from: 1100, to: 1600, q: 0.7, shimmer: 0.1, pans: [0] });
  }

  /** SAVE / MISS — the disappointed "ohhh": a swell that sinks in pitch. */
  groan(): void {
    if (!this.ctx || !this.master) return;
    const at = this.t;
    const dur = 1.05 + Math.random() * 0.35;
    const start = 680 + Math.random() * 120;
    this.swell({ at, dur, peak: 0.4, from: start, to: 250, q: 0.85, shimmer: 0.08, pans: [-0.4, 0.4] });
  }

  /** MATCH WIN — a bigger, longer eruption. */
  bigRoar(): void {
    if (!this.ctx || !this.master) return;
    const at = this.t;
    this.swell({ at, dur: 3.4, peak: 0.6, from: 480, to: 900, q: 0.42, shimmer: 0.18, pans: [-0.6, 0.6] });
    this.swell({ at: at + 0.5, dur: 2.6, peak: 0.28, from: 1150, to: 1700, q: 0.7, shimmer: 0.12, pans: [0] });
  }
}
