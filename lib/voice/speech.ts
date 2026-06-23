"use client";

type Alignment = { chars: string[] | null; times: number[] | null };
type TtsPayload = { audio: string } & Alignment;

/**
 * Plays Isaac's speech (ElevenLabs base64 + character timestamps). Exposes:
 *  - live amplitude (0..1) for the orb,
 *  - synced progress (how many characters have been spoken) for caption highlight.
 * Lines can be PREFETCHED so the next beat's audio is ready the instant the
 * current one ends — no gap, no "lag" (critical over slow/remote networks).
 * Call stop() to interrupt instantly (barge-in).
 */
export class SpeechPlayer {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private onAmplitude?: (v: number) => void;
  private onProgress?: (charIndex: number, total: number) => void;
  private times: number[] | null = null;
  private ptr = 0;
  // In-flight / ready TTS fetches keyed by line, so play() can start instantly.
  private cache = new Map<string, Promise<TtsPayload | null>>();

  constructor(onAmplitude?: (v: number) => void) {
    this.onAmplitude = onAmplitude;
  }

  private fetchTts(text: string): Promise<TtsPayload | null> {
    return fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (res) => (!res.ok || res.status === 204 ? null : ((await res.json()) as TtsPayload)))
      .catch(() => null);
  }

  /** Begin fetching a line's audio ahead of time (call for the NEXT beat). */
  prefetch(text: string): void {
    const key = text.trim();
    if (!key || this.cache.has(key)) return;
    this.cache.set(key, this.fetchTts(key));
  }

  async play(text: string, onProgress?: (charIndex: number, total: number) => void): Promise<void> {
    this.stopAudio();
    const key = text.trim();
    if (!key) return;
    this.onProgress = onProgress;

    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.fetchTts(key);
      this.cache.set(key, pending);
    }
    const payload = await pending;
    this.cache.delete(key); // one-shot: consume it
    if (!payload?.audio) {
      // No voice (e.g. ElevenLabs key absent) — DON'T flash straight to the end.
      // Reveal the line and hold it for a readable beat so explainers/calculations
      // still pace normally and every card/visual is seen. Fully time-based.
      this.onProgress?.(text.length, text.length);
      return new Promise<void>((resolve) => {
        const ms = Math.min(9000, Math.max(1800, text.trim().length * 45));
        setTimeout(resolve, ms);
      });
    }

    this.times = payload.times ?? null;
    this.ptr = 0;
    const total = payload.times?.length ?? text.length;

    const blob = b64ToBlob(payload.audio, "audio/mpeg");
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.audio = audio;
    this.setupAnalyser(audio);

    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        this.onProgress?.(total, total); // reveal all at the end
        URL.revokeObjectURL(url);
        this.teardownAnalyser();
        resolve();
      };
      // Safety net: never let Isaac get stuck "speaking" if audio stalls.
      const guard = setTimeout(done, Math.min(60000, text.length * 130 + 6000));
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
      this.loop(total);
    });
  }

  private setupAnalyser(audio: HTMLAudioElement) {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      const src = this.ctx.createMediaElementSource(audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch {
      /* amplitude is optional */
    }
  }

  private loop = (total: number) => {
    // amplitude
    if (this.analyser) {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const v of data) sum += v;
      this.onAmplitude?.(Math.min(1, (sum / data.length / 255) * 1.8));
    }
    // synced caption progress
    if (this.times && this.audio && this.onProgress) {
      const t = this.audio.currentTime;
      while (this.ptr < this.times.length && this.times[this.ptr] <= t) this.ptr++;
      this.onProgress(this.ptr, total);
    }
    this.raf = requestAnimationFrame(() => this.loop(total));
  };

  private teardownAnalyser() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onAmplitude?.(0);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
  }

  /** Stop the current audio but KEEP prefetched lines ready (used between beats). */
  private stopAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio = null;
    }
    this.teardownAnalyser();
  }

  /** Full stop / barge-in: also drop any prefetched audio (it's now stale). */
  stop() {
    this.stopAudio();
    this.cache.clear();
  }
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
