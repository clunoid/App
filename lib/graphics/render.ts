"use client";

/**
 * MOTION GRAPHICS exporter — assembles assets (fonts, images, narration, captions,
 * music), then encodes deterministically with WebCodecs (background-safe, faster than
 * real time; same engine as Stat Battle / Video Direct), falling back to a MediaRecorder
 * capture on browsers without WebCodecs. Returns the standard RenderResult that
 * ShareModal already consumes.
 */
import { aspectSize, type ReelAspect } from "@/lib/share/reel";
import { createCanvasRecorder } from "@/lib/share/record";
import { encodeCanvasToMp4Web, hasWebCodecs } from "@/lib/share/webcodecs-mp4";
import type { MotionSpec } from "./spec";
import { computeMotionTiming, drawMotionFrame, makePalette, resolveMotionFont, type MotionAssets } from "./engine";
import { fetchNarrations, mixMotionAudio, toMp4Audio } from "./audio";

export type MotionRenderOpts = {
  host?: HTMLElement | null;
  onProgress?: (pct: number, label: string) => void;
  signal?: AbortSignal;
  branded?: boolean;
  voiceName?: string;
};
type RenderResult = { blob: Blob; ext: string; mime: string; hadVoice: boolean };

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
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
  for (const s of spec.scenes) for (const el of s.elements || []) if (el.imageUrl) urls.add(el.imageUrl);
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...urls].map(async (u) => {
      const img = await loadImage(u);
      if (img) images.set(u, img);
    })
  );
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
  const assets: MotionAssets = { images, captionWords: narrs.map((n) => n.words) };

  prog(18, "Mixing audio…");
  const mixed = await mixMotionAudio(spec, timing, narrs);
  abort();

  const { w: W, h: H } = aspectSize(aspect);
  const draw = (ctx: CanvasRenderingContext2D, t: number) => drawMotionFrame(ctx, W, H, spec, timing, assets, pal, t, branded);

  if (hasWebCodecs()) {
    try {
      // Map the encoder's 0–100 onto our remaining 20–100 band so the bar never
      // jumps backwards at the handoff (we already reported up to 18%).
      const encProgress = onProgress ? (p: number, l: string) => onProgress(Math.round(20 + p * 0.8), l) : undefined;
      const res = await encodeCanvasToMp4Web({ W, H, fps: 30, durationSec: timing.total, drawFrame: draw, audio: toMp4Audio(mixed), host, onProgress: encProgress, signal });
      return { ...res, hadVoice };
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      console.warn("[graphics] WebCodecs export unavailable, falling back to recording:", e);
    }
  }

  // ── MediaRecorder fallback (real-time; needs the tab visible) ──
  const rec = createCanvasRecorder(W, H, 30, host ?? null);
  try {
    draw(rec.ctx, 0); // first frame so the preview isn't blank
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
          draw(rec.ctx, Math.min(el, timing.total - 0.001));
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
  }
}
