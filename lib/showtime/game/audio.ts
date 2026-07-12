"use client";

/**
 * PENALTY SHOOTOUT — sound.
 *
 * Deliberately minimal: the only sound is the REFEREE WHISTLE before each kick.
 * (The earlier crowd bed / kick / roar layers were removed on request — they read
 * as noise.) The whistle is fully synthesized (Web Audio): a dual detuned square
 * tone with an amplitude-modulated "pea roll", a short blast then a longer one,
 * through a master compressor so it never clips the stream.
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
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
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

  private buildGraph() {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);
  }

  private get t(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private env(node: GainNode, at: number, peak: number, attack: number, decay: number) {
    node.gain.setValueAtTime(0.0001, at);
    node.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  /** The referee's whistle — the one sound in the game. */
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
      // the "pea" trilling the whistle
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
}
