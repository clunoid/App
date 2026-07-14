"use client";

/**
 * VLAB — the FINAL CUT, rendered in the user's browser (WebCodecs → H.264+AAC
 * via the proven shared encoder). This replaced the fal ffmpeg compose step
 * after live testing found its queue can stall for 20+ minutes: the last step
 * of an expensive video must never depend on someone else's queue. Rendering
 * locally is instant to start, free, and — because encodeCanvasToMp4Web is
 * timer-independent — keeps working in a hidden tab.
 *
 * Every clip is drawn into its shot's EXACT narration window (measured from the
 * ElevenLabs character timestamps), so picture and voice stay frame-locked.
 */
import { encodeCanvasToMp4Web, hasWebCodecs, type Mp4Audio } from "@/lib/share/webcodecs-mp4";

export type ShotWindow = { start: number; dur: number };

export async function composeFinalCut(opts: {
  clipUrls: string[];
  windows: ShotWindow[];
  audioUrl: string;
  onProgress?: (p: number, label: string) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const { clipUrls, windows, audioUrl, onProgress, signal } = opts;
  if (!hasWebCodecs()) throw new Error("This browser can't render video — use Chrome or Edge.");
  if (clipUrls.length !== windows.length) throw new Error("clip/window mismatch");

  /* open every clip as a STREAMING <video> (crossOrigin; fal.media sends
     ACAO:*) — no 100MB+ upfront download; each seek range-requests only the
     bytes that frame needs. Retried, because the CDN can throw transient 5xx. */
  const fetchWithRetry = async (url: string): Promise<Response> => {
    let last: unknown;
    for (let a = 0; a < 3; a++) {
      try {
        const res = await fetch(url, { signal });
        if (res.ok) return res;
        last = new Error(`fetch ${res.status}`);
      } catch (e) {
        last = e;
      }
      await new Promise((r) => setTimeout(r, 2000 * (a + 1)));
    }
    throw last;
  };
  onProgress?.(2, "Opening footage…");
  const videos = await Promise.all(
    clipUrls.map(async (url) => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.crossOrigin = "anonymous";
      const opened = await new Promise<boolean>((res2) => {
        const to = setTimeout(() => res2(false), 20_000);
        v.onloadedmetadata = () => { clearTimeout(to); res2(true); };
        v.onerror = () => { clearTimeout(to); res2(false); };
        v.src = url;
      });
      if (opened) return v;
      // fallback: full blob download (retried) if streaming won't open
      const res = await fetchWithRetry(url);
      v.crossOrigin = null as unknown as string;
      v.src = URL.createObjectURL(await res.blob());
      await new Promise<void>((res2, rej) => {
        v.onloadedmetadata = () => res2();
        v.onerror = () => rej(new Error("clip decode failed"));
      });
      return v;
    })
  );

  /* narration → f32-planar source for the encoder. Normalized to stereo/48kHz
     through an OfflineAudioContext — the exact path the proven renderers use
     (feeding the AAC encoder a raw mono/44.1k mp3 decode makes it flush-fail). */
  onProgress?.(6, "Loading narration…");
  const audioRes = await fetchWithRetry(audioUrl);
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(await audioRes.arrayBuffer());
  try { await ac.close(); } catch { /* ignore */ }
  const off = new OfflineAudioContext(2, Math.ceil((decoded.duration + 0.1) * 48000), 48000);
  const srcNode = off.createBufferSource();
  srcNode.buffer = decoded;
  srcNode.connect(off.destination);
  srcNode.start(0);
  const mixed = await off.startRendering();
  const CH = Math.min(2, Math.max(1, mixed.numberOfChannels));
  const audio: Mp4Audio = {
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

  const total = windows[windows.length - 1].start + windows[windows.length - 1].dur;
  const W = 1080;
  const H = 1920;

  /** Which shot covers time t (windows are contiguous by construction). */
  const shotAt = (t: number) => {
    for (let i = windows.length - 1; i >= 0; i--) if (t >= windows[i].start - 1e-4) return i;
    return 0;
  };

  const seekTo = (v: HTMLVideoElement, t: number) =>
    new Promise<void>((res) => {
      const target = Math.max(0, Math.min(t, Math.max(0, (v.duration || t) - 0.05)));
      if (Math.abs(v.currentTime - target) < 1 / 60) return res();
      const done = () => { v.removeEventListener("seeked", done); res(); };
      v.addEventListener("seeked", done);
      v.currentTime = target;
    });

  const drawFrame = async (ctx: CanvasRenderingContext2D, t: number) => {
    const i = shotAt(t);
    const v = videos[i];
    await seekTo(v, t - windows[i].start);
    // cover-fit the clip into the 9:16 frame
    const vw = v.videoWidth || W;
    const vh = v.videoHeight || H;
    const scale = Math.max(W / vw, H / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  };

  /* Release every footage decoder the moment the video phase ends (inner
     progress hits 90 = audio phase). Eight open H.264 decoder contexts can
     starve the platform media stack right when the AAC encoder allocates —
     observed as AudioEncoder "Flushing error." on Windows. Idempotent; also
     runs in finally. */
  let released = false;
  const releaseFootage = () => {
    if (released) return;
    released = true;
    for (const v of videos) {
      try {
        if (v.src.startsWith("blob:")) URL.revokeObjectURL(v.src);
        v.removeAttribute("src");
        v.load();
      } catch { /* ignore */ }
    }
  };

  try {
    const encode = (preferSoftware: boolean) =>
      encodeCanvasToMp4Web({
        W,
        H,
        fps: 30,
        durationSec: total,
        drawFrame,
        audio,
        // 7 Mbps: visually excellent for stylized 3D at 1080×1920, but ~25%
        // smaller than the 9 Mbps default → faster to load and download.
        bitrate: 7_000_000,
        onProgress: (p, l) => {
          if (p >= 90) releaseFootage(); // video frames done — free the decoders for the AAC encoder
          onProgress?.(8 + p * 0.9, l);
        },
        signal,
        preferSoftware,
      });
    let result;
    try {
      result = await encode(false);
    } catch (e) {
      // hidden/occluded tabs can lose the hardware encoder mid-render
      // ("Flushing error.") — the software encoder is slower but immune
      if (signal?.aborted || released) throw e; // footage freed → can't re-encode video
      onProgress?.(8, "Retrying with the software encoder…");
      result = await encode(true);
    }
    return result.blob;
  } finally {
    releaseFootage();
  }
}
