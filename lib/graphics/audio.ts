"use client";

/**
 * Motion-graphics AUDIO: per-scene narration (fetched from /api/tts directly so we keep
 * ElevenLabs' character timestamps → word-synced captions), a subtle PROCEDURAL music
 * bed (no licensing), and one OfflineAudioContext master mix the encoder consumes.
 */
import type { MotionSpec, CaptionWord } from "./spec";
import type { MotionTiming } from "./engine";
import type { Mp4Audio } from "@/lib/share/webcodecs-mp4";
import { getVideoVoicePref } from "@/lib/voice/preference";

export type SceneNarration = { buf: AudioBuffer | null; words: CaptionWord[] };

/** How far into a scene the narration starts (settle room after the transition-in).
 *  ONE constant shared by the mix (audio placement) and the caption word times, so
 *  the karaoke highlight can never drift from the voice. */
export const NARRATION_LEAD = 0.35;

/** Fetch one narration line, keeping char timestamps when the voice provides them. */
async function ttsLine(ac: AudioContext, text: string, signal?: AbortSignal): Promise<{ buf: AudioBuffer | null; chars?: string[]; times?: number[] }> {
  if (!text.trim()) return { buf: null };
  const voice = getVideoVoicePref();
  if (voice === "silent") return { buf: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, feature: "video", voice }),
        signal,
      });
      if (res.status === 204) return { buf: null };
      if (res.ok) {
        const d = (await res.json()) as { audio?: string; chars?: string[]; times?: number[] };
        if (!d.audio) return { buf: null };
        const bin = atob(d.audio);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        try {
          const buf = await ac.decodeAudioData(bytes.buffer);
          return { buf, chars: d.chars, times: d.times };
        } catch {
          return { buf: null }; // a decode error won't fix on retry — and the line was already charged
        }
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e; // user cancelled — stop billing lines immediately
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 450 + attempt * 500));
  }
  return { buf: null };
}

/** Char timestamps → word windows, shifted by NARRATION_LEAD so caption times live on
 *  the SCENE clock (where the engine evaluates them), not the raw audio-file clock.
 *  Fallback: spread words evenly across the audio when a voice has no timestamps. */
function wordsFrom(text: string, buf: AudioBuffer | null, chars?: string[], times?: number[]): CaptionWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const L = NARRATION_LEAD;
  if (chars && times && chars.length === times.length && chars.length > 3) {
    const out: CaptionWord[] = [];
    let w = "";
    let start = 0;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (/\s/.test(c)) {
        if (w) out.push({ text: w, start: L + start, end: L + (times[i] ?? start + 0.3) });
        w = "";
      } else {
        if (!w) start = times[i] ?? 0;
        w += c;
      }
    }
    if (w) out.push({ text: w, start: L + start, end: L + (times[times.length - 1] ?? start) + 0.25 });
    if (out.length) return out;
  }
  if (!buf) return [];
  // even spread weighted by word length (studio voices carry no timestamps)
  const totalChars = words.reduce((a, b) => a + b.length + 1, 0);
  const dur = Math.max(0.5, buf.duration - 0.15);
  let t = L + 0.05;
  return words.map((w) => {
    const span = ((w.length + 1) / totalChars) * dur;
    const cw = { text: w, start: t, end: t + span };
    t += span;
    return cw;
  });
}

/** Fetch every scene's narration (concurrency 2 — gentle on rate-limited voices).
 *  Honors `signal`: an abort stops the queue immediately (no more billed TTS lines). */
export async function fetchNarrations(ac: AudioContext, spec: MotionSpec, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<SceneNarration[]> {
  const out: SceneNarration[] = spec.scenes.map(() => ({ buf: null, words: [] }));
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < spec.scenes.length) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const i = next++;
      const text = spec.scenes[i].narration;
      const r = await ttsLine(ac, text, signal);
      out[i] = { buf: r.buf, words: wordsFrom(text, r.buf, r.chars, r.times) };
      done++;
      onProgress?.(done, spec.scenes.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return out;
}

/* ── procedural music bed (deterministic, license-free) ───────────────────── */
const NOTE = (semisFromA3: number) => 220 * Math.pow(2, semisFromA3 / 12);
// warm pop progressions (semitones from A): vi–IV–I–V feel
const PROG: number[][] = [
  [0, 3, 7], // Am
  [-4, 0, 5], // F
  [3, 7, 12], // C
  [-2, 2, 7], // G
];

function scheduleMusic(off: OfflineAudioContext, total: number, style: "ambient" | "upbeat", master: GainNode) {
  const bus = off.createGain();
  bus.gain.value = style === "upbeat" ? 0.055 : 0.045;
  // gentle fade in/out
  bus.gain.setValueAtTime(0, 0);
  bus.gain.linearRampToValueAtTime(style === "upbeat" ? 0.055 : 0.045, 1.2);
  bus.gain.setValueAtTime(style === "upbeat" ? 0.055 : 0.045, Math.max(1.3, total - 1.6));
  bus.gain.linearRampToValueAtTime(0.0001, Math.max(1.4, total - 0.1));
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = style === "upbeat" ? 2400 : 1500;
  bus.connect(lp).connect(master);

  const BAR = style === "upbeat" ? 2.0 : 3.2; // seconds per chord
  for (let t = 0, bar = 0; t < total; t += BAR, bar++) {
    const chord = PROG[bar % PROG.length];
    // pad: detuned triangle pair per chord tone
    for (const semi of chord) {
      for (const det of [-4, 4]) {
        const o = off.createOscillator();
        o.type = "triangle";
        o.frequency.value = NOTE(semi - 12);
        o.detune.value = det;
        const g = off.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.12, t + BAR * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t + BAR * 1.04);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(Math.min(total, t + BAR * 1.06));
      }
    }
    if (style === "upbeat") {
      // soft plucks on the beat
      for (let b = 0; b < 4; b++) {
        const bt = t + (b * BAR) / 4;
        if (bt >= total) break;
        const o = off.createOscillator();
        o.type = "sine";
        o.frequency.value = NOTE(chord[b % chord.length]);
        const g = off.createGain();
        g.gain.setValueAtTime(0.0001, bt);
        g.gain.exponentialRampToValueAtTime(0.09, bt + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, bt + 0.28);
        o.connect(g).connect(bus);
        o.start(bt);
        o.stop(Math.min(total, bt + 0.3));
      }
    }
  }
}

/** Bake narration + music into ONE stereo 48k buffer aligned to the timeline. */
export async function mixMotionAudio(spec: MotionSpec, timing: MotionTiming, narrs: SceneNarration[]): Promise<AudioBuffer | null> {
  try {
    const SR = 48000;
    const CH = 2;
    const OfflineCtor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const off = new OfflineCtor(CH, Math.max(1, Math.ceil(timing.total * SR)), SR);
    const master = off.createGain();
    master.gain.value = 1;
    master.connect(off.destination);
    for (let i = 0; i < narrs.length; i++) {
      const buf = narrs[i].buf;
      if (!buf) continue;
      const src = off.createBufferSource();
      src.buffer = buf;
      const g = off.createGain();
      g.gain.value = 1;
      src.connect(g).connect(master);
      src.start(Math.max(0, timing.sceneStarts[i] + NARRATION_LEAD));
    }
    const music = spec.style.music || "ambient";
    if (music !== "none") scheduleMusic(off, timing.total, music, master);
    return await off.startRendering();
  } catch {
    return null;
  }
}

/** Expose a mixed buffer as the encoder's planar audio source. */
export function toMp4Audio(mixed: AudioBuffer | null): Mp4Audio | null {
  if (!mixed) return null;
  const CH = Math.min(2, Math.max(1, mixed.numberOfChannels));
  return {
    channels: CH,
    sampleRate: mixed.sampleRate,
    getPlanarChunk(offSamples: number, n: number): Float32Array<ArrayBuffer> {
      const data = new Float32Array(n * CH);
      const len = mixed.length;
      for (let c = 0; c < CH; c++) {
        const ch = mixed.getChannelData(Math.min(c, mixed.numberOfChannels - 1));
        for (let i = 0; i < n; i++) {
          const si = offSamples + i;
          if (si < len) data[c * n + i] = ch[si];
        }
      }
      return data;
    },
  };
}
