"use client";

/**
 * Race-agnostic, RECORDING-FREE MP4 encoder (WebCodecs → H.264 + AAC via mp4-muxer).
 * Extracted verbatim from the stat-battle exporter (lib/stats/render.ts:renderRaceVideoWeb)
 * so any feature can encode a canvas faster-than-real-time and — crucially — NOT off
 * requestAnimationFrame/captureStream, so it keeps running when the tab is hidden (the
 * whole reason to prefer it over MediaRecorder). Only two things are generalized vs the
 * stat-battle version: the per-frame draw callback, and the audio source (a pre-mixed
 * planar buffer). Every encoder/muxer mechanic — flush cadence, integer VideoFrame
 * timestamps, f32-planar AudioData in 4096-sample chunks, checkAbort, cleanup — is kept
 * exactly as the proven original.
 */

type RenderResult = { blob: Blob; ext: string; mime: string; hadVoice: boolean };

type WC = typeof globalThis & {
  VideoEncoder?: typeof VideoEncoder;
  AudioEncoder?: typeof AudioEncoder;
  VideoFrame?: typeof VideoFrame;
  AudioData?: typeof AudioData;
};
export function hasWebCodecs(): boolean {
  if (typeof window === "undefined") return false;
  const g = globalThis as WC;
  return !!(g.VideoEncoder && g.AudioEncoder && g.VideoFrame && g.AudioData);
}
export async function pickAvcCodec(W: number, H: number): Promise<string | null> {
  // High → Main → Baseline, high level first (covers 1080×1920 / 1920×1080).
  for (const codec of ["avc1.640033", "avc1.640032", "avc1.64002A", "avc1.640028", "avc1.4D4028", "avc1.42E028", "avc1.42E01E"]) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 9_000_000, framerate: 30 });
      if (r.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}
export async function aacSupported(sampleRate: number, channels: number): Promise<boolean> {
  try {
    const r = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate: 128_000 });
    return !!r.supported;
  } catch {
    return false;
  }
}

/** A pre-mixed planar audio source. getPlanarChunk(off, n) returns a FRESH Float32Array
 *  of n*channels f32-planar samples laid out [ch0…][ch1…] (index data[c*n+i]), silent
 *  past the mixed length. Fresh each call — AudioData may take ownership. */
export type Mp4Audio = { channels: number; sampleRate: number; getPlanarChunk(offSamples: number, n: number): Float32Array<ArrayBuffer> };

export async function encodeCanvasToMp4Web(opts: {
  W: number;
  H: number;
  fps: number;
  durationSec: number;
  drawFrame: (ctx: CanvasRenderingContext2D, t: number) => void;
  audio?: Mp4Audio | null;
  host?: HTMLElement | null;
  onProgress?: (p: number, l: string) => void;
  signal?: AbortSignal;
}): Promise<RenderResult> {
  const { W, H, fps, durationSec, drawFrame, audio } = opts;

  const avc = await pickAvcCodec(W, H);
  if (!avc) throw new Error("no H.264 config");

  opts.onProgress?.(4, "Loading media…");

  const wantAudio = !!audio && (await aacSupported(audio.sampleRate, audio.channels));
  const channels = audio?.channels ?? 1;
  const sampleRate = audio?.sampleRate ?? 48000;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = "display:block;max-width:100%;max-height:100%;margin:0 auto;border-radius:14px";
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D not supported");
  if (opts.host) {
    opts.host.innerHTML = "";
    opts.host.appendChild(canvas);
  }

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    video: { codec: "avc", width: W, height: H, frameRate: fps },
    ...(wantAudio ? { audio: { codec: "aac" as const, numberOfChannels: channels, sampleRate } } : {}),
  });

  let encErr: unknown = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encErr = e;
    },
  });
  venc.configure({ codec: avc, width: W, height: H, bitrate: 9_000_000, framerate: fps, latencyMode: "quality" });

  let aenc: AudioEncoder | null = null;
  if (wantAudio) {
    aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encErr = e;
      },
    });
    aenc.configure({ codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate: 128_000 });
  }

  const total = durationSec;
  const totalFrames = Math.ceil(total * fps);
  const usPerFrame = 1e6 / fps;

  const cleanup = () => {
    try {
      venc.close();
    } catch {
      /* ignore */
    }
    try {
      aenc?.close();
    } catch {
      /* ignore */
    }
  };
  const checkAbort = () => {
    if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (encErr) throw encErr instanceof Error ? encErr : new Error("encode error");
  };

  try {
    // ── VIDEO — deterministic, faster-than-real-time. flush() every ~2s bounds
    //    memory AND drains the queue without rAF/timers (so a hidden tab can't stall). ──
    opts.onProgress?.(6, "Encoding in the background…");
    for (let f = 0; f < totalFrames; f++) {
      checkAbort();
      drawFrame(ctx, f / fps);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(f * usPerFrame), duration: Math.round(usPerFrame) });
      venc.encode(frame);
      frame.close();
      if ((f + 1) % (fps * 2) === 0) {
        await venc.flush();
        opts.onProgress?.(Math.min(wantAudio ? 86 : 96, 6 + Math.round((f / totalFrames) * (wantAudio ? 80 : 90))), "Encoding in the background…");
      }
    }
    await venc.flush();
    checkAbort();

    // ── AUDIO — the pre-mixed track, as f32-planar AudioData chunks, AAC-encoded. ──
    if (aenc && audio) {
      opts.onProgress?.(90, "Encoding in the background…");
      const totalSamples = Math.ceil(total * sampleRate);
      const CHUNK = 4096;
      for (let off = 0; off < totalSamples; off += CHUNK) {
        checkAbort();
        const n = Math.min(CHUNK, totalSamples - off);
        const data = audio.getPlanarChunk(off, n); // n*channels f32-planar, fresh each call
        const adata = new AudioData({ format: "f32-planar", sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((off / sampleRate) * 1e6), data });
        aenc.encode(adata);
        adata.close();
        if ((off / CHUNK) % 16 === 15) await aenc.flush();
      }
      await aenc.flush();
      checkAbort();
    }

    muxer.finalize();
    cleanup();
    const blob = new Blob([target.buffer], { type: "video/mp4" });
    if (!blob.size) throw new Error("empty output");
    opts.onProgress?.(100, "Done");
    return { blob, ext: "mp4", mime: "video/mp4", hadVoice: !!audio };
  } catch (e) {
    cleanup();
    throw e;
  }
}
