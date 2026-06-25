"use client";

import { aspectSize, type ReelAspect } from "@/lib/share/reel";
import type { RenderResult } from "@/lib/share/renderer";
import { createCanvasRecorder } from "@/lib/share/record";
import type { RaceData } from "./types";

const FONT = '"Baloo 2", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const INK = "#2c2823";
const SEAL = "#8a2433";
const END_HOLD = 2.2; // hold the final standings at the end

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/* ── per-frame smoothing state (shared by live preview + export) ──────────── */
export type RaceState = { disp: Map<string, number>; max: number; init: boolean; lastEl: number; leader: string };
export function newRaceState(): RaceState {
  return { disp: new Map(), max: 0, init: false, lastEl: 0, leader: "" };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function setFont(ctx: CanvasRenderingContext2D, px: number, weight = 800) {
  ctx.font = `${weight} ${Math.round(px)}px ${FONT}`;
}
function fitText(ctx: CanvasRenderingContext2D, s: string, px: number, weight: number, maxW: number) {
  let p = px;
  setFont(ctx, p, weight);
  while (ctx.measureText(s).width > maxW && p > 9) {
    p -= Math.max(1, p * 0.06);
    setFont(ctx, p, weight);
  }
  return p;
}

export function fmtValue(v: number, race: RaceData): string {
  const n = Math.max(0, v);
  const num = n >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (race.unitPrefix || "") + num + (race.unitSuffix || "");
}

/** Interpolated value for every entity at continuous time t (handles enter/leave). */
function valuesAt(race: RaceData, t: number): Map<string, number> {
  const f = race.frames;
  const out = new Map<string, number>();
  if (f.length === 0) return out;
  if (t <= f[0].time) {
    for (const e of race.entities) out.set(e.name, f[0].values[e.name] ?? 0);
    return out;
  }
  if (t >= f[f.length - 1].time) {
    const last = f[f.length - 1];
    for (const e of race.entities) out.set(e.name, last.values[e.name] ?? 0);
    return out;
  }
  let i = 0;
  while (i < f.length - 1 && !(f[i].time <= t && t < f[i + 1].time)) i++;
  const a = f[i];
  const b = f[i + 1];
  const frac = (t - a.time) / Math.max(1e-9, b.time - a.time);
  for (const e of race.entities) {
    const va = a.values[e.name];
    const vb = b.values[e.name];
    let v: number;
    if (va != null && vb != null) v = va + (vb - va) * frac;
    else if (vb != null) v = vb * frac; // entering — grows from 0
    else if (va != null) v = va * (1 - frac); // leaving — shrinks to 0
    else v = 0;
    out.set(e.name, v);
  }
  return out;
}

/* ── high-quality grey "certificate" background (matches DocumentBackground) ─ */
function drawCertificateBg(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = "#c8c5bd";
  ctx.fillRect(0, 0, W, H);
  // guilloché weave: thin diagonal lines in both directions
  ctx.save();
  ctx.strokeStyle = "rgba(46,38,28,0.05)";
  ctx.lineWidth = 1;
  const step = Math.max(7, W * 0.009);
  ctx.beginPath();
  for (let x = -H; x < W; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
  }
  for (let x = 0; x < W + H; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x - H, H);
  }
  ctx.stroke();
  ctx.restore();
  // centre highlight + edge vignette
  const g = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, "rgba(255,255,255,0.5)");
  g.addColorStop(0.42, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(46,36,24,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // double-ruled border
  const m = Math.round(W * 0.025);
  ctx.strokeStyle = "rgba(46,38,28,0.32)";
  ctx.lineWidth = Math.max(2, W * 0.0035);
  roundRect(ctx, m, m, W - 2 * m, H - 2 * m, W * 0.018);
  ctx.stroke();
  ctx.strokeStyle = "rgba(46,38,28,0.18)";
  ctx.lineWidth = Math.max(1, W * 0.0016);
  roundRect(ctx, m + W * 0.012, m + W * 0.012, W - 2 * m - W * 0.024, H - 2 * m - W * 0.024, W * 0.014);
  ctx.stroke();
}

/* ── draw one race frame at elapsed time el (0..durationSec) ───────────────── */
export function drawRaceFrame(ctx: CanvasRenderingContext2D, W: number, H: number, race: RaceData, state: RaceState, el: number) {
  const min = Math.min(W, H);
  const t0 = race.frames[0].time;
  const t1 = race.frames[race.frames.length - 1].time;
  const prog = clamp01(race.durationSec > 0 ? el / race.durationSec : 1);
  const curT = t0 + (t1 - t0) * prog;
  const vals = valuesAt(race, curT);

  const ranked = race.entities.map((e) => ({ e, v: vals.get(e.name) || 0 })).sort((a, b) => b.v - a.v);
  const dt = state.init ? Math.max(0, Math.min(0.1, el - state.lastEl)) : 0;
  state.lastEl = el;
  const kRank = state.init ? 1 - Math.exp(-dt * 8) : 1;
  const kMax = state.init ? 1 - Math.exp(-dt * 5) : 1;
  const targetMax = Math.max(1e-6, ranked.length ? ranked[0].v : 1);
  state.max = state.init ? state.max + (targetMax - state.max) * kMax : targetMax;
  const maxV = Math.max(1e-6, state.max);
  ranked.forEach((r, idx) => {
    const cur = state.disp.has(r.e.name) ? state.disp.get(r.e.name)! : idx;
    state.disp.set(r.e.name, cur + (idx - cur) * kRank);
  });
  state.init = true;
  state.leader = ranked.length ? ranked[0].e.name : "";

  // background
  drawCertificateBg(ctx, W, H);

  // title + subtitle (top-left)
  const padX = W * 0.05;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const tp = fitText(ctx, race.title, min * 0.05, 800, W - 2 * padX - min * 0.18);
  ctx.fillStyle = INK;
  ctx.fillText(race.title, padX, H * 0.09);
  if (race.subtitle) {
    setFont(ctx, min * 0.026, 700);
    ctx.fillStyle = SEAL;
    ctx.fillText(race.subtitle, padX, H * 0.09 + tp * 0.75);
  }
  if (race.valueLabel) {
    setFont(ctx, min * 0.022, 700);
    ctx.fillStyle = "rgba(44,40,35,0.55)";
    ctx.textAlign = "right";
    ctx.fillText(race.valueLabel, W - padX, H * 0.09);
    ctx.textAlign = "left";
  }

  // bars region
  const yTop = H * 0.17;
  const yBottom = H * 0.82;
  const rowH = (yBottom - yTop) / race.topN;
  const barH = rowH * 0.66;
  const labelRight = padX + W * (W > H ? 0.16 : 0.2); // end of the name column
  const barX = labelRight + W * 0.012;
  const maxBarW = W * 0.84 - barX; // leaves room for the value text on the right

  for (const r of ranked) {
    const dispR = state.disp.get(r.e.name)!;
    if (dispR > race.topN - 0.25) continue; // only the visible top-N (plus the one leaving)
    const alpha = clamp01(race.topN - dispR);
    const yMid = yTop + dispR * rowH + rowH / 2;
    const w = Math.max(barH, (r.v / maxV) * maxBarW);
    ctx.globalAlpha = alpha;

    // bar with a subtle top highlight + shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = barH * 0.18;
    ctx.shadowOffsetY = barH * 0.06;
    ctx.fillStyle = r.e.color;
    roundRect(ctx, barX, yMid - barH / 2, w, barH, barH * 0.22);
    ctx.fill();
    ctx.restore();
    const hl = ctx.createLinearGradient(0, yMid - barH / 2, 0, yMid + barH / 2);
    hl.addColorStop(0, "rgba(255,255,255,0.28)");
    hl.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = hl;
    roundRect(ctx, barX, yMid - barH / 2, w, barH, barH * 0.22);
    ctx.fill();

    // entity name (right-aligned in the label column)
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const np = fitText(ctx, r.e.name, barH * 0.46, 800, labelRight - padX);
    ctx.fillStyle = INK;
    ctx.fillText(r.e.name, labelRight, yMid);

    // value (just after the bar)
    setFont(ctx, barH * 0.5, 800);
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.fillText(fmtValue(r.v, race), barX + w + W * 0.012, yMid);
    void np;
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = "alphabetic";

  // big time counter (bottom-right, signature stat-battle element)
  const timeText = `${Math.round(curT)}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(44,40,35,0.16)";
  setFont(ctx, min * 0.17, 800);
  ctx.fillText(timeText, W - padX, H * 0.9);
  if (race.timeLabel) {
    setFont(ctx, min * 0.03, 700);
    ctx.fillStyle = "rgba(44,40,35,0.4)";
    ctx.fillText(race.timeLabel, W - padX, H * 0.9 - min * 0.16);
  }

  // brand
  ctx.textAlign = "center";
  setFont(ctx, min * 0.03, 800);
  ctx.fillStyle = "rgba(44,40,35,0.5)";
  ctx.fillText("clunoid.com", W / 2, H * 0.965);
  ctx.textAlign = "left";
}

/* ── SFX (subtle, into the recording's audio node) ────────────────────────── */
function tone(ac: AudioContext, target: AudioNode, freq: number, dur: number, type: OscillatorType, vol: number, at: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(target);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}
function sfxWhoosh(ac: AudioContext, dest: AudioNode, at: number) {
  tone(ac, dest, 680, 0.12, "triangle", 0.06, at);
  tone(ac, dest, 430, 0.16, "triangle", 0.05, at + 0.05);
}
function scheduleBed(ac: AudioContext, dest: AudioNode, t0: number, total: number) {
  for (let at = 0; at < total; at += 2) tone(ac, dest, (at % 4 < 2 ? 110 : 98), 1.7, "sine", 0.022, t0 + at);
}

/* ── render the race into a downloadable/shareable video ──────────────────── */
export async function renderRaceVideo(
  race: RaceData,
  aspect: ReelAspect,
  opts: { host?: HTMLElement | null; onProgress?: (p: number, l: string) => void; signal?: AbortSignal }
): Promise<RenderResult> {
  const { w: W, h: H } = aspectSize(aspect);
  const rec = createCanvasRecorder(W, H, 30, opts.host);
  const { ctx, ac, dest } = rec;
  try {
    await Promise.all([document.fonts.load('800 120px "Baloo 2"'), document.fonts.load('700 120px "Baloo 2"')]);
  } catch {
    /* fonts optional */
  }
  // draw first frame immediately
  const state = newRaceState();
  drawRaceFrame(ctx, W, H, race, state, 0);

  try {
    await ac.resume();
  } catch {
    /* ignore */
  }
  const total = race.durationSec + END_HOLD;
  const t0 = ac.currentTime + 0.1;
  scheduleBed(ac, dest, t0, total);

  rec.start();
  opts.onProgress?.(5, "Recording…");
  let lastLeader = "";
  let lastWhoosh = 0;
  await new Promise<void>((resolve, reject) => {
    const frame = () => {
      if (opts.signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      const el = Math.max(0, ac.currentTime - t0);
      try {
        drawRaceFrame(ctx, W, H, race, state, Math.min(el, race.durationSec));
      } catch (e) {
        reject(e as Error);
        return;
      }
      if (state.leader && state.leader !== lastLeader && el > 0.4) {
        if (ac.currentTime - lastWhoosh > 0.4) {
          sfxWhoosh(ac, dest, ac.currentTime + 0.01);
          lastWhoosh = ac.currentTime;
        }
        lastLeader = state.leader;
      }
      opts.onProgress?.(Math.min(99, Math.round((el / total) * 100)), "Recording…");
      if (el >= total) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }).catch(async (e) => {
    await rec.stop().catch(() => {});
    throw e;
  });

  const { blob, ext, mime } = await rec.stop();
  opts.onProgress?.(100, "Done");
  return { blob, ext, mime, hadVoice: false };
}
