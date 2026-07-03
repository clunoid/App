"use client";

/**
 * MOTION GRAPHICS exporter — assembles assets (fonts, images, FOOTAGE clips,
 * narration, captions, music), then encodes deterministically with WebCodecs
 * (background-safe, faster than real time; same engine as Stat Battle / Video
 * Direct), falling back to a MediaRecorder capture on browsers without WebCodecs.
 * Returns the standard RenderResult that ShareModal already consumes.
 *
 * Footage: stock clips draw straight onto the export canvas. In the WebCodecs
 * path the active clip is SEEKED to the exact scene-local time before every
 * frame (deterministic, works faster than real time); in the realtime fallback
 * the clips simply play() in sync with the wall clock.
 */
import { aspectSize, type ReelAspect } from "@/lib/share/reel";
import { createCanvasRecorder } from "@/lib/share/record";
import { encodeCanvasToMp4Web, hasWebCodecs } from "@/lib/share/webcodecs-mp4";
import type { MotionSpec } from "./spec";
import { computeMotionTiming, drawMotionFrame, makePalette, resolveMotionFont, type MotionAssets, type MotionTiming } from "./engine";
import { fetchNarrations, mixMotionAudio, toMp4Audio } from "./audio";

export type MotionRenderOpts = {
  host?: HTMLElement | null;
  onProgress?: (pct: number, label: string) => void;
  signal?: AbortSignal;
  branded?: boolean;
  voiceName?: string;
};
type RenderResult = { blob: Blob; ext: string; mime: string; hadVoice: boolean };

const MAX_CLIPS = 12; // bound network + decoder memory on footage-heavy specs

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function loadClip(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const timer = setTimeout(() => resolve(null), 9000); // slow clip → poster fallback
    v.onloadeddata = () => {
      clearTimeout(timer);
      resolve(v);
    };
    v.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    v.src = url;
  });
}

/** A clip must never taint the export canvas — prove it on a probe canvas FIRST
 *  (tainting is irreversible on the canvas it touches). */
function clipIsCanvasSafe(v: HTMLVideoElement): boolean {
  try {
    const probe = document.createElement("canvas");
    probe.width = 8;
    probe.height = 8;
    const pctx = probe.getContext("2d");
    if (!pctx) return false;
    pctx.drawImage(v, 0, 0, 8, 8);
    pctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

/** Seek a clip and wait for the frame (bounded — a stuck seek must not stall the encode). */
function seekClip(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 350);
    function done() {
      clearTimeout(timer);
      v.removeEventListener("seeked", done);
      resolve();
    }
    v.addEventListener("seeked", done);
    try {
      v.currentTime = t;
    } catch {
      done();
    }
  });
}

/** Which scene indices are visible at time t (two during a transition straddle). */
function visibleScenes(timing: MotionTiming, n: number, t: number): number[] {
  let idx = 0;
  for (let i = 0; i < n; i++) if (t >= timing.sceneStarts[i] - 1e-9) idx = i;
  const out = [idx];
  const TRANS = 0.7;
  if (idx < n - 1 && t > timing.sceneStarts[idx] + timing.sceneDurs[idx] - TRANS / 2) out.push(idx + 1);
  if (idx > 0 && t - timing.sceneStarts[idx] < TRANS / 2) out.push(idx - 1);
  return out;
}

export async function renderMotionVideo(spec: MotionSpec, aspect: ReelAspect, opts: MotionRenderOpts = {}): Promise<RenderResult> {
  const { host, onProgress, signal } = opts;
  const prog = (p: number, l: string) => onProgress?.(p, l);
  const branded = opts.branded !== false;
  const abort = () => {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  };

  prog(2, "Preparing…");
  resolveMotionFont();
  try {
    await document.fonts.ready;
  } catch {
    /* fonts optional */
  }

  // images (Pexels URLs resolved by the planner) — CORS-safe, optional
  const urls = new Set<string>();
  const clipUrls: string[] = [];
  for (const s of spec.scenes)
    for (const el of s.elements || []) {
      if (el.imageUrl) urls.add(el.imageUrl);
      if (el.type === "video" && el.videoUrl && !clipUrls.includes(el.videoUrl) && clipUrls.length < MAX_CLIPS) clipUrls.push(el.videoUrl);
    }
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  await Promise.all([
    ...[...urls].map(async (u) => {
      const img = await loadImage(u);
      if (img) images.set(u, img);
    }),
    ...clipUrls.map(async (u) => {
      const v = await loadClip(u);
      if (v) videos.set(u, v);
    }),
  ]);
  // one bad apple taints the whole canvas — verify every clip on a probe first
  for (const [u, v] of [...videos]) if (!clipIsCanvasSafe(v)) videos.delete(u);
  abort();

  // narration (kept per scene, with word timestamps for captions)
  const voiceLine = opts.voiceName ? `Loading ${opts.voiceName}’s voice…` : "Loading the voice…";
  prog(6, voiceLine);
  const ACtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new ACtor();
  let narrs;
  try {
    narrs = await fetchNarrations(ac, spec, (d, t) => prog(Math.min(16, 6 + Math.round((d / t) * 10)), voiceLine), signal);
  } finally {
    try {
      await ac.close();
    } catch {
      /* ignore */
    }
  }
  abort();
  const hadVoice = narrs.some((n) => n.buf);

  const timing = computeMotionTiming(spec, narrs.map((n) => n.buf), branded);
  const pal = makePalette(spec);
  const assets: MotionAssets = { images, videos, captionWords: narrs.map((n) => n.words) };

  prog(18, "Mixing audio…");
  const mixed = await mixMotionAudio(spec, timing, narrs);
  abort();

  const { w: W, h: H } = aspectSize(aspect);
  const n = spec.scenes.length;

  // scene → its footage clips (for the per-frame sync)
  const sceneClips: { el: HTMLVideoElement; url: string }[][] = spec.scenes.map((s) => {
    const list: { el: HTMLVideoElement; url: string }[] = [];
    for (const el of s.elements || []) {
      if (el.type === "video" && el.videoUrl) {
        const v = videos.get(el.videoUrl);
        if (v) list.push({ el: v, url: el.videoUrl });
      }
    }
    return list;
  });
  const anyClips = sceneClips.some((l) => l.length);

  /** Deterministic footage sync: seek every visible clip to its scene-local time. */
  const syncClips = async (t: number) => {
    if (!anyClips) return;
    for (const i of visibleScenes(timing, n, t)) {
      const local = Math.max(0, t - timing.sceneStarts[i]);
      for (const { el } of sceneClips[i]) {
        const dur = el.duration && isFinite(el.duration) ? Math.max(0.5, el.duration - 0.15) : 0;
        const target = dur ? local % dur : 0;
        if (Math.abs(el.currentTime - target) > 0.07) await seekClip(el, target);
      }
    }
  };

  const drawSync = (ctx: CanvasRenderingContext2D, t: number) => drawMotionFrame(ctx, W, H, spec, timing, assets, pal, t, branded);

  if (hasWebCodecs()) {
    try {
      // Long renders drop the bitrate (motion-graphics gradients compress beautifully)
      // and stream the muxer output in parts, so a 15-minute 1080p file never needs
      // one contiguous ~1 GB allocation.
      const long = timing.total > 240;
      const bitrate = timing.total > 480 ? 5_500_000 : long ? 7_000_000 : 9_000_000;
      // Map the encoder's 0–100 onto our remaining 20–100 band so the bar never
      // jumps backwards at the handoff (we already reported up to 18%).
      const encProgress = onProgress ? (p: number, l: string) => onProgress(Math.round(20 + p * 0.8), l) : undefined;
      const res = await encodeCanvasToMp4Web({
        W,
        H,
        fps: 30,
        durationSec: timing.total,
        drawFrame: async (ctx, t) => {
          await syncClips(t);
          drawSync(ctx, t);
        },
        audio: toMp4Audio(mixed),
        host,
        onProgress: encProgress,
        signal,
        bitrate,
        stream: timing.total > 360,
      });
      return { ...res, hadVoice };
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      console.warn("[graphics] WebCodecs export unavailable, falling back to recording:", e);
    }
  }

  // ── MediaRecorder fallback (real-time; needs the tab visible) ──
  // A real-time capture of a very long video is impractical (any tab switch or
  // screen sleep kills it) — require WebCodecs beyond 8 minutes.
  if (timing.total > 480) {
    const err = new Error("Videos this long need Chrome or Edge on a computer to create. Your video design is saved in History — open it there, or pick a shorter length here.");
    err.name = "FriendlyError"; // ShareModal shows this message verbatim
    throw err;
  }
  const rec = createCanvasRecorder(W, H, 30, host ?? null);
  try {
    // footage plays in real time in this path — start every clip muted and looping
    for (const l of sceneClips) for (const { el } of l) {
      el.loop = true;
      void el.play().catch(() => {});
    }
    drawSync(rec.ctx, 0); // first frame so the preview isn't blank
    try {
      await rec.ac.resume();
    } catch {
      /* ignore */
    }
    const t0 = rec.ac.currentTime + 0.15;
    if (mixed) {
      const src = rec.ac.createBufferSource();
      src.buffer = mixed;
      src.connect(rec.dest);
      src.start(t0);
    }
    rec.start();
    prog(20, "Recording…");
    await new Promise<void>((resolve, reject) => {
      const frame = () => {
        if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
        const el = Math.max(0, rec.ac.currentTime - t0);
        try {
          drawSync(rec.ctx, Math.min(el, timing.total - 0.001));
        } catch (e) {
          return reject(e as Error);
        }
        prog(Math.min(99, 20 + Math.round((el / timing.total) * 79)), "Recording…");
        if (el >= timing.total) return resolve();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const out = await rec.stop();
    prog(100, "Done");
    return { blob: out.blob, ext: out.ext, mime: out.mime || "video/webm", hadVoice };
  } catch (e) {
    try {
      await rec.stop();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    for (const l of sceneClips) for (const { el } of l) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
  }
}
