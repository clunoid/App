"use client";

/**
 * Synthesized game sound effects via the Web Audio API — no asset files, tiny
 * and instant. Everything is optional (setMuted) and the context is only
 * created/resumed after a user gesture (pressing Play). Fresh implementation.
 */
class GameAudio {
  private ctx: AudioContext | null = null;
  private muted = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;

  private ac(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Unlock audio on a user gesture (call when the game starts). */
  unlock() {
    this.ac();
  }

  setMuted(v: boolean) {
    this.muted = v;
    if (v) this.stopMusic();
  }
  isMuted() {
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15, delay = 0) {
    const ctx = this.ac();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** Cheerful pop when a flag appears. */
  pop() {
    this.tone(520, 0.06, "triangle", 0.13, 0);
    this.tone(880, 0.09, "triangle", 0.13, 0.045);
  }
  /** Countdown tick — sharper in the final seconds. */
  tick(urgent = false) {
    this.tone(urgent ? 920 : 640, 0.06, "square", urgent ? 0.11 : 0.06);
  }
  /** Rising arpeggio for a correct answer. */
  correct() {
    this.tone(660, 0.12, "sine", 0.18, 0);
    this.tone(880, 0.12, "sine", 0.18, 0.1);
    this.tone(1175, 0.2, "sine", 0.2, 0.2);
  }
  /** Falling two-note for a wrong answer. */
  wrong() {
    this.tone(330, 0.18, "sawtooth", 0.13, 0);
    this.tone(233, 0.3, "sawtooth", 0.13, 0.12);
  }
  /** Swoosh between rounds. */
  transition() {
    this.tone(523, 0.1, "triangle", 0.09, 0);
    this.tone(784, 0.12, "triangle", 0.09, 0.06);
  }
  /** Little fanfare at game completion. */
  complete() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, "sine", 0.18, i * 0.13));
  }

  /** Subtle background pulse during a round (very low volume). */
  startMusic() {
    if (this.muted || this.musicTimer) return;
    let step = 0;
    const notes = [196, 220, 196, 165];
    const pulse = () => {
      this.tone(notes[step % notes.length], 0.5, "sine", 0.03);
      step++;
    };
    pulse();
    this.musicTimer = setInterval(pulse, 850);
  }
  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

let instance: GameAudio | null = null;
export function getAudio(): GameAudio {
  if (!instance) instance = new GameAudio();
  return instance;
}
