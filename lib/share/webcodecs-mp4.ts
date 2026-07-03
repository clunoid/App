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
  /** May return a promise (e.g. to seek a footage clip) — the loop awaits it. */
  drawFrame: (ctx: CanvasRenderingContext2D, t: number) => void | Promise<void>;
  audio?: Mp4Audio | null;
  host?: HTMLElement | null;
  onProgress?: (p: number, l: string) => void;
  signal?: AbortSignal;
  /** Video bitrate in bps. Default 9 Mbps (the proven stat-battle setting). */
  bitrate?: number;
  /** Stream muxer output into chunked parts instead of ONE contiguous ArrayBuffer —
   *  for long renders (a 15-min 1080p file is ~0.5-1 GB; one contiguous allocation
   *  of that size can OOM a tab where fragmented parts survive fine). */
  stream?: boolean;
}): Promise<RenderResult> {
  const { W, H, fps, durationSec, drawFrame, audio } = opts;
  const bitrate = opts.bitrate ?? 9_000_000;

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

  const { Muxer, ArrayBufferTarget, StreamTarget } = await import("mp4-muxer");
  // stream mode: collect 16 MB parts (position-ordered) instead of one giant buffer.
  // Uses FRAGMENTED MP4 — its writes are append-only (no mdat backpatch), so the
  // parts can be concatenated without ever allocating the whole file contiguously.
  const parts: { pos: number; data: Uint8Array }[] = [];
  const abTarget = opts.stream ? null : new ArrayBufferTarget();
  const target = abTarget ?? new StreamTarget({ chunked: true, chunkSize: 16 * 1024 * 1024, onData: (data, position) => parts.push({ pos: position, data: data.slice() }) });
  const muxer = new Muxer({
    target: target as InstanceType<typeof ArrayBufferTarget>,
    fastStart: opts.stream ? "fragmented" : "in-memory",
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
  venc.configure({ codec: avc, width: W, height: H, bitrate, framerate: fps, latencyMode: "quality" });

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
      const maybe = drawFrame(ctx, f / fps);
      if (maybe && typeof (maybe as Promise<void>).then === "function") await maybe; // async draws (footage seeks)
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
    let blob: Blob;
    if (abTarget) {
      blob = new Blob([abTarget.buffer], { type: "video/mp4" });
    } else {
      parts.sort((a, b) => a.pos - b.pos);
      // fragmented writes should tile the file exactly; if the muxer ever emits an
      // overlap/backpatch, fall back to replaying the write log contiguously
      let tiled = true;
      let expect = 0;
      for (const p of parts) {
        if (p.pos !== expect) {
          tiled = false;
          break;
        }
        expect += p.data.byteLength;
      }
      if (tiled) {
        blob = new Blob(parts.map((p) => p.data as unknown as BlobPart), { type: "video/mp4" });
      } else {
        const size = parts.reduce((m, p) => Math.max(m, p.pos + p.data.byteLength), 0);
        const all = new Uint8Array(size);
        for (const p of parts) all.set(p.data, p.pos);
        blob = new Blob([all], { type: "video/mp4" });
      }
      parts.length = 0;
    }
    if (!blob.size) throw new Error("empty output");
    opts.onProgress?.(100, "Done");
    return { blob, ext: "mp4", mime: "video/mp4", hadVoice: !!audio };
  } catch (e) {
    cleanup();
    throw e;
  }
}
