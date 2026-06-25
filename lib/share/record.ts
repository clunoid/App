"use client";

/**
 * Generic canvas → video recorder, factored so any feature can record without
 * duplicating the MediaRecorder/AudioContext plumbing. (lib/share/renderer.ts
 * keeps its own inline copy — this file is purely additive and changes nothing
 * there.) Prefers MP4/H.264, falls back to WebM.
 */

export function pickMime(): { type: string; ext: string } {
  const cands = [
    { type: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', ext: "mp4" },
    { type: "video/mp4", ext: "mp4" },
    { type: "video/webm;codecs=vp9,opus", ext: "webm" },
    { type: "video/webm;codecs=vp8,opus", ext: "webm" },
    { type: "video/webm", ext: "webm" },
  ];
  for (const c of cands) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c.type)) return c;
    } catch {
      /* ignore */
    }
  }
  return { type: "", ext: "webm" };
}

export type CanvasRecorder = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ac: AudioContext;
  dest: MediaStreamAudioDestinationNode;
  start: () => void;
  stop: () => Promise<{ blob: Blob; ext: string; mime: string }>;
};

export function createCanvasRecorder(W: number, H: number, fps = 30, host?: HTMLElement | null): CanvasRecorder {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = "display:block;max-width:100%;max-height:100%;margin:0 auto;border-radius:14px";
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  if (host) {
    host.innerHTML = "";
    host.appendChild(canvas);
  }
  const ACtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new ACtor();
  const dest = ac.createMediaStreamDestination();
  const vstream = canvas.captureStream(fps);
  const mixed = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = pickMime();
  const rec = new MediaRecorder(mixed, mime.type ? { mimeType: mime.type, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => {
    rec.onstop = () => res();
  });
  return {
    canvas,
    ctx,
    ac,
    dest,
    start: () => rec.start(),
    stop: async () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      await stopped;
      try {
        await ac.close();
      } catch {
        /* ignore */
      }
      return { blob: new Blob(chunks, { type: mime.type || "video/webm" }), ext: mime.ext, mime: mime.type || "video/webm" };
    },
  };
}
