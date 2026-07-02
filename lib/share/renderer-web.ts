"use client";

/**
 * WebCodecs recap renderer for the reel — the "no recording" path the stat battle
 * uses, now with the chosen NARRATION voice. It renders the SAME visuals + timing as
 * renderReel (reusing its drawFrame/computeReelTiming), but:
 *   • encodes with WebCodecs (background-safe, faster-than-real-time) via encodeCanvasToMp4Web, and
 *   • bakes the whole audio mix (intro + per-flag question/answer + SFX + outro) into ONE
 *     buffer with an OfflineAudioContext — overlap-correct and perfectly synced, no real-time playback.
 * Public entry renderFlagReelVideo() is WebCodecs-first with a renderReel (MediaRecorder)
 * fallback for browsers lacking WebCodecs/H.264/AAC.
 */
import { aspectSize, type ReelSpec } from "./reel";
import { renderReel, drawFrame, loadImage, mapLimit, fetchDecodeLine, computeReelTiming, type RenderResult, type RenderOpts } from "./renderer";
import { sfxComplete, sfxCorrect, sfxPop, sfxTick, sfxWrong } from "./sfx";
import { encodeCanvasToMp4Web, hasWebCodecs, type Mp4Audio } from "./webcodecs-mp4";

async function renderReelWeb(spec: ReelSpec, opts: RenderOpts = {}): Promise<RenderResult> {
  if (!hasWebCodecs()) throw new Error("no WebCodecs");
  const { host, onProgress, signal, voiceName } = opts;
  const prog = (p: number, l: string) => onProgress?.(p, l);
  const voiceLine = voiceName ? `Loading ${voiceName}’s voice…` : "Loading the voice…";
  const { w: W, h: H } = aspectSize(spec.aspect);
  const fps = 30;

  prog(3, "Preparing…");
  try {
    await Promise.all([document.fonts.load('800 120px "Baloo 2"'), document.fonts.load('700 120px "Baloo 2"')]);
  } catch {
    /* fonts optional */
  }

  // A throwaway real-time context ONLY for decodeAudioData (offline can decode too, but
  // this keeps the decode path identical to renderReel). Closed before encoding.
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();

  prog(8, voiceLine);
  let buffers: (AudioBuffer | null)[] = [];
  let images: (HTMLImageElement | null)[] = spec.scenes.map(() => null);
  try {
    const lineTexts: string[] = [spec.intro.narration];
    spec.scenes.forEach((s) => {
      lineTexts.push(s.questionNarration || "");
      lineTexts.push(s.narration);
    });
    lineTexts.push(spec.outro.narration);

    const imagesP = Promise.all(spec.scenes.map((s) => loadImage(s.imageUrl)));
    const norm = (t: string) => (t || "").trim();
    const uniqueTexts = [...new Set(lineTexts.map(norm).filter(Boolean))]; // dedupe repeated questions → 1 TTS each
    const decoded = new Map<string, AudioBuffer | null>();
    let fetched = 0;
    await mapLimit(uniqueTexts, 2, async (t) => {
      decoded.set(t, await fetchDecodeLine(ac, t));
      fetched++;
      prog(Math.min(14, 8 + Math.round((fetched / uniqueTexts.length) * 6)), voiceLine);
    });
    buffers = lineTexts.map((t) => {
      const n = norm(t);
      return n ? decoded.get(n) ?? null : null;
    });
    images = await imagesP;
  } catch {
    /* narration/images failed wholesale → silent, image-less clip (never a crash) */
  }
  if (signal?.aborted) {
    try { await ac.close(); } catch {}
    throw new DOMException("aborted", "AbortError");
  }

  const { durs, total, introBuf, questionBufs, answerBufs, outroBuf, hadVoice } = computeReelTiming(spec, buffers);
  const { introDur, sceneDurs, qDurs } = durs;

  // ── BAKE the full mix OFFLINE. Same schedule as renderReel's recordAt, but with plain
  //    `at` offsets (no real-time t0 latency compensation) — the result is one AudioBuffer. ──
  prog(15, "Mixing audio…");
  let mixed: AudioBuffer | null = null;
  try {
    const OfflineCtor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const SR = 48000;
    const CH = 2;
    const off = new OfflineCtor(CH, Math.max(1, Math.ceil(total * SR)), SR);
    const play = (buf: AudioBuffer | null, at: number) => {
      if (!buf) return;
      const src = off.createBufferSource();
      src.buffer = buf;
      src.connect(off.destination);
      src.start(Math.max(0, at));
    };
    let at = 0;
    play(introBuf, at + 0.15);
    at += introDur;
    spec.scenes.forEach((s, i) => {
      const qd = qDurs[i];
      sfxPop(off, off.destination, at + 0.02);
      play(questionBufs[i], at + 0.2);
      sfxTick(off, off.destination, at + qd - 0.5);
      sfxTick(off, off.destination, at + qd - 0.18, true);
      (s.correct ? sfxCorrect : sfxWrong)(off, off.destination, at + qd + 0.03);
      play(answerBufs[i], at + qd + 0.12);
      at += sceneDurs[i];
    });
    sfxComplete(off, off.destination, at + 0.1);
    play(outroBuf, at + 0.3);
    mixed = await off.startRendering();
  } catch {
    mixed = null; // no audio → a silent video (still valid)
  }
  try { await ac.close(); } catch {}
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  // Expose the mix as an f32-planar source for the encoder (fresh array each chunk).
  const SR = mixed?.sampleRate ?? 48000;
  const CH = mixed ? Math.min(2, Math.max(1, mixed.numberOfChannels)) : 2;
  const audio: Mp4Audio | null = mixed
    ? {
        channels: CH,
        sampleRate: SR,
        getPlanarChunk(offSamples: number, n: number): Float32Array<ArrayBuffer> {
          const data = new Float32Array(n * CH);
          const len = mixed!.length;
          for (let c = 0; c < CH; c++) {
            const ch = mixed!.getChannelData(Math.min(c, mixed!.numberOfChannels - 1));
            for (let i = 0; i < n; i++) {
              const si = offSamples + i;
              if (si < len) data[c * n + i] = ch[si];
            }
          }
          return data;
        },
      }
    : null;

  const draw = (ctx: CanvasRenderingContext2D, t: number) => drawFrame(ctx, W, H, spec, images, durs, t);
  const result = await encodeCanvasToMp4Web({ W, H, fps, durationSec: total, drawFrame: draw, audio, host, onProgress, signal });
  return { ...result, hadVoice };
}

/**
 * Public flag-reel exporter: WebCodecs-first (background-safe, the "no recording" path),
 * with a MediaRecorder (renderReel) fallback for browsers without WebCodecs/H.264/AAC.
 * The spec already carries the aspect + brand (watermark), so opts only needs
 * host/onProgress/signal/voiceName.
 */
export async function renderFlagReelVideo(spec: ReelSpec, opts: RenderOpts = {}): Promise<RenderResult> {
  if (hasWebCodecs()) {
    try {
      return await renderReelWeb(spec, opts);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e; // user cancelled — don't restart
      console.warn("[video] WebCodecs export unavailable, falling back to recording:", e);
    }
  }
  return renderReel(spec, opts);
}
