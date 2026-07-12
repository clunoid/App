"use client";

/**
 * PENALTY SHOOTOUT — broadcast sound design, fully procedural (Web Audio).
 *
 * No asset files, no licensing risk, and no toy bleeps: every sound is built the
 * way a sound designer would layer it —
 *  · CROWD BED: two looped pink-noise beds through band-pass filters with slow
 *    independent gain wobble, panned wide. Its level follows match intensity
 *    (murmur → tension on the run-up → eruption on goals).
 *  · GOAL ROAR: a noise swell with a downward band sweep over the bed spike,
 *    plus distant two-note air horns under it.
 *  · DISAPPOINTMENT: the crowd "ohhh" — a band-passed swell that deflates from
 *    700→250 Hz. Reads instantly as a missed chance.
 *  · REFEREE WHISTLE: amplitude-modulated dual tone (the pea roll), double blast.
 *  · KICK: a pitched-down thump (150→55 Hz) + a 8 ms transient click; weight
 *    scales with shot power. NET: a short band-passed swish. SAVE: body thud.
 *  · COUNTDOWN: soft ticks for the last seconds, brighter final tick.
 * Everything flows through one master compressor so peaks never clip the stream.
 */

export class MatchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private bedTarget = 0.16;
  private muted: boolean;
  private disposed = false;

  constructor(muted = false) {
    this.muted = muted;
  }

  /** Create/resume the context (call on load and on first pointer event). */
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
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** True when audio is actually flowing (context created and running). */
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
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);

    // crowd bed: two wide noise layers with independent slow wobble
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = this.bedTarget;
    this.bedGain.connect(this.master);
    for (const [freq, pan, lfoHz] of [
      [520, -0.45, 0.061],
      [880, 0.45, 0.047],
    ] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(4, 0.55);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoHz;
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = 0.18;
      lfo.connect(lfoAmt).connect(g.gain);
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(bp).connect(g).connect(panner).connect(this.bedGain);
      src.start();
      lfo.start();
    }
  }

  /** Pink-ish noise (running average softens the hiss). */
  private noiseBuffer(seconds: number, smooth: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = last * smooth + white * (1 - smooth);
      d[i] = last * 2.4;
    }
    return buf;
  }

  private get t(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private env(node: GainNode, at: number, peak: number, attack: number, decay: number) {
    node.gain.setValueAtTime(0.0001, at);
    node.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  /* ── continuous: crowd intensity 0..1 ─────────────────────────────────── */

  setIntensity(v: number): void {
    if (!this.ctx || !this.bedGain) return;
    const target = 0.1 + Math.min(1, Math.max(0, v)) * 0.45;
    if (Math.abs(target - this.bedTarget) < 0.01) return;
    this.bedTarget = target;
    this.bedGain.gain.setTargetAtTime(target, this.t, 0.6);
  }

  /* ── one-shots ────────────────────────────────────────────────────────── */

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
      // the pea roll
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

  kick(power01: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const at = this.t;
    // thump
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150 + power01 * 60, at);
    o.frequency.exponentialRampToValueAtTime(52, at + 0.1);
    const g = ctx.createGain();
    o.connect(g).connect(this.master);
    this.env(g, at, 0.55 + power01 * 0.35, 0.006, 0.16);
    o.start(at);
    o.stop(at + 0.2);
    // leather transient
    const click = ctx.createBufferSource();
    click.buffer = this.noiseBuffer(0.02, 0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const cg = ctx.createGain();
    click.connect(hp).connect(cg).connect(this.master);
    this.env(cg, at, 0.25, 0.002, 0.03);
    click.start(at);
  }

  netSwish(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const at = this.t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.25, 0.35);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    src.connect(bp).connect(g).connect(this.master);
    this.env(g, at, 0.3, 0.01, 0.2);
    src.start(at);
  }

  saveThud(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const at = this.t;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(105, at);
    o.frequency.exponentialRampToValueAtTime(48, at + 0.13);
    const g = ctx.createGain();
    o.connect(g).connect(this.master);
    this.env(g, at, 0.6, 0.008, 0.2);
    o.start(at);
    o.stop(at + 0.25);
    const body = ctx.createBufferSource();
    body.buffer = this.noiseBuffer(0.09, 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    const bg = ctx.createGain();
    body.connect(lp).connect(bg).connect(this.master);
    this.env(bg, at, 0.3, 0.005, 0.09);
    body.start(at);
  }

  goalRoar(): void {
    if (!this.ctx || !this.master || !this.bedGain) return;
    const ctx = this.ctx;
    const at = this.t;
    // eruption layer
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3.2, 0.62);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(950, at);
    bp.frequency.exponentialRampToValueAtTime(420, at + 2.6);
    bp.Q.value = 0.4;
    const g = ctx.createGain();
    src.connect(bp).connect(g).connect(this.master);
    this.env(g, at, 0.62, 0.14, 2.9);
    src.start(at);
    // bed spike
    this.bedGain.gain.setTargetAtTime(0.6, at, 0.1);
    this.bedGain.gain.setTargetAtTime(this.bedTarget, at + 1.6, 0.9);
    // distant air horns under the roar
    for (const [f, delay] of [
      [233, 0.35],
      [311, 0.75],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, at + delay);
      o.frequency.linearRampToValueAtTime(f * 0.97, at + delay + 1.1);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const hg = ctx.createGain();
      o.connect(lp).connect(hg).connect(this.master);
      this.env(hg, at + delay, 0.07, 0.08, 1.2);
      o.start(at + delay);
      o.stop(at + delay + 1.4);
    }
  }

  disappointment(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const at = this.t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.4, 0.68);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(700, at);
    bp.frequency.exponentialRampToValueAtTime(250, at + 1.1);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    src.connect(bp).connect(g).connect(this.master);
    this.env(g, at, 0.42, 0.1, 1.15);
    src.start(at);
  }

  tick(final = false): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const at = this.t;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = final ? 1560 : 1050;
    const g = ctx.createGain();
    o.connect(g).connect(this.master);
    this.env(g, at, final ? 0.16 : 0.09, 0.004, final ? 0.22 : 0.06);
    o.start(at);
    o.stop(at + 0.3);
  }

  matchEndFanfare(): void {
    this.goalRoar();
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const at = this.t + 0.2;
    // rising three-note brass-ish figure, kept low in the mix
    [262, 330, 392].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      const g = ctx.createGain();
      o.connect(lp).connect(g).connect(this.master!);
      this.env(g, at + i * 0.16, 0.09, 0.03, i === 2 ? 0.9 : 0.18);
      o.start(at + i * 0.16);
      o.stop(at + i * 0.16 + 1.2);
    });
  }
}
