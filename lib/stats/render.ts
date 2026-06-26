"use client";

import { aspectSize, type ReelAspect } from "@/lib/share/reel";
import type { RenderResult } from "@/lib/share/renderer";
import { createCanvasRecorder } from "@/lib/share/record";
import { flagUrlFromIso2 } from "./flags";
import type { RaceData, RaceEvent } from "./types";

const FONT = '"Baloo 2", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const INK = "#2c2823";
const SEAL = "#8a2433";
const END_HOLD = 2.6; // hold the final standings at the end

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/* ── image cache (flags on bar ends + event media) ────────────────────────── */
const imgCache = new Map<string, HTMLImageElement | null>();

function startLoad(url: string): void {
  if (imgCache.has(url)) return;
  imgCache.set(url, null);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => imgCache.set(url, img);
  img.onerror = () => {
    if (!img.dataset.fb && url.includes("/w320/")) {
      img.dataset.fb = "1";
      img.src = url.replace("/w320/", "/w640/");
      return;
    }
    imgCache.set(url, null);
  };
  img.src = url;
}
/** Synchronous accessor for the draw loop — triggers a load, returns it once ready. */
function getImg(url?: string | null): HTMLImageElement | null {
  if (!url) return null;
  if (!imgCache.has(url)) startLoad(url);
  return imgCache.get(url) || null;
}
/** Preload every image a race needs (bar flags + event flags) before exporting. */
export async function preloadRaceImages(race: RaceData): Promise<void> {
  const urls = new Set<string>();
  for (const e of race.entities) if (e.image) urls.add(e.image);
  for (const ev of race.events) for (const c of [...(ev.partyCodes || []), ...(ev.vsCodes || [])]) {
    const u = flagUrlFromIso2(c);
    if (u) urls.add(u);
  }
  await Promise.all(
    [...urls].map(
      (url) =>
        new Promise<void>((resolve) => {
          const cached = imgCache.get(url);
          if (cached !== undefined && cached !== null) return resolve();
          const img = new Image();
          img.crossOrigin = "anonymous";
          const done = () => resolve();
          img.onload = () => {
            imgCache.set(url, img);
            done();
          };
          img.onerror = () => {
            if (!img.dataset.fb && url.includes("/w320/")) {
              img.dataset.fb = "1";
              img.src = url.replace("/w320/", "/w640/");
              return;
            }
            imgCache.set(url, null);
            done();
          };
          img.src = url;
        })
    )
  );
}

/* ── small canvas helpers ─────────────────────────────────────────────────── */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
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
  while (ctx.measureText(s).width > maxW && p > 8) {
    p -= Math.max(1, p * 0.06);
    setFont(ctx, p, weight);
  }
  return p;
}
function wrapLines(ctx: CanvasRenderingContext2D, s: string, px: number, weight: number, maxW: number, maxLines: number): string[] {
  setFont(ctx, px, weight);
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // ellipsize the last line if content was cut
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxW && last.length > 1) last = last.slice(0, -1);
    if (last !== lines[maxLines - 1]) lines[maxLines - 1] = last.replace(/\s+\S*$/, "") + "…";
  }
  return lines;
}

export function fmtValue(v: number, race: RaceData): string {
  const d = race.decimals ?? 1;
  const num = Math.max(0, v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  return (race.unitPrefix || "") + num + (race.unitSuffix || "");
}

/* ── per-frame smoothing state (shared by live preview + export) ──────────── */
export type RaceState = { disp: Map<string, number>; max: number; init: boolean; lastEl: number; leader: string; evIdx: number; evChange: number };
export function newRaceState(): RaceState {
  return { disp: new Map(), max: 0, init: false, lastEl: 0, leader: "", evIdx: -1, evChange: 0 };
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
  ctx.save();
  ctx.strokeStyle = "rgba(46,38,28,0.045)";
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
  const g = ctx.createRadialGradient(W / 2, H * 0.34, 0, W / 2, H * 0.34, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, "rgba(255,255,255,0.52)");
  g.addColorStop(0.42, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(46,36,24,0.2)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const m = Math.round(W * 0.02);
  ctx.strokeStyle = "rgba(46,38,28,0.3)";
  ctx.lineWidth = Math.max(2, W * 0.0032);
  roundRect(ctx, m, m, W - 2 * m, H - 2 * m, W * 0.014);
  ctx.stroke();
  ctx.strokeStyle = "rgba(46,38,28,0.16)";
  ctx.lineWidth = Math.max(1, W * 0.0014);
  roundRect(ctx, m + W * 0.01, m + W * 0.01, W - 2 * m - W * 0.02, H - 2 * m - W * 0.02, W * 0.011);
  ctx.stroke();
}

/** Draw a flag image keeping aspect ratio, centered at (cx,cy) with height h. */
function drawFlag(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, h: number) {
  const ar = img.width && img.height ? img.width / img.height : 1.5;
  const fw = h * ar;
  const x = cx - fw / 2;
  const y = cy - h / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = h * 0.12;
  ctx.shadowOffsetY = h * 0.04;
  roundRect(ctx, x, y, fw, h, h * 0.12);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, fw, h, h * 0.12);
  ctx.clip();
  ctx.drawImage(img, x, y, fw, h);
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = Math.max(1, h * 0.035);
  roundRect(ctx, x, y, fw, h, h * 0.12);
  ctx.stroke();
}

/** A centered row of flags for an event side (returns its total width). */
function flagRowWidth(codes: string[], fh: number, gap: number): number {
  return codes.length ? codes.length * (fh * 1.5) + (codes.length - 1) * gap : 0;
}
function drawFlagRow(ctx: CanvasRenderingContext2D, codes: string[], startX: number, cy: number, fh: number, gap: number) {
  let x = startX;
  for (const c of codes) {
    const img = getImg(flagUrlFromIso2(c));
    const fw = fh * 1.5;
    if (img) drawFlag(ctx, img, x + fw / 2, cy, fh);
    x += fw + gap;
  }
}

/** Pick the event that is "current" at time t (last one whose time ≤ t). */
function activeEvent(race: RaceData, t: number): { ev: RaceEvent | null; idx: number } {
  let idx = -1;
  for (let i = 0; i < race.events.length; i++) if (race.events[i].time <= t + 1e-6) idx = i;
  if (idx < 0 && race.events.length) idx = 0;
  return { ev: idx >= 0 ? race.events[idx] : null, idx };
}

/* ── the story panel: big year + event title + description + flag media ────── */
function drawStoryPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  race: RaceData,
  curT: number,
  ev: RaceEvent | null,
  evAlpha: number,
  vertical: boolean
) {
  const cx = x + w / 2;
  const min = Math.min(w, h);

  // Big year
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const yearPx = vertical ? h * 0.42 : min * 0.34;
  setFont(ctx, yearPx, 800);
  ctx.fillStyle = "rgba(74,69,62,0.9)";
  const yearY = vertical ? y + h * 0.46 : y + yearPx * 0.95;
  ctx.fillText(`${Math.round(curT)}`, vertical ? x + w * 0.22 : cx, yearY);
  if (race.timeLabel && !vertical) {
    setFont(ctx, min * 0.05, 700);
    ctx.fillStyle = "rgba(74,69,62,0.55)";
    ctx.fillText(race.timeLabel, cx, y + yearPx * 0.95 - yearPx * 0.92);
  }

  if (!ev) return;
  ctx.globalAlpha = evAlpha;

  if (vertical) {
    // Year sits left; title + description fill the rest of the top of the panel.
    const tx = x + w * 0.42;
    const tw = x + w - tx - w * 0.02;
    ctx.textAlign = "left";
    const titleLines = wrapLines(ctx, ev.title, h * 0.13, 800, tw, 2);
    let ty = y + h * 0.16;
    ctx.fillStyle = INK;
    for (const ln of titleLines) {
      setFont(ctx, h * 0.13, 800);
      ctx.fillText(ln, tx, ty);
      ty += h * 0.14;
    }
    // description spans full width below
    const descLines = wrapLines(ctx, ev.description, h * 0.092, 600, w * 0.96, 3);
    let dy = y + h * 0.58;
    ctx.fillStyle = "rgba(44,40,35,0.82)";
    for (const ln of descLines) {
      setFont(ctx, h * 0.092, 600);
      ctx.fillText(ln, x + w * 0.02, dy);
      dy += h * 0.11;
    }
    // media flags row, centered along the bottom
    const fh = h * 0.16;
    drawEventMedia(ctx, ev, cx, y + h * 0.9, w * 0.96, fh);
  } else {
    ctx.textAlign = "center";
    const titleLines = wrapLines(ctx, ev.title, min * 0.085, 800, w * 0.96, 3);
    let ty = y + h * 0.4;
    ctx.fillStyle = INK;
    for (const ln of titleLines) {
      setFont(ctx, min * 0.085, 800);
      ctx.fillText(ln, cx, ty);
      ty += min * 0.092;
    }
    ty += min * 0.02;
    const descLines = wrapLines(ctx, ev.description, min * 0.058, 600, w * 0.96, 5);
    ctx.fillStyle = "rgba(44,40,35,0.82)";
    for (const ln of descLines) {
      setFont(ctx, min * 0.058, 600);
      ctx.fillText(ln, cx, ty);
      ty += min * 0.072;
    }
    const fh = min * 0.14;
    drawEventMedia(ctx, ev, cx, y + h * 0.88, w * 0.96, fh);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

/** Draw an event's flags — party group, optionally "vs" the opposing group, centered. */
function drawEventMedia(ctx: CanvasRenderingContext2D, ev: RaceEvent, cx: number, cy: number, maxW: number, fhIn: number) {
  const party = (ev.partyCodes || []).slice(0, 6);
  const vs = (ev.vsCodes || []).slice(0, 6);
  if (!party.length && !vs.length) return;
  let fh = fhIn;
  const gap = fh * 0.25;
  const vsGap = fh * 0.7;
  // shrink to fit width
  for (let i = 0; i < 6; i++) {
    const wParty = flagRowWidth(party, fh, gap);
    const wVs = flagRowWidth(vs, fh, gap);
    const vsTextW = vs.length ? vsGap * 2 + fh * 0.9 : 0;
    if (wParty + wVs + vsTextW <= maxW || fh < fhIn * 0.4) break;
    fh *= 0.9;
  }
  const wParty = flagRowWidth(party, fh, gap);
  const wVs = flagRowWidth(vs, fh, gap);
  const vsTextW = vs.length ? vsGap * 2 + fh * 0.9 : 0;
  const total = wParty + vsTextW + wVs;
  let x = cx - total / 2;
  drawFlagRow(ctx, party, x, cy, fh, gap);
  x += wParty;
  if (vs.length) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setFont(ctx, fh * 0.62, 800);
    ctx.fillStyle = "rgba(44,40,35,0.7)";
    ctx.fillText("vs", x + vsTextW / 2, cy);
    ctx.textBaseline = "alphabetic";
    x += vsTextW;
    drawFlagRow(ctx, vs, x, cy, fh, gap);
  }
}

/* ── draw one race frame at elapsed time el (0..durationSec) ───────────────── */
export function drawRaceFrame(ctx: CanvasRenderingContext2D, W: number, H: number, race: RaceData, state: RaceState, el: number) {
  const min = Math.min(W, H);
  const vertical = H > W;
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

  // active event (with a short cross-fade when it changes)
  const { ev, idx: evIdx } = activeEvent(race, curT);
  if (evIdx !== state.evIdx) {
    state.evIdx = evIdx;
    state.evChange = el;
  }
  const evAlpha = clamp01((el - state.evChange) / 0.45);

  drawCertificateBg(ctx, W, H);

  // ── regions: bars on the left/top, story panel on the right/bottom ──
  const padX = W * (vertical ? 0.045 : 0.035);
  const titleY = H * (vertical ? 0.06 : 0.085);
  const barsTop = H * (vertical ? 0.12 : 0.17);
  const barsBottom = H * (vertical ? 0.6 : 0.9);
  const barsRight = vertical ? W - padX : W * 0.62;
  const panelX = vertical ? padX : W * 0.635;
  const panelY = vertical ? H * 0.63 : barsTop;
  const panelW = vertical ? W - 2 * padX : W * 0.965 - panelX;
  const panelH = vertical ? H * 0.32 : barsBottom - barsTop;

  // title + subtitle (top-left)
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const titlePx = fitText(ctx, race.title, min * (vertical ? 0.055 : 0.05), 800, barsRight - padX);
  ctx.fillStyle = INK;
  ctx.fillText(race.title, padX, titleY);
  if (race.subtitle) {
    setFont(ctx, min * (vertical ? 0.03 : 0.026), 700);
    ctx.fillStyle = SEAL;
    ctx.fillText(race.subtitle, padX, titleY + titlePx * 0.72);
  }

  // ── bars ──
  const rowH = (barsBottom - barsTop) / race.topN;
  const barH = rowH * 0.78;
  const X0 = padX;
  const flagH = barH * 0.8;
  const innerPad = barH * 0.22;
  const valueReserve = (vertical ? W : barsRight) * (vertical ? 0.26 : 0.2);
  const maxBarW = Math.max(barH * 2, barsRight - X0 - valueReserve);

  for (const r of ranked) {
    const dispR = state.disp.get(r.e.name)!;
    if (dispR > race.topN - 0.25) continue;
    const alpha = clamp01(race.topN - dispR);
    const yMid = barsTop + dispR * rowH + rowH / 2;
    const w = Math.max(barH * 0.9, (r.v / maxV) * maxBarW);
    ctx.globalAlpha = alpha;

    // flat solid bar (data-viz look — no gradient/heavy shadow)
    ctx.fillStyle = r.e.color;
    roundRect(ctx, X0, yMid - barH / 2, w, barH, barH * 0.08);
    ctx.fill();

    const flagImg = getImg(r.e.image);
    const flagW = flagImg ? flagH * (flagImg.width && flagImg.height ? flagImg.width / flagImg.height : 1.5) : 0;
    // name: inside the bar (right-aligned, before the flag) if it fits, else outside
    const innerAvail = w - flagW - innerPad * 2.4;
    setFont(ctx, barH * 0.5, 800);
    const nameW = ctx.measureText(r.e.name).width;
    const flagCx = X0 + w - innerPad - flagW / 2;
    ctx.textBaseline = "middle";
    if (flagImg) drawFlag(ctx, flagImg, flagCx, yMid, flagH);

    let valueX: number;
    if (nameW <= innerAvail) {
      // inside, white with a soft shadow for legibility on any color
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.32)";
      ctx.shadowBlur = barH * 0.12;
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      setFont(ctx, barH * 0.5, 800);
      ctx.fillText(r.e.name, X0 + w - flagW - innerPad * 1.6, yMid);
      ctx.restore();
      valueX = X0 + w + innerPad * 1.4;
    } else {
      // outside, in ink (short bar)
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      setFont(ctx, barH * 0.48, 800);
      const nx = X0 + w + innerPad * 1.4;
      ctx.fillText(r.e.name, nx, yMid);
      valueX = nx + ctx.measureText(r.e.name).width + innerPad * 1.2;
    }

    // value
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    setFont(ctx, barH * 0.5, 800);
    ctx.fillText(fmtValue(r.v, race), valueX, yMid);
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = "alphabetic";

  // ── story panel ──
  drawStoryPanel(ctx, panelX, panelY, panelW, panelH, race, curT, ev, evAlpha, vertical);

  // source + brand
  ctx.textAlign = "left";
  if (race.source) {
    setFont(ctx, min * 0.026, 700);
    ctx.fillStyle = "rgba(44,40,35,0.45)";
    ctx.fillText(`Source: ${race.source}`, padX, H * 0.975);
  }
  ctx.textAlign = "right";
  setFont(ctx, min * 0.03, 800);
  ctx.fillStyle = "rgba(44,40,35,0.5)";
  ctx.fillText("clunoid.com", W - padX, H * 0.975);
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
  for (let at = 0; at < total; at += 2) tone(ac, dest, at % 4 < 2 ? 110 : 98, 1.7, "sine", 0.022, t0 + at);
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
  opts.onProgress?.(4, "Loading flags…");
  try {
    await Promise.all([document.fonts.load('800 120px "Baloo 2"'), document.fonts.load('700 120px "Baloo 2"'), preloadRaceImages(race)]);
  } catch {
    /* fonts/images optional */
  }
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
  opts.onProgress?.(6, "Recording…");
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
