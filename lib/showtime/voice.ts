"use client";

/**
 * Host voice layer — Isaac + Cluno, the stage's two commentators. Lines are
 * synthesized server-side (POST /api/showtime/tts → base64 mp3) and played
 * through a shared AudioContext at gain 0.9, with onSpeaking callbacks so the
 * stage can duck the SFX bus while a host talks.
 *
 * Design constraints (the show NEVER blocks on voice):
 *  - Priority queue, 0 = highest. Cap 8: lowest-priority lines evicted first,
 *    prio-0 lines are never evicted. Duplicate texts are not re-queued.
 *  - Min 2.5s gap between the end of one line and the start of the next.
 *  - Cost control: LIVE synthesis (cache miss) is limited to 1 per 10s and 120
 *    per hour. Cached lines are exempt. A rate-limited prio-0 line waits for
 *    the 10s window; anything else is dropped.
 *  - Audio cache: Map<speaker+"|"+text, ArrayBuffer>, LRU, 80 entries. warm()
 *    pre-fills it with stock lines (fire-and-forget, staggered one per 2s,
 *    counts against the hourly cap).
 *  - 501 unconfigured / 429 / network failures are swallowed silently.
 */

export type Speaker = "isaac" | "cluno";

export type VoiceLine = { prio: number; speaker: Speaker; text: string };

const QUEUE_CAP = 8;
const MIN_GAP_MS = 2500;
const LIVE_SYNTH_GAP_MS = 10_000;
const HOURLY_SYNTH_CAP = 120;
const HOUR_MS = 3_600_000;
const CACHE_CAP = 80;
const WARM_STAGGER_MS = 2000;
const PLAYBACK_GAIN = 0.9;

/** Fill {name}/{team} in a line template, sanitizing the name for SPEECH. */
export function fillTemplate(t: string, vars: { name?: string; team?: string }): string {
  let name = (vars.name ?? "")
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ") // URLs
    .replace(/[@#]/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ") // letters/digits/spaces only
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20)
    .trim();
  if (!name) name = "a legend";
  const team = (vars.team ?? "").trim();
  return t.replace(/\{name\}/g, name).replace(/\{team\}/g, team);
}

export class HostVoice {
  private creds: { k: string; s: string } | null;
  private muted: boolean;
  private onSpeaking?: (on: boolean) => void;

  private queue: VoiceLine[] = [];
  private cache = new Map<string, ArrayBuffer>();
  private ctx: AudioContext | null = null;
  private current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private speaking = false;
  private busy = false; // a line is fetching/decoding/playing
  private nextAllowedAt = 0; // epoch ms — min-gap gate for the next line start
  private lastLiveSynthAt = 0; // epoch ms of the last cache-miss synthesis
  private synthLog: number[] = []; // epoch ms of syntheses within the last hour
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private warmTimer: ReturnType<typeof setTimeout> | null = null;
  private warmQueue: { speaker: Speaker; text: string }[] = [];
  private disposed = false;

  constructor(creds: { k: string; s: string } | null, opts?: { muted?: boolean; onSpeaking?: (on: boolean) => void }) {
    this.creds = creds;
    this.muted = opts?.muted ?? false;
    this.onSpeaking = opts?.onSpeaking;
  }

  /** Queue a line. prio 0 = highest (never evicted once queued). */
  say(prio: number, speaker: Speaker, text: string): void {
    if (this.disposed || this.muted) return;
    const t = (text || "").trim();
    if (!t) return;
    if (this.queue.some((q) => q.text === t)) return; // dedupe
    const line: VoiceLine = { prio: Math.max(0, Math.floor(prio)), speaker, text: t };
    if (this.queue.length >= QUEUE_CAP) {
      // Evict the lowest-priority queued line (largest prio number, newest among
      // ties), but never a prio-0 line. If the incoming line is worse than
      // everything queued, drop the incoming line instead.
      let idx = -1;
      let worst = 0;
      for (let i = 0; i < this.queue.length; i++) {
        const p = this.queue[i].prio;
        if (p > 0 && p >= worst) {
          worst = p;
          idx = i;
        }
      }
      if (idx === -1 || worst < line.prio) return;
      this.queue.splice(idx, 1);
    }
    this.queue.push(line);
    this.pump();
  }

  /** Pre-fetch stock lines into the cache — fire-and-forget, staggered. */
  warm(lines: { speaker: Speaker; text: string }[]): void {
    if (this.disposed) return;
    for (const l of lines) {
      const text = (l.text || "").trim();
      if (!text) continue;
      if (this.cache.has(l.speaker + "|" + text)) continue;
      if (this.warmQueue.some((w) => w.speaker === l.speaker && w.text === text)) continue;
      this.warmQueue.push({ speaker: l.speaker, text });
    }
    this.warmPump();
  }

  /** Mute stops the current line and clears the queue; unmute just re-arms. */
  setMuted(m: boolean): void {
    this.muted = m;
    if (m) {
      this.queue = [];
      this.stopCurrent();
    } else {
      this.pump();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
    this.warmQueue = [];
    if (this.pumpTimer) {
      clearTimeout(this.pumpTimer);
      this.pumpTimer = null;
    }
    if (this.warmTimer) {
      clearTimeout(this.warmTimer);
      this.warmTimer = null;
    }
    this.stopCurrent();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  /* ── Queue pump ────────────────────────────────────────────────────────── */

  private pump(): void {
    if (this.disposed || this.muted || this.busy || this.queue.length === 0) return;
    const now = Date.now();
    if (now < this.nextAllowedAt) {
      this.schedulePump(this.nextAllowedAt - now);
      return;
    }
    // Highest priority first; FIFO among equals.
    let best = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].prio < this.queue[best].prio) best = i;
    }
    const line = this.queue[best];
    const key = line.speaker + "|" + line.text;
    const cached = this.cacheGet(key);
    if (!cached) {
      if (!this.hourlyOk()) {
        this.queue.splice(best, 1); // cap exhausted — drop silently
        this.schedulePump(0);
        return;
      }
      const wait = this.lastLiveSynthAt + LIVE_SYNTH_GAP_MS - now;
      if (wait > 0) {
        if (line.prio === 0) {
          this.schedulePump(wait); // prio 0 waits out the live-synth window
          return;
        }
        this.queue.splice(best, 1); // anything else is dropped
        this.schedulePump(0);
        return;
      }
    }
    this.queue.splice(best, 1);
    this.busy = true;
    void this.speak(line, key, cached);
  }

  private schedulePump(delayMs: number): void {
    if (this.disposed) return;
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this.pump();
    }, Math.max(0, delayMs));
  }

  private async speak(line: VoiceLine, key: string, cached: ArrayBuffer | null): Promise<void> {
    try {
      let buf = cached;
      if (!buf) {
        this.lastLiveSynthAt = Date.now();
        this.synthLog.push(this.lastLiveSynthAt);
        buf = await this.fetchLine(line.speaker, line.text);
        if (buf) this.cachePut(key, buf);
      }
      if (buf && !this.muted && !this.disposed) await this.play(buf);
    } catch {
      /* the show never blocks on voice */
    } finally {
      this.busy = false;
      this.nextAllowedAt = Date.now() + MIN_GAP_MS;
      this.schedulePump(MIN_GAP_MS);
    }
  }

  /* ── Playback ──────────────────────────────────────────────────────────── */

  private audioCtx(): AudioContext | null {
    if (this.disposed || typeof window === "undefined") return null;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private play(buf: ArrayBuffer): Promise<void> {
    return new Promise((resolve) => {
      const ctx = this.audioCtx();
      if (!ctx) {
        resolve();
        return;
      }
      // decodeAudioData detaches its input — always decode a copy so the cache
      // entry stays reusable.
      ctx
        .decodeAudioData(buf.slice(0))
        .then((audio) => {
          if (this.muted || this.disposed) {
            resolve();
            return;
          }
          const src = ctx.createBufferSource();
          const gain = ctx.createGain();
          gain.gain.value = PLAYBACK_GAIN;
          src.buffer = audio;
          src.connect(gain);
          gain.connect(ctx.destination);
          this.current = { src, gain };
          this.setSpeaking(true);
          src.onended = () => {
            if (this.current?.src === src) this.current = null;
            this.setSpeaking(false);
            resolve();
          };
          try {
            src.start();
          } catch {
            this.current = null;
            this.setSpeaking(false);
            resolve();
          }
        })
        .catch(() => resolve());
    });
  }

  private stopCurrent(): void {
    const cur = this.current;
    this.current = null;
    if (cur) {
      try {
        cur.src.onended = null;
        cur.src.stop();
      } catch {
        /* already stopped */
      }
      try {
        cur.src.disconnect();
        cur.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.setSpeaking(false);
  }

  private setSpeaking(on: boolean): void {
    if (this.speaking === on) return;
    this.speaking = on;
    try {
      this.onSpeaking?.(on);
    } catch {
      /* callback errors never break playback */
    }
  }

  /* ── Synthesis + cache ─────────────────────────────────────────────────── */

  private hourlyOk(): boolean {
    const cutoff = Date.now() - HOUR_MS;
    while (this.synthLog.length > 0 && this.synthLog[0] < cutoff) this.synthLog.shift();
    return this.synthLog.length < HOURLY_SYNTH_CAP;
  }

  private async fetchLine(speaker: Speaker, text: string): Promise<ArrayBuffer | null> {
    try {
      const body: Record<string, unknown> = { text, speaker };
      if (this.creds) {
        body.k = this.creds.k;
        body.s = this.creds.s;
      }
      const res = await fetch("/api/showtime/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null; // 501 unconfigured / 429 / anything — silent
      const d = (await res.json()) as { audio?: string };
      if (!d.audio) return null;
      return base64ToBuffer(d.audio);
    } catch {
      return null;
    }
  }

  private cacheGet(key: string): ArrayBuffer | null {
    const v = this.cache.get(key);
    if (v === undefined) return null;
    this.cache.delete(key); // LRU refresh
    this.cache.set(key, v);
    return v;
  }

  private cachePut(key: string, buf: ArrayBuffer): void {
    this.cache.delete(key);
    this.cache.set(key, buf);
    while (this.cache.size > CACHE_CAP) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /* ── Warm pre-fetch ────────────────────────────────────────────────────── */

  private warmPump(): void {
    if (this.disposed || this.warmTimer || this.warmQueue.length === 0) return;
    this.warmTimer = setTimeout(() => {
      this.warmTimer = null;
      const l = this.warmQueue.shift();
      if (l && !this.disposed) {
        const key = l.speaker + "|" + l.text;
        if (!this.cache.has(key) && this.hourlyOk()) {
          this.synthLog.push(Date.now());
          void this.fetchLine(l.speaker, l.text).then((buf) => {
            if (buf && !this.disposed) this.cachePut(key, buf);
          });
        }
      }
      this.warmPump();
    }, WARM_STAGGER_MS);
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function base64ToBuffer(b64: string): ArrayBuffer | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}
