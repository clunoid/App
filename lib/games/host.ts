"use client";

/**
 * Isaac's host voice for the game. PRIMARY: the real Isaac (ElevenLabs via
 * /api/tts), PREFETCHED so it's instant in the fast pace. FALLBACK: the browser's
 * built-in SpeechSynthesis, so Isaac is ALWAYS audible even with no TTS
 * key/credits. `say()` resolves when he FINISHES (or is cancelled), so the caller
 * can open the mic only after he's done talking — which kills self-echo.
 */

type TtsPayload = { audio: string } | null;

class Host {
  private muted = false;
  private elevenOk = true; // flips false after a miss → use synthesis
  private gen = 0; // bumps on cancel/mute → invalidates any in-flight say()
  private cache = new Map<string, Promise<TtsPayload>>();
  private current: HTMLAudioElement | null = null;
  private preferred: SpeechSynthesisVoice | null = null;
  private _speaking = false; // true WHILE Isaac is audibly talking
  private endResolve: (() => void) | null = null; // resolves the in-flight say()

  constructor() {
    this.warmVoices();
  }

  /** True while Isaac is actually talking — used to keep the mic from hearing him. */
  get speaking() {
    return this._speaking;
  }

  setMuted(v: boolean) {
    this.muted = v;
    if (v) this.cancel();
  }

  private warmVoices() {
    try {
      const s = window.speechSynthesis;
      if (!s) return;
      const pick = () => {
        const voices = s.getVoices();
        if (!voices.length) return false;
        this.preferred =
          voices.find((v) => /en[-_]?US/i.test(v.lang) && /male|google|natural|daniel|guy|aaron/i.test(v.name)) ||
          voices.find((v) => /en[-_]?US/i.test(v.lang)) ||
          voices.find((v) => /^en/i.test(v.lang)) ||
          null;
        return true;
      };
      if (!pick() && typeof s.addEventListener === "function") {
        s.addEventListener("voiceschanged", () => pick(), { once: true });
      }
    } catch {
      /* best effort */
    }
  }

  private fetchTts(text: string): Promise<TtsPayload> {
    return fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (r) => (!r.ok || r.status === 204 ? null : ((await r.json()) as TtsPayload)))
      .catch(() => null);
  }

  /** Warm a line ahead of time (e.g. the round's answer during the question). */
  prefetch(text: string) {
    const k = text.trim();
    if (this.muted || !k || !this.elevenOk || this.cache.has(k)) return;
    this.cache.set(k, this.fetchTts(k));
  }

  /** Speak a line; the returned promise resolves when it ENDS (or is cancelled). */
  async say(text: string): Promise<void> {
    if (this.muted) return;
    const k = text.trim();
    if (!k) return;
    this.cancel(); // stop current + invalidate any in-flight say()
    const myGen = this.gen;

    if (this.elevenOk) {
      let p = this.cache.get(k);
      if (!p) {
        p = this.fetchTts(k);
        this.cache.set(k, p);
      }
      let payload: TtsPayload = null;
      try {
        payload = await p;
      } catch {
        /* ignore */
      }
      this.cache.delete(k);
      if (myGen !== this.gen || this.muted) return; // cancelled / muted while fetching
      if (payload?.audio) {
        try {
          const url = URL.createObjectURL(b64ToBlob(payload.audio, "audio/mpeg"));
          const audio = new Audio(url);
          this.current = audio;
          this._speaking = true;
          await new Promise<void>((resolve) => {
            this.endResolve = resolve;
            const done = () => {
              URL.revokeObjectURL(url);
              if (this.current === audio) {
                this.current = null;
                this._speaking = false;
              }
              if (this.endResolve === resolve) this.endResolve = null;
              resolve();
            };
            audio.onended = done;
            audio.onerror = done;
            audio.play().catch(done);
          });
          return;
        } catch {
          this._speaking = false; // autoplay blocked / decode error → synthesis
        }
      } else {
        this.elevenOk = false; // no key/credits — stop trying
      }
    }
    if (myGen !== this.gen || this.muted) return;
    await this.synth(text);
  }

  private synth(text: string): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        const s = window.speechSynthesis;
        if (!s) return resolve();
        s.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        u.pitch = 1.02;
        u.volume = 1;
        if (this.preferred) u.voice = this.preferred;
        this._speaking = true;
        this.endResolve = resolve;
        const done = () => {
          this._speaking = false;
          if (this.endResolve === resolve) this.endResolve = null;
          resolve();
        };
        u.onend = done;
        u.onerror = done;
        s.speak(u);
      } catch {
        this._speaking = false;
        resolve();
      }
    });
  }

  cancel() {
    this.gen++; // invalidate any say() awaiting a fetch
    this._speaking = false;
    if (this.endResolve) {
      const r = this.endResolve;
      this.endResolve = null;
      r(); // unblock the awaiting say() so callers don't hang
    }
    if (this.current) {
      this.current.pause();
      this.current.onended = null;
      this.current.onerror = null;
      this.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

let instance: Host | null = null;
export function getHost(): Host {
  if (!instance) instance = new Host();
  return instance;
}
