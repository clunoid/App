"use client";

import { aspectSize, type ReelSpec, type ReelScene, type ReelTheme } from "./reel";
import { fetchNarrationBytes } from "./tts";
import { sfxComplete, sfxCorrect, sfxPop, sfxWrong } from "./sfx";

export type RenderResult = { blob: Blob; ext: string; mime: string; hadVoice: boolean };
export type RenderOpts = {
  host?: HTMLElement | null; // element to mount the live-rendering canvas into
  onProgress?: (pct: number, label: string) => void;
  signal?: AbortSignal;
};

/* ── small canvas helpers ─────────────────────────────────────────────────── */
const FONT = '"Baloo 2", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ease = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

function setFont(ctx: CanvasRenderingContext2D, px: number, weight = 800) {
  ctx.font = `${weight} ${Math.round(px)}px ${FONT}`;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  cx: number,
  y: number,
  px: number,
  color: string,
  opts: { weight?: number; shadow?: boolean; maxW?: number } = {}
) {
  const { weight = 800, shadow = false, maxW = Infinity } = opts;
  let p = px;
  setFont(ctx, p, weight);
  while (maxW !== Infinity && ctx.measureText(str).width > maxW && p > 12) {
    p -= Math.max(2, p * 0.06);
    setFont(ctx, p, weight);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = p * 0.12;
    ctx.shadowOffsetY = p * 0.06;
  }
  ctx.fillStyle = color;
  ctx.fillText(str, cx, y);
  if (shadow) ctx.restore();
  return p;
}
function drawTitle(ctx: CanvasRenderingContext2D, title: string, cx: number, y: number, px: number, ink: string, accent: string, shadow: boolean, maxW: number) {
  const words = title.split(" ");
  const last = words.length > 1 ? words.pop()! : "";
  const first = words.length ? words.join(" ") + (last ? " " : "") : title;
  let p = px;
  setFont(ctx, p, 800);
  while (ctx.measureText(first).width + ctx.measureText(last).width > maxW && p > 14) {
    p -= Math.max(2, p * 0.06);
    setFont(ctx, p, 800);
  }
  const w1 = ctx.measureText(first).width;
  const w2 = ctx.measureText(last).width;
  const sx = cx - (w1 + w2) / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.42)";
    ctx.shadowBlur = p * 0.12;
    ctx.shadowOffsetY = p * 0.06;
  }
  ctx.fillStyle = ink;
  ctx.fillText(first, sx, y);
  ctx.fillStyle = accent;
  ctx.fillText(last, sx + w1, y);
  if (shadow) ctx.restore();
  ctx.textAlign = "center";
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (!img.dataset.fb && url.includes("/w1280/")) {
        img.dataset.fb = "1";
        img.src = url.replace("/w1280/", "/w2560/");
        return;
      }
      resolve(null);
    };
    img.src = url;
  });
}

function pickMime(): { type: string; ext: string } {
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

/* ── backgrounds ──────────────────────────────────────────────────────────── */
function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, theme: ReelTheme, el: number) {
  if (theme.mode === "rays") {
    const hue = theme.hue ?? 222;
    const col1 = `hsl(${hue}, 75%, 47%)`;
    const col2 = `hsl(${hue}, 80%, 56%)`;
    ctx.fillStyle = col2;
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.42;
    const R = Math.hypot(W, H);
    const rot = (el * Math.PI * 2) / 80;
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i * 2 * Math.PI) / n;
      const a1 = rot + ((i + 1) * 2 * Math.PI) / n;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? col1 : col2;
      ctx.fill();
    }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.82);
    g.addColorStop(0, "rgba(255,255,255,0.18)");
    g.addColorStop(0.78, "rgba(0,0,0,0.18)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = theme.bg || "#c8c5bd";
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.34, 0, W / 2, H * 0.34, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.42, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(46,36,24,0.2)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const m = Math.round(W * 0.028);
    ctx.strokeStyle = "rgba(46,38,28,0.3)";
    ctx.lineWidth = Math.max(2, W * 0.0035);
    roundRect(ctx, m, m, W - 2 * m, H - 2 * m, W * 0.02);
    ctx.stroke();
  }
}

function drawBrand(ctx: CanvasRenderingContext2D, W: number, H: number, spec: ReelSpec) {
  const ink = spec.theme.mode === "rays" ? "rgba(255,255,255,0.85)" : "rgba(44,40,35,0.55)";
  text(ctx, spec.brand, W / 2, H * 0.965, Math.min(W, H) * 0.032, ink, { weight: 800 });
}

function drawImageCard(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, maxW: number, maxH: number, scale: number) {
  let iw = maxW;
  let ih = maxH;
  if (img && img.width && img.height) {
    const ar = img.width / img.height;
    iw = maxW;
    ih = iw / ar;
    if (ih > maxH) {
      ih = maxH;
      iw = ih * ar;
    }
  }
  iw *= scale;
  ih *= scale;
  const pad = Math.min(maxW, maxH) * 0.05;
  const cw = iw + pad * 2;
  const ch = ih + pad * 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.shadowBlur = cw * 0.06;
  ctx.shadowOffsetY = ch * 0.03;
  ctx.fillStyle = "#fff";
  roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, pad);
  ctx.fill();
  ctx.restore();
  if (img) {
    ctx.save();
    roundRect(ctx, cx - iw / 2, cy - ih / 2, iw, ih, pad * 0.5);
    ctx.clip();
    ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
    ctx.restore();
  }
}

function statusColor(theme: ReelTheme, correct: boolean) {
  return correct ? "#1f7a4d" : "#a32333";
}

/* ── scene drawers ────────────────────────────────────────────────────────── */
function drawIntro(ctx: CanvasRenderingContext2D, W: number, H: number, spec: ReelSpec, p: number) {
  const min = Math.min(W, H);
  const ink = spec.theme.mode === "rays" ? "#fff" : spec.theme.ink;
  const shadow = spec.theme.mode === "rays";
  ctx.globalAlpha = ease(p * 2.5);
  drawTitle(ctx, spec.intro.headline || spec.title, W / 2, H * 0.44, min * 0.092, ink, spec.theme.accent, shadow, W * 0.9);
  if (spec.subtitle) text(ctx, `“${spec.subtitle}”`, W / 2, H * 0.52, min * 0.04, spec.theme.accent, { weight: 700, shadow, maxW: W * 0.85 });
  if (spec.intro.sub) text(ctx, spec.intro.sub, W / 2, H * 0.6, min * 0.038, ink, { weight: 700, shadow, maxW: W * 0.85 });
  ctx.globalAlpha = 1;
}

function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, spec: ReelSpec, scene: ReelScene, img: HTMLImageElement | null, idx: number, p: number) {
  const min = Math.min(W, H);
  const ink = spec.theme.mode === "rays" ? "#fff" : spec.theme.ink;
  const shadow = spec.theme.mode === "rays";

  // Title (small, top)
  drawTitle(ctx, spec.title, W / 2, H * 0.115, min * 0.052, ink, spec.theme.accent, shadow, W * 0.86);

  // Round badge + difficulty
  text(ctx, `Round ${idx + 1}${scene.badge ? " · " + scene.badge : ""}`, W / 2, H * 0.17, min * 0.032, spec.theme.mode === "rays" ? "rgba(255,255,255,0.85)" : "rgba(44,40,35,0.6)", { weight: 700 });

  // Flag card (pops in)
  const pop = 0.85 + 0.15 * ease(p * 4);
  drawImageCard(ctx, img, W / 2, H * 0.44, W * 0.74, H * 0.4, pop);

  // The answer (reveals after ~35%)
  const ap = ease((p - 0.3) / 0.4);
  if (ap > 0.01) {
    ctx.globalAlpha = ap;
    text(ctx, scene.bigText, W / 2, H * 0.74, min * 0.085, spec.theme.mode === "rays" ? spec.theme.accent : spec.theme.ink, { weight: 800, shadow, maxW: W * 0.9 });
    const sc = statusColor(spec.theme, scene.correct);
    const statusTxt = scene.correct ? "✓ Correct" : scene.userText ? `✗ You said “${scene.userText}”` : "✗";
    text(ctx, statusTxt, W / 2, H * 0.8, min * 0.038, scene.correct ? (spec.theme.mode === "rays" ? "#bdf0d2" : sc) : spec.theme.mode === "rays" ? "#f6c9cf" : sc, { weight: 700, shadow, maxW: W * 0.9 });
    ctx.globalAlpha = 1;
  }
}

function drawOutro(ctx: CanvasRenderingContext2D, W: number, H: number, spec: ReelSpec, p: number) {
  const min = Math.min(W, H);
  const ink = spec.theme.mode === "rays" ? "#fff" : spec.theme.ink;
  const shadow = spec.theme.mode === "rays";
  ctx.globalAlpha = ease(p * 2.5);
  text(ctx, spec.outro.headline, W / 2, H * 0.34, min * 0.085, spec.theme.accent, { weight: 800, shadow, maxW: W * 0.9 });
  // big score
  const sc = 0.7 + 0.3 * ease(p * 3);
  ctx.save();
  ctx.translate(W / 2, H * 0.52);
  ctx.scale(sc, sc);
  text(ctx, spec.outro.scoreText, 0, 0, min * 0.16, ink, { weight: 800, shadow });
  ctx.restore();
  if (spec.outro.sub) text(ctx, spec.outro.sub, W / 2, H * 0.62, min * 0.04, ink, { weight: 700, shadow, maxW: W * 0.85 });
  text(ctx, `Play at ${spec.brand}`, W / 2, H * 0.74, min * 0.045, spec.theme.accent, { weight: 800, shadow, maxW: W * 0.85 });
  ctx.globalAlpha = 1;
}

type Durs = { introDur: number; sceneDurs: number[]; outroDur: number };
function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, spec: ReelSpec, images: (HTMLImageElement | null)[], durs: Durs, el: number) {
  drawBg(ctx, W, H, spec.theme, el);
  drawBrand(ctx, W, H, spec);
  if (el < durs.introDur) {
    drawIntro(ctx, W, H, spec, el / durs.introDur);
    return;
  }
  let t = el - durs.introDur;
  for (let i = 0; i < spec.scenes.length; i++) {
    if (t < durs.sceneDurs[i]) {
      drawScene(ctx, W, H, spec, spec.scenes[i], images[i], i, t / durs.sceneDurs[i]);
      return;
    }
    t -= durs.sceneDurs[i];
  }
  drawOutro(ctx, W, H, spec, t / Math.max(0.001, durs.outroDur));
}

/* ── main: render the spec into a video Blob ──────────────────────────────── */
export async function renderReel(spec: ReelSpec, opts: RenderOpts = {}): Promise<RenderResult> {
  const { host, onProgress, signal } = opts;
  const prog = (p: number, l: string) => onProgress?.(p, l);
  const { w: W, h: H } = aspectSize(spec.aspect);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.display = "block";
  canvas.style.maxWidth = "100%";
  canvas.style.maxHeight = "100%";
  canvas.style.margin = "0 auto";
  canvas.style.borderRadius = "14px";
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  if (host) {
    host.innerHTML = "";
    host.appendChild(canvas);
  }

  prog(3, "Preparing…");
  try {
    await Promise.all([document.fonts.load('800 120px "Baloo 2"'), document.fonts.load('700 120px "Baloo 2"')]);
  } catch {
    /* fonts optional */
  }
  // first frame so the preview isn't blank during the fetch
  drawFrame(ctx, W, H, spec, [], { introDur: 1, sceneDurs: [], outroDur: 1 }, 0);

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();
  const dest = ac.createMediaStreamDestination();

  prog(8, "Loading Isaac’s voice…");
  const lines = [spec.intro.narration, ...spec.scenes.map((s) => s.narration), spec.outro.narration];
  const [images, narrBytes] = await Promise.all([
    Promise.all(spec.scenes.map((s) => loadImage(s.imageUrl))),
    Promise.all(lines.map((t) => fetchNarrationBytes(t))),
  ]);
  if (signal?.aborted) {
    try { await ac.close(); } catch {}
    throw new DOMException("aborted", "AbortError");
  }

  const buffers: (AudioBuffer | null)[] = [];
  for (const b of narrBytes) {
    if (!b) {
      buffers.push(null);
      continue;
    }
    try {
      const ab = new ArrayBuffer(b.byteLength);
      new Uint8Array(ab).set(b);
      buffers.push(await ac.decodeAudioData(ab));
    } catch {
      buffers.push(null);
    }
  }
  const hadVoice = buffers.some(Boolean);
  const introBuf = buffers[0];
  const sceneBufs = buffers.slice(1, 1 + spec.scenes.length);
  const outroBuf = buffers[buffers.length - 1];

  const dur = (b: AudioBuffer | null, min: number) => Math.max(min, (b ? b.duration : 0) + 0.7);
  const introDur = dur(introBuf, 2.0);
  const sceneDurs = spec.scenes.map((_, i) => dur(sceneBufs[i], 1.7));
  const outroDur = dur(outroBuf, 3.4);
  const total = introDur + sceneDurs.reduce((a, b) => a + b, 0) + outroDur;

  const fps = 30;
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

  try {
    await ac.resume();
  } catch {
    /* ignore */
  }
  const t0 = ac.currentTime + 0.12;
  const play = (buf: AudioBuffer | null, at: number) => {
    if (!buf) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    try {
      src.connect(ac.destination);
    } catch {
      /* ignore */
    }
    src.start(t0 + at);
  };
  let at = 0;
  play(introBuf, at + 0.15);
  at += introDur;
  spec.scenes.forEach((s, i) => {
    sfxPop(ac, dest, t0 + at + 0.02);
    play(sceneBufs[i], at + 0.2);
    (s.correct ? sfxCorrect : sfxWrong)(ac, dest, t0 + at + sceneDurs[i] * 0.32);
    at += sceneDurs[i];
  });
  sfxComplete(ac, dest, t0 + at + 0.1);
  play(outroBuf, at + 0.3);

  rec.start();
  prog(15, "Recording…");
  const startMs = performance.now();
  await new Promise<void>((resolve, reject) => {
    const frame = () => {
      if (signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      const el = (performance.now() - startMs) / 1000;
      try {
        drawFrame(ctx, W, H, spec, images, { introDur, sceneDurs, outroDur }, el);
      } catch (e) {
        reject(e as Error);
        return;
      }
      prog(Math.min(99, 15 + Math.round((el / total) * 84)), "Recording…");
      if (el >= total) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }).catch((e) => {
    try { rec.stop(); } catch {}
    try { ac.close(); } catch {}
    throw e;
  });

  try { rec.stop(); } catch {}
  await stopped;
  try { await ac.close(); } catch {}
  prog(100, "Done");
  const blob = new Blob(chunks, { type: mime.type || "video/webm" });
  return { blob, ext: mime.ext, mime: mime.type || "video/webm", hadVoice };
}
