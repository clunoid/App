"use client";

/**
 * Edge prediction-video RENDERER (client). The premium two-voice audio is fetched
 * ONCE, then BOTH aspect ratios (9:16 vertical + 16:9 wide) are encoded from the
 * same mixed buffer — so ElevenLabs is billed a single time regardless of format.
 * Reuses the shared WebCodecs encoder + the graphics audio→Mp4Audio adapter; the
 * frame drawing is Edge-specific (sport backdrop, team logos, winner call,
 * karaoke captions, speaker label). No Motion-Graphics code is modified.
 */
import { aspectSize, type ReelAspect } from "@/lib/share/reel";
import { encodeCanvasToMp4Web, hasWebCodecs } from "@/lib/share/webcodecs-mp4";
import { toMp4Audio } from "@/lib/graphics/audio";
import type { VideoPlan } from "./video-types";

const ACCENT = "#34d399";
const BLUE = "#7dd3fc";
const INK = "#0a0c0d";

type Word = { text: string; start: number; end: number };
type SceneTiming = { start: number; lineAt: number; dur: number; words: Word[] };
type Timing = { scenes: SceneTiming[]; total: number };
type Assets = { images: Map<string, HTMLImageElement> };

export type EdgeRenderResult = { portrait: Blob; landscape: Blob; hadVoice: boolean };
export type EdgeRenderOpts = { onProgress?: (pct: number, label: string) => void; signal?: AbortSignal };

const LEAD = 0.18;
const TAIL = 0.45;

/* ── audio: fetch each line once, build word windows, mix to one buffer ─────── */
async function decodeB64(ac: AudioContext, b64: string): Promise<AudioBuffer | null> {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return await ac.decodeAudioData(bytes.buffer);
  } catch {
    return null;
  }
}

function wordsFrom(text: string, buf: AudioBuffer | null, chars?: string[] | null, times?: number[] | null): Word[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (chars && times && chars.length === times.length && chars.length > 3) {
    const out: Word[] = [];
    let w = "";
    let start = 0;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (/\s/.test(c)) { if (w) out.push({ text: w, start, end: times[i] ?? start + 0.3 }); w = ""; }
      else { if (!w) start = times[i] ?? 0; w += c; }
    }
    if (w) out.push({ text: w, start, end: (times[times.length - 1] ?? start) + 0.25 });
    if (out.length) return out;
  }
  if (!buf) return words.map((t, i) => ({ text: t, start: i * 0.35, end: i * 0.35 + 0.3 }));
  const dur = Math.max(0.5, buf.duration - 0.1);
  const total = words.reduce((a, b) => a + b.length + 1, 0);
  let t = 0;
  return words.map((w) => { const span = ((w.length + 1) / total) * dur; const cw = { text: w, start: t, end: t + span }; t += span; return cw; });
}

async function fetchAudio(plan: VideoPlan, ac: AudioContext, onProgress?: (d: number, n: number) => void, signal?: AbortSignal): Promise<{ bufs: (AudioBuffer | null)[]; words: Word[][] }> {
  const bufs: (AudioBuffer | null)[] = [];
  const words: Word[][] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const s = plan.scenes[i];
    let buf: AudioBuffer | null = null;
    let chars: string[] | null = null;
    let times: number[] | null = null;
    try {
      const res = await fetch("/api/edge/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: s.line, speaker: s.speaker }), signal });
      if (res.ok) { const d = (await res.json()) as { audio?: string; chars?: string[] | null; times?: number[] | null }; if (d.audio) { buf = await decodeB64(ac, d.audio); chars = d.chars ?? null; times = d.times ?? null; } }
    } catch (e) { if ((e as Error)?.name === "AbortError") throw e; }
    bufs.push(buf);
    words.push(wordsFrom(s.line, buf, chars, times));
    onProgress?.(i + 1, plan.scenes.length);
  }
  return { bufs, words };
}

function buildTiming(plan: VideoPlan, bufs: (AudioBuffer | null)[], words: Word[][]): Timing {
  const scenes: SceneTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < plan.scenes.length; i++) {
    const d = bufs[i]?.duration ?? 2.2;
    const start = cursor;
    const lineAt = start + LEAD;
    const dur = LEAD + d + TAIL;
    scenes.push({ start, lineAt, dur, words: words[i] });
    cursor += dur;
  }
  return { scenes, total: Math.max(1, cursor) };
}

async function mixAudio(plan: VideoPlan, bufs: (AudioBuffer | null)[], timing: Timing): Promise<AudioBuffer | null> {
  try {
    const SR = 48000;
    const OfflineCtor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const off = new OfflineCtor(2, Math.ceil(timing.total * SR), SR);
    const master = off.createGain();
    master.gain.value = 1;
    master.connect(off.destination);
    // subtle ambient pad, ducked under speech
    const bed = off.createGain();
    bed.gain.value = 0.03;
    const lp = off.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    bed.connect(lp).connect(master);
    const notes = [220, 277.18, 329.63]; // A minor-ish pad
    for (const f of notes) { const o = off.createOscillator(); o.type = "triangle"; o.frequency.value = f; const g = off.createGain(); g.gain.value = 0.5; o.connect(g).connect(bed); o.start(0); o.stop(timing.total); }
    for (let i = 0; i < bufs.length; i++) {
      const buf = bufs[i];
      if (!buf) continue;
      const src = off.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      src.start(timing.scenes[i].lineAt);
    }
    return await off.startRendering();
  } catch {
    return null;
  }
}

/* ── assets ───────────────────────────────────────────────────────────────── */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = url; });
}
async function loadAssets(plan: VideoPlan): Promise<Assets> {
  const urls = new Set<string>();
  for (const m of plan.matches) { if (m.bgImage) urls.add(m.bgImage); if (m.homeLogo) urls.add(m.homeLogo); if (m.awayLogo) urls.add(m.awayLogo); }
  const images = new Map<string, HTMLImageElement>();
  await Promise.all([...urls].map(async (u) => { const img = await loadImage(u); if (img) images.set(u, img); }));
  return { images };
}

/* ── frame drawing ────────────────────────────────────────────────────────── */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const ir = img.width / img.height, cr = W / H;
  let dw = W, dh = H, dx = 0, dy = 0;
  if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; } else { dw = W; dh = W / ir; dy = (H - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}
function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, cx: number, cy: number, size: number) {
  if (img) { const s = size, r = ir(img); let w = s, h = s; if (r > 1) h = s / r; else w = s * r; ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h); }
  else { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.fill(); }
}
const ir = (img: HTMLImageElement) => (img.width && img.height ? img.width / img.height : 1);

function easeIO(x: number) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, plan: VideoPlan, timing: Timing, assets: Assets, t: number, branded: boolean) {
  // scene at t
  let si = 0;
  for (let i = 0; i < timing.scenes.length; i++) if (t >= timing.scenes[i].start - 1e-6) si = i;
  const st = timing.scenes[si];
  const scene = plan.scenes[si];
  const local = t - st.start;
  const portrait = H > W;
  const m = scene.matchIndex >= 0 ? plan.matches[scene.matchIndex] : undefined;

  // background
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const bg = m?.bgImage ? assets.images.get(m.bgImage) : undefined;
  if (bg) { ctx.save(); ctx.globalAlpha = 0.55; drawCover(ctx, bg, W, H); ctx.restore(); }
  // legibility gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(10,12,13,0.72)");
  grad.addColorStop(0.42, "rgba(10,12,13,0.35)");
  grad.addColorStop(1, "rgba(10,12,13,0.94)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // emerald top glow
  const gg = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 0.7);
  gg.addColorStop(0, "rgba(52,211,153,0.16)");
  gg.addColorStop(1, "rgba(52,211,153,0)");
  ctx.fillStyle = gg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const S = Math.min(W, H); // scale unit
  const fadeIn = Math.min(1, local / 0.4);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (!m) {
    // intro / outro title card
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.fillStyle = ACCENT;
    ctx.font = `800 ${S * 0.05}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillText("EDGE", cx, H * 0.34);
    ctx.fillStyle = "#f3f6f4";
    ctx.font = `700 ${S * 0.085}px "Space Grotesk", system-ui, sans-serif`;
    wrapText(ctx, plan.title, cx, H * 0.46, W * 0.86, S * 0.1);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `500 ${S * 0.032}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillText("AI match predictions", cx, H * 0.6);
    ctx.restore();
  } else {
    // league chip
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.font = `600 ${S * 0.03}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`${m.leagueEmoji || "🏆"}  ${m.league || m.sport}`.toUpperCase(), cx, H * (portrait ? 0.12 : 0.1));
    ctx.restore();

    // teams
    const logoSize = S * (portrait ? 0.26 : 0.24);
    const enter = easeIO(Math.min(1, local / 0.5));
    const homeIsWinner = m.winner === m.home;
    if (portrait) {
      const y1 = H * 0.3, y2 = H * 0.52;
      drawTeam(ctx, assets.images.get(m.homeLogo || ""), m.home, cx, y1, logoSize, enter, homeIsWinner ? ACCENT : "#f3f6f4", homeIsWinner);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `800 ${S * 0.05}px "Space Grotesk", system-ui, sans-serif`;
      ctx.fillText("VS", cx, (y1 + y2) / 2);
      drawTeam(ctx, assets.images.get(m.awayLogo || ""), m.away, cx, y2, logoSize, enter, !homeIsWinner ? BLUE : "#f3f6f4", !homeIsWinner);
    } else {
      const xl = W * 0.28, xr = W * 0.72, y = H * 0.42;
      drawTeam(ctx, assets.images.get(m.homeLogo || ""), m.home, xl, y, logoSize, enter, homeIsWinner ? ACCENT : "#f3f6f4", homeIsWinner);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `800 ${S * 0.06}px "Space Grotesk", system-ui, sans-serif`;
      ctx.fillText("VS", cx, y);
      drawTeam(ctx, assets.images.get(m.awayLogo || ""), m.away, xr, y, logoSize, enter, !homeIsWinner ? BLUE : "#f3f6f4", !homeIsWinner);
    }

    // pick banner (appears a beat in)
    const showPick = local > 0.5;
    if (showPick) {
      const pa = Math.min(1, (local - 0.5) / 0.4);
      ctx.save();
      ctx.globalAlpha = pa;
      const by = H * (portrait ? 0.72 : 0.72);
      const bw = Math.min(W * 0.9, S * 1.5), bh = S * (portrait ? 0.13 : 0.16);
      roundRect(ctx, cx - bw / 2, by - bh / 2, bw, bh, bh * 0.28);
      ctx.fillStyle = "rgba(52,211,153,0.14)";
      ctx.fill();
      ctx.strokeStyle = "rgba(52,211,153,0.5)";
      ctx.lineWidth = Math.max(1, S * 0.002);
      ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.font = `700 ${S * 0.026}px "Space Grotesk", system-ui, sans-serif`;
      ctx.fillText("EDGE PICK", cx, by - bh * 0.26);
      ctx.fillStyle = "#f3f6f4";
      ctx.font = `800 ${S * 0.05}px "Space Grotesk", system-ui, sans-serif`;
      ctx.fillText(`${m.winner}  ·  ${(m.winnerProb * 100).toFixed(0)}%`, cx, by + bh * 0.16);
      ctx.restore();
    }
  }

  // caption (karaoke) + speaker label
  drawCaption(ctx, W, H, st, local, scene.speaker, S, portrait);

  if (branded) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 ${S * 0.022}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillText("clunoid.com/edge", W - S * 0.05, H - S * 0.045);
    ctx.restore();
  }
}

function drawTeam(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | undefined, name: string, cx: number, cy: number, size: number, enter: number, color: string, isWinner: boolean) {
  ctx.save();
  ctx.globalAlpha = enter;
  const s = Math.min(size, size * (0.85 + 0.15 * enter));
  if (isWinner) { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = size * 0.35; drawLogo(ctx, logo, cx, cy, s); ctx.restore(); }
  drawLogo(ctx, logo, cx, cy, s);
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = `700 ${size * 0.17}px "Space Grotesk", system-ui, sans-serif`;
  ctx.fillText(name.length > 18 ? name.slice(0, 17) + "…" : name, cx, cy + size * 0.68);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, W: number, H: number, st: SceneTiming, local: number, speaker: "a" | "b", S: number, portrait: boolean) {
  const rel = local - LEAD;
  const words = st.words;
  if (!words.length) return;
  const y = H * (portrait ? 0.88 : 0.9);
  ctx.textAlign = "center";
  ctx.font = `700 ${S * 0.036}px "Space Grotesk", system-ui, sans-serif`;
  // speaker label
  const who = speaker === "a" ? "ISAAC" : "SARAH";
  const wc = speaker === "a" ? ACCENT : BLUE;
  ctx.fillStyle = wc;
  ctx.font = `700 ${S * 0.024}px "Space Grotesk", system-ui, sans-serif`;
  ctx.fillText(who, W / 2, y - S * 0.06);
  // words with karaoke highlight
  ctx.font = `700 ${S * 0.036}px "Space Grotesk", system-ui, sans-serif`;
  const text = words.map((w) => w.text).join(" ");
  const maxW = W * 0.88;
  const lines = wrapWords(ctx, words, maxW);
  const lineH = S * 0.05;
  let ly = y - ((lines.length - 1) * lineH) / 2;
  for (const line of lines) {
    let lw = 0;
    for (const w of line) lw += ctx.measureText(w.text + " ").width;
    let x = W / 2 - lw / 2;
    for (const w of line) {
      const on = rel >= w.start - 0.05;
      ctx.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.4)";
      ctx.textAlign = "left";
      ctx.fillText(w.text, x, ly);
      x += ctx.measureText(w.text + " ").width;
    }
    ly += lineH;
  }
  void text;
}

function wrapWords(ctx: CanvasRenderingContext2D, words: Word[], maxW: number): Word[][] {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  let w = 0;
  for (const word of words) {
    const ww = ctx.measureText(word.text + " ").width;
    if (w + ww > maxW && cur.length) { lines.push(cur); cur = []; w = 0; }
    cur.push(word);
    w += ww;
  }
  if (cur.length) lines.push(cur);
  return lines.slice(0, 3);
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, lineH: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) { const test = cur ? cur + " " + word : word; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; } else cur = test; }
  if (cur) lines.push(cur);
  let y = cy - ((lines.length - 1) * lineH) / 2;
  for (const l of lines) { ctx.fillText(l, cx, y); y += lineH; }
}

/* ── orchestration: one audio, two encodes ────────────────────────────────── */
export async function renderEdgeVideos(plan: VideoPlan, opts: EdgeRenderOpts = {}): Promise<EdgeRenderResult> {
  const { onProgress, signal } = opts;
  const prog = (p: number, l: string) => onProgress?.(p, l);
  const abort = () => { if (signal?.aborted) throw new DOMException("aborted", "AbortError"); };
  if (!hasWebCodecs()) { const e = new Error("Video creation needs Chrome or Edge on a computer."); e.name = "FriendlyError"; throw e; }

  prog(3, "Loading media…");
  const assets = await loadAssets(plan);
  abort();

  prog(8, "Voicing the hosts…");
  const ACtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new ACtor();
  let bufs: (AudioBuffer | null)[], words: Word[][];
  try {
    ({ bufs, words } = await fetchAudio(plan, ac, (d, n) => prog(8 + Math.round((d / n) * 22), "Voicing the hosts…"), signal));
  } finally { try { await ac.close(); } catch { /* ignore */ } }
  abort();
  const hadVoice = bufs.some(Boolean);
  const timing = buildTiming(plan, bufs, words);

  prog(32, "Mixing audio…");
  const mixed = await mixAudio(plan, bufs, timing);
  abort();

  const bitrate = 9_000_000;
  const encodeOne = async (aspect: ReelAspect, band: [number, number]): Promise<Blob> => {
    const { w: W, h: H } = aspectSize(aspect);
    const res = await encodeCanvasToMp4Web({
      W, H, fps: 30, durationSec: timing.total,
      drawFrame: (ctx, t) => drawFrame(ctx as CanvasRenderingContext2D, W, H, plan, timing, assets, t, true),
      audio: toMp4Audio(mixed),
      onProgress: (p) => prog(Math.round(band[0] + (p / 100) * (band[1] - band[0])), aspect === "9:16" ? "Encoding vertical…" : "Encoding wide…"),
      signal, bitrate,
    });
    return res.blob;
  };
  // SAME mixed audio → two encodes (premium voices used once)
  const portrait = await encodeOne("9:16", [34, 67]);
  abort();
  const landscape = await encodeOne("16:9", [67, 100]);
  prog(100, "Done");
  return { portrait, landscape, hadVoice };
}
