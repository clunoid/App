"use client";

import { aspectSize, type ReelSpec, type ReelScene, type ReelTheme } from "./reel";
import { fetchNarrationBytes } from "./tts";
import { sfxComplete, sfxCorrect, sfxPop, sfxTick, sfxWrong } from "./sfx";

export type RenderResult = { blob: Blob; ext: string; mime: string; hadVoice: boolean };

// Each scene plays like a real round: a suspense beat (flag + Isaac's question +
// a calm ticking timer) BEFORE the answer is revealed — so the clip feels like
// watching the game being played, not a results recap. The beat is at least this
// long (and longer if Isaac's question takes longer), so the timer isn't a flash.
const QUESTION_MIN_SECONDS = 2.9;

/** Run async tasks with a concurrency cap (gentle on the TTS API → no rate-limit drops). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, worker));
  return out;
}

/** Fetch + decode one narration line, retrying transient failures so Isaac never drops out. */
async function fetchDecodeLine(ac: AudioContext, text: string): Promise<AudioBuffer | null> {
  if (!text || !text.trim()) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const bytes = await fetchNarrationBytes(text);
    if (bytes) {
      try {
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        return await ac.decodeAudioData(ab);
      } catch {
        return null; // a decode error won't fix on retry
      }
    }
    // null = 204 (no key) or a transient/rate-limit error → back off and retry.
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 + attempt * 500));
  }
  return null;
}
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
  if (!spec.brand) return; // unbranded (subscriber) export — no watermark
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

// The game's striped timer bar (green → red as it depletes), for the suspense beat.
function drawTimerBar(ctx: CanvasRenderingContext2D, W: number, H: number, frac: number, theme: ReelTheme, cy: number) {
  const bw = W * 0.6;
  const bh = Math.max(10, H * 0.013);
  const x = W / 2 - bw / 2;
  const y = cy - bh / 2;
  ctx.fillStyle = theme.mode === "rays" ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.16)";
  roundRect(ctx, x, y, bw, bh, bh / 2);
  ctx.fill();
  const f = clamp01(frac);
  ctx.fillStyle = `hsl(${Math.max(0, f * 125)}, 90%, 48%)`;
  roundRect(ctx, x, y, Math.max(bh, bw * f), bh, bh / 2);
  ctx.fill();
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

function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, spec: ReelSpec, scene: ReelScene, img: HTMLImageElement | null, idx: number, p: number, sceneDur: number, qDur: number) {
  const min = Math.min(W, H);
  const ink = spec.theme.mode === "rays" ? "#fff" : spec.theme.ink;
  const shadow = spec.theme.mode === "rays";
  const qFrac = Math.min(0.78, qDur / Math.max(0.001, sceneDur));
  const revealing = p >= qFrac;

  // Title (small, top)
  drawTitle(ctx, spec.title, W / 2, H * 0.115, min * 0.052, ink, spec.theme.accent, shadow, W * 0.86);

  // Round badge + difficulty
  text(ctx, `Round ${idx + 1}${scene.badge ? " · " + scene.badge : ""}`, W / 2, H * 0.17, min * 0.032, spec.theme.mode === "rays" ? "rgba(255,255,255,0.85)" : "rgba(44,40,35,0.6)", { weight: 700 });

  // Flag card (pops in)
  const pop = 0.85 + 0.15 * ease(p * 5);
  drawImageCard(ctx, img, W / 2, H * 0.43, W * 0.74, H * 0.38, pop);

  if (!revealing) {
    // ── Suspense beat: the question + a depleting timer (like playing a round) ──
    text(ctx, scene.questionText, W / 2, H * 0.72, min * 0.05, ink, { weight: 800, shadow, maxW: W * 0.9 });
    drawTimerBar(ctx, W, H, 1 - p / qFrac, spec.theme, H * 0.8);
  } else {
    // ── Reveal: the answer pops in with ✓/✗ ──
    const rp = clamp01((p - qFrac) / (1 - qFrac));
    const ap = ease(rp * 3);
    ctx.globalAlpha = ap;
    const nameScale = 0.8 + 0.2 * ease(rp * 3);
    ctx.save();
    ctx.translate(W / 2, H * 0.72);
    ctx.scale(nameScale, nameScale);
    text(ctx, scene.bigText, 0, 0, min * 0.085, spec.theme.mode === "rays" ? spec.theme.accent : spec.theme.ink, { weight: 800, shadow, maxW: W * 0.86 });
    ctx.restore();
    const sc = statusColor(spec.theme, scene.correct);
    const statusTxt = scene.correct ? "✓ Correct" : scene.userText ? `✗ You said “${scene.userText}”` : "✗ Missed";
    text(ctx, statusTxt, W / 2, H * 0.8, min * 0.038, scene.correct ? (spec.theme.mode === "rays" ? "#bdf0d2" : sc) : spec.theme.mode === "rays" ? "#f6c9cf" : sc, { weight: 700, shadow, maxW: W * 0.9 });
    ctx.globalAlpha = 1;
  }
}

function drawOutro(ctx: CanvasRenderingContext2D, W: number, H: number, spec: ReelSpec, p: number) {
  const min = Math.min(W, H);
  const ink = spec.theme.mode === "rays" ? "#fff" : spec.theme.ink;
  const shadow = spec.theme.mode === "rays";
  ctx.globalAlpha = ease(p * 2.5);
  // Call to action — invite viewers to play (clunoid.com is the hero).
  text(ctx, spec.outro.headline, W / 2, H * 0.32, min * 0.082, spec.theme.accent, { weight: 800, shadow, maxW: W * 0.9 });
  if (spec.outro.scoreText) text(ctx, spec.outro.scoreText, W / 2, H * 0.42, min * 0.044, ink, { weight: 700, shadow, maxW: W * 0.85 });
  if (spec.brand) {
    const sc = 0.82 + 0.18 * ease(p * 3);
    ctx.save();
    ctx.translate(W / 2, H * 0.57);
    ctx.scale(sc, sc);
    text(ctx, spec.brand, 0, 0, min * 0.11, spec.theme.accent, { weight: 800, shadow });
    ctx.restore();
  }
  if (spec.outro.sub) text(ctx, spec.outro.sub, W / 2, H * 0.67, min * 0.04, ink, { weight: 700, shadow, maxW: W * 0.85 });
  ctx.globalAlpha = 1;
}

type Durs = { introDur: number; sceneDurs: number[]; qDurs: number[]; outroDur: number };
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
      drawScene(ctx, W, H, spec, spec.scenes[i], images[i], i, t / durs.sceneDurs[i], durs.sceneDurs[i], durs.qDurs[i]);
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
  drawFrame(ctx, W, H, spec, [], { introDur: 1, sceneDurs: [], qDurs: [], outroDur: 1 }, 0);

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();
  const dest = ac.createMediaStreamDestination();

  prog(8, "Loading Isaac’s voice…");
  // Every line Isaac speaks: intro, then a QUESTION + an ANSWER per scene, then outro.
  const lineTexts: string[] = [spec.intro.narration];
  spec.scenes.forEach((s) => {
    lineTexts.push(s.questionNarration || "");
    lineTexts.push(s.narration);
  });
  lineTexts.push(spec.outro.narration);

  // Fetch images + all narration. DEDUPE identical lines (every round repeats the
  // same question, e.g. "Which country is this?") so each unique line costs ONE
  // TTS request — critical for the rate-limited free voices. Cap concurrency (low,
  // with retry) so a long video never trips the rate limit and drops a line.
  const imagesP = Promise.all(spec.scenes.map((s) => loadImage(s.imageUrl)));
  const norm = (t: string) => (t || "").trim();
  const uniqueTexts = [...new Set(lineTexts.map(norm).filter(Boolean))];
  const decoded = new Map<string, AudioBuffer | null>();
  let fetched = 0;
  await mapLimit(uniqueTexts, 2, async (t) => {
    decoded.set(t, await fetchDecodeLine(ac, t));
    fetched++;
    prog(Math.min(14, 8 + Math.round((fetched / uniqueTexts.length) * 6)), "Loading Isaac’s voice…");
  });
  // Re-expand to one buffer per line (a single AudioBuffer can back many sources).
  const buffers = lineTexts.map((t) => {
    const n = norm(t);
    return n ? decoded.get(n) ?? null : null;
  });
  const images = await imagesP;
  if (signal?.aborted) {
    try { await ac.close(); } catch {}
    throw new DOMException("aborted", "AbortError");
  }

  const hadVoice = buffers.some(Boolean);
  const introBuf = buffers[0];
  const questionBufs = spec.scenes.map((_, i) => buffers[1 + i * 2]);
  const answerBufs = spec.scenes.map((_, i) => buffers[2 + i * 2]);
  const outroBuf = buffers[buffers.length - 1];

  const dur = (b: AudioBuffer | null, min: number) => Math.max(min, (b ? b.duration : 0) + 0.7);
  const introDur = dur(introBuf, 2.2);
  // Suspense beat = Isaac's question + a "thinking" pause (calm timer, never a flash);
  // the reveal lasts as long as Isaac takes to name the answer.
  const qDurs = spec.scenes.map((_, i) => Math.max(QUESTION_MIN_SECONDS, questionBufs[i] ? questionBufs[i]!.duration + 1.1 : QUESTION_MIN_SECONDS));
  const revealDurs = spec.scenes.map((_, i) => dur(answerBufs[i], 1.5));
  const sceneDurs = spec.scenes.map((_, i) => qDurs[i] + revealDurs[i]);
  const outroDur = dur(outroBuf, 4.2);
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
    const qd = qDurs[i];
    sfxPop(ac, dest, t0 + at + 0.02); // flag appears
    play(questionBufs[i], at + 0.2); // Isaac ASKS the question
    sfxTick(ac, dest, t0 + at + qd - 0.5); // countdown ticks near the end of the beat
    sfxTick(ac, dest, t0 + at + qd - 0.18, true);
    (s.correct ? sfxCorrect : sfxWrong)(ac, dest, t0 + at + qd + 0.03); // reveal sting
    play(answerBufs[i], at + qd + 0.12); // Isaac says the ANSWER at the reveal
    at += sceneDurs[i];
  });
  sfxComplete(ac, dest, t0 + at + 0.1);
  play(outroBuf, at + 0.3);

  rec.start();
  prog(15, "Recording…");
  // Drive the video off the AUDIO clock so the picture and Isaac never drift apart
  // (requestAnimationFrame can throttle; ac.currentTime can't) — this is what keeps
  // Isaac in sync, and audible, even on long clips.
  await new Promise<void>((resolve, reject) => {
    const frame = () => {
      if (signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      const el = Math.max(0, ac.currentTime - t0);
      try {
        drawFrame(ctx, W, H, spec, images, { introDur, sceneDurs, qDurs, outroDur }, el);
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
