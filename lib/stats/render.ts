"use client";

import { aspectSize, type ReelAspect } from "@/lib/share/reel";
import type { RenderResult } from "@/lib/share/renderer";
import { createCanvasRecorder } from "@/lib/share/record";
import { flagUrlFromIso2 } from "./flags";
import type { RaceData, RaceEvent } from "./types";

const FONT = '"Baloo 2", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const INK = "#2c2823";
const SEAL = "#8a2433";
const END_HOLD = 3.5; // hold the final standings at the end

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
  for (const e of race.entities) {
    if (e.image) urls.add(e.image);
    if (e.kind !== "country" && e.country) {
      const cf = flagUrlFromIso2(e.country);
      if (cf) urls.add(cf);
    }
  }
  for (const ev of race.events) {
    for (const c of [...(ev.partyCodes || []), ...(ev.vsCodes || [])]) {
      const u = flagUrlFromIso2(c);
      if (u) urls.add(u);
    }
    for (const m of ev.subjectMedia || []) if (m) urls.add(m);
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A granular time counter: "Sep 2020" for normal spans (months glide by), "YYYY" for very long/ancient spans. */
function fmtTime(curT: number, span: number): string {
  const year = Math.floor(curT);
  if (span > 160 || year < 1) return `${Math.max(0, Math.round(curT))}`;
  const month = Math.min(11, Math.max(0, Math.floor((curT - year) * 12)));
  return `${MONTHS[month]} ${year}`;
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

type MediaFit = "cover" | "contain";
/** The on-screen width of a media chip of height h (so callers can lay out around it). */
function mediaBoxW(img: HTMLImageElement | null, h: number, fit: MediaFit): number {
  if (fit === "cover") return h * 1.25; // photos → a slightly-landscape headshot chip
  const ar = img && img.width && img.height ? img.width / img.height : 1.5;
  return h * Math.min(2.4, Math.max(0.95, ar)); // flags/logos → chip sized to the artwork
}
/** Draw a media chip (flag / logo / photo) centered at (cx,cy), height h. Returns its width. */
function drawMedia(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, h: number, fit: MediaFit): number {
  const boxW = mediaBoxW(img, h, fit);
  const x = cx - boxW / 2;
  const y = cy - h / 2;
  const r = h * 0.14;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = h * 0.12;
  ctx.shadowOffsetY = h * 0.04;
  roundRect(ctx, x, y, boxW, h, r);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, boxW, h, r);
  ctx.clip();
  if (fit === "cover") {
    const s = Math.max(boxW / img.width, h / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  } else {
    const pad = h * 0.07;
    const s = Math.min((boxW - 2 * pad) / img.width, (h - 2 * pad) / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = Math.max(1, h * 0.03);
  roundRect(ctx, x, y, boxW, h, r);
  ctx.stroke();
  return boxW;
}

type MediaItem = { url: string; fit: MediaFit };
function rowWidth(items: MediaItem[], h: number, gap: number): number {
  let w = 0;
  items.forEach((it, i) => {
    w += mediaBoxW(getImg(it.url), h, it.fit) + (i ? gap : 0);
  });
  return w;
}
function drawMediaRowAt(ctx: CanvasRenderingContext2D, items: MediaItem[], startX: number, cy: number, h: number, gap: number) {
  let x = startX;
  for (const it of items) {
    const img = getImg(it.url);
    const bw = mediaBoxW(img, h, it.fit);
    if (img) drawMedia(ctx, img, x + bw / 2, cy, h, it.fit);
    x += bw + gap;
  }
}

/** A small ROUND media chip (a country flag beside a logo/photo) — compact, saves space. */
function drawCircleMedia(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, d: number) {
  const r = d / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = d * 0.1;
  ctx.shadowOffsetY = d * 0.03;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const s = Math.max(d / img.width, d / img.height); // cover
  ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = Math.max(1, d * 0.045);
  ctx.stroke();
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

  // Big time counter — glides month-by-month ("Sep 2020"), or year for long/ancient spans.
  const span = race.frames.length ? race.frames[race.frames.length - 1].time - race.frames[0].time : 0;
  const timeStr = fmtTime(curT, span);
  ctx.textAlign = vertical ? "left" : "center";
  ctx.textBaseline = "alphabetic";
  const yearPx = vertical ? h * 0.4 : min * 0.32;
  // Size to a CONSTANT-width sample (not the changing string) so the font never
  // resizes frame-to-frame — the counter stays rock-steady, no "bounce".
  const sample = span > 160 ? "8888" : "Sep 8888";
  const fitPx = fitText(ctx, sample, yearPx, 800, vertical ? w * 0.36 : w * 0.94);
  setFont(ctx, fitPx, 800);
  ctx.fillStyle = "rgba(74,69,62,0.9)";
  const yearY = vertical ? y + h * 0.46 : y + fitPx * 0.95;
  ctx.fillText(timeStr, vertical ? x + w * 0.02 : cx, yearY);

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
    // media row (photos / logos / flags), centered along the bottom
    const fh = h * 0.18;
    drawEventMedia(ctx, ev, race, cx, y + h * 0.89, w * 0.96, fh);
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
    const fh = min * 0.16;
    drawEventMedia(ctx, ev, race, cx, y + h * 0.87, w * 0.96, fh);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

/** Draw an event's media — subject photos/logos when present, else country flags ("vs" for conflicts). */
function drawEventMedia(ctx: CanvasRenderingContext2D, ev: RaceEvent, race: RaceData, cx: number, cy: number, maxW: number, fhIn: number) {
  let fh = fhIn;
  const gap = fh * 0.25;

  // Subject media (people/companies) — the most relevant pictures for the beat.
  const subj = (ev.subjectMedia || []).filter(Boolean).slice(0, 5);
  if (subj.length) {
    const fit: MediaFit = race.entities.some((e) => e.kind === "person") ? "cover" : "contain";
    const items: MediaItem[] = subj.map((url) => ({ url, fit }));
    for (let i = 0; i < 8; i++) {
      if (rowWidth(items, fh, gap) <= maxW || fh < fhIn * 0.4) break;
      fh *= 0.9;
    }
    const total = rowWidth(items, fh, gap);
    drawMediaRowAt(ctx, items, cx - total / 2, cy, fh, gap);
    return;
  }

  // Country flags fallback (with optional "vs" for conflicts).
  const party: MediaItem[] = (ev.partyCodes || []).slice(0, 6).map((c) => ({ url: flagUrlFromIso2(c) || "", fit: "contain" as MediaFit })).filter((it) => it.url);
  const vs: MediaItem[] = (ev.vsCodes || []).slice(0, 6).map((c) => ({ url: flagUrlFromIso2(c) || "", fit: "contain" as MediaFit })).filter((it) => it.url);
  if (!party.length && !vs.length) return;
  const vsGap = fh * 0.7;
  for (let i = 0; i < 8; i++) {
    const w = rowWidth(party, fh, gap) + rowWidth(vs, fh, gap) + (vs.length ? vsGap * 2 + fh * 0.9 : 0);
    if (w <= maxW || fh < fhIn * 0.4) break;
    fh *= 0.9;
  }
  const wParty = rowWidth(party, fh, gap);
  const wVs = rowWidth(vs, fh, gap);
  const vsTextW = vs.length ? vsGap * 2 + fh * 0.9 : 0;
  let x = cx - (wParty + vsTextW + wVs) / 2;
  drawMediaRowAt(ctx, party, x, cy, fh, gap);
  x += wParty;
  if (vs.length) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setFont(ctx, fh * 0.62, 800);
    ctx.fillStyle = "rgba(44,40,35,0.7)";
    ctx.fillText("vs", x + vsTextW / 2, cy);
    ctx.textBaseline = "alphabetic";
    x += vsTextW;
    drawMediaRowAt(ctx, vs, x, cy, fh, gap);
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
  const kRank = state.init ? 1 - Math.exp(-dt * 8) : 1; // snappy settle so bars sit at clean rows (overall pace is set by durationSec)
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
  const barsRight = vertical ? W - padX : W * 0.66; // give the bars more room to stretch
  const panelX = vertical ? padX : W * 0.675;
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
  const barH = rowH * 0.9; // thick bars with a minimal gap (matches the reference look)
  const X0 = padX;
  const flagH = barH * 0.82;
  const innerPad = barH * 0.2;
  // Adaptive value column: wide enough for the largest FULL figure (+ a country flag),
  // so full unrounded values like "$3,300,000,000,000" always fit.
  let globalMax = 1;
  for (const f of race.frames) for (const nm in f.values) if (f.values[nm] > globalMax) globalMax = f.values[nm];
  const valuePx = barH * 0.42; // compact value text so the bars can stretch as far as possible
  const cFlagD = barH * 0.64; // small ROUND country-flag diameter
  setFont(ctx, valuePx, 800);
  const hasCFlag = race.entities.some((e) => e.kind !== "country" && e.country);
  const valueReserve = Math.min(
    (vertical ? W : barsRight) * 0.34, // cap kept low so the leader bar isn't held back
    ctx.measureText(fmtValue(globalMax, race)).width + (hasCFlag ? cFlagD + innerPad : 0) + innerPad * 2.2
  );
  const maxBarW = Math.max(barH * 2, barsRight - X0 - valueReserve);
  const minBarW = flagH * 1.55 + maxBarW * 0.08; // keep the lowest bars long enough to read

  for (const r of ranked) {
    if (r.v <= 1e-6) continue; // an entity not present this year (retired / not yet existed) — no "0" bar
    const dispR = state.disp.get(r.e.name)!;
    if (dispR > race.topN - 0.25) continue;
    const alpha = clamp01(race.topN - dispR);
    const yMid = barsTop + dispR * rowH + rowH / 2;
    const w = Math.max(minBarW, (r.v / maxV) * maxBarW);
    ctx.globalAlpha = alpha;

    // flat solid bar (data-viz look — no gradient/heavy shadow)
    ctx.fillStyle = r.e.color;
    roundRect(ctx, X0, yMid - barH / 2, w, barH, barH * 0.08);
    ctx.fill();

    // bar-end media: flag (country), logo (company), or photo (person)
    const fit: MediaFit = r.e.kind === "person" ? "cover" : "contain";
    const flagImg = getImg(r.e.image);
    const flagW = flagImg ? mediaBoxW(flagImg, flagH, fit) : 0;
    // name: inside the bar (right-aligned, before the media) if it fits, else outside
    const innerAvail = w - flagW - innerPad * 2.4;
    setFont(ctx, barH * 0.5, 800);
    const nameW = ctx.measureText(r.e.name).width;
    const flagCx = X0 + w - innerPad - flagW / 2;
    ctx.textBaseline = "middle";
    if (flagImg) drawMedia(ctx, flagImg, flagCx, yMid, flagH, fit);

    let afterX: number; // where content after the bar (country flag + value) starts
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
      afterX = X0 + w + innerPad * 1.2;
    } else {
      // outside, in ink (short bar)
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      setFont(ctx, barH * 0.48, 800);
      const nx = X0 + w + innerPad * 1.2;
      ctx.fillText(r.e.name, nx, yMid);
      setFont(ctx, barH * 0.5, 800);
      afterX = nx + ctx.measureText(r.e.name).width + innerPad * 0.9;
    }

    // country-of-origin flag — a small ROUND flag beside a company's logo / a person's photo
    if (r.e.kind !== "country" && r.e.country) {
      const cImg = getImg(flagUrlFromIso2(r.e.country));
      if (cImg) {
        drawCircleMedia(ctx, cImg, afterX + cFlagD / 2, yMid, cFlagD);
        afterX += cFlagD + innerPad * 0.7;
      }
    }

    // value (full figure) — fit so it never spills into the story panel
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    const vStr = fmtValue(r.v, race);
    fitText(ctx, vStr, valuePx, 800, (vertical ? W * 0.97 : panelX) - afterX - innerPad);
    ctx.fillText(vStr, afterX, yMid);
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = "alphabetic";

  // ── story panel ──
  drawStoryPanel(ctx, panelX, panelY, panelW, panelH, race, curT, ev, evAlpha, vertical);

  // source (bottom-left)
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (race.source) {
    setFont(ctx, min * 0.026, 700);
    ctx.fillStyle = "rgba(44,40,35,0.45)";
    ctx.fillText(`Source: ${race.source}`, padX, H * 0.975);
  }
  // brand badge (bottom-right) — clearly visible, out of the way of the data
  drawBrandBadge(ctx, W - padX, H * 0.965, min * 0.034);
}

/** A clear "clunoid.com" pill badge, right edge anchored at (rx, cy). */
function drawBrandBadge(ctx: CanvasRenderingContext2D, rx: number, cy: number, px: number) {
  setFont(ctx, px, 800);
  const text = "clunoid.com";
  const tw = ctx.measureText(text).width;
  const padH = px * 0.55;
  const padV = px * 0.42;
  const bw = tw + padH * 2;
  const bh = px + padV * 2;
  const x = rx - bw;
  const y = cy - bh / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = px * 0.3;
  ctx.shadowOffsetY = px * 0.08;
  roundRect(ctx, x, y, bw, bh, bh / 2);
  ctx.fillStyle = SEAL;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padH, cy + px * 0.04);
  ctx.textBaseline = "alphabetic";
}

/* ── Isaac's closing screen — brief & clean: "Made on clunoid.com" ─────────────
 * The voice-over is a single PRE-RECORDED clip (public/stat-outro.mp3, Isaac
 * saying "Made on clunoid dot com. Make your own.") reused for every outro, so
 * we never call TTS per video. Re-record with scripts/genoutro.mjs if the line
 * changes. */
function drawStatOutro(ctx: CanvasRenderingContext2D, W: number, H: number, p: number) {
  drawCertificateBg(ctx, W, H);
  ctx.globalAlpha = clamp01(p * 3);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Hero "clunoid.com" centered. The eyebrow + subline are anchored to the
  // hero's baseline by heroPx (NOT fixed H-fractions), so the phrase keeps its
  // spacing in BOTH portrait (9:16) and landscape (16:9) — where H, but not
  // min, shrinks. fitText also caps the glyph to the canvas width.
  const heroPx = fitText(ctx, "clunoid.com", Math.min(W, H) * 0.165, 800, W * 0.9);
  const cy = H * 0.5;
  const small = heroPx * 0.3;

  // "Made on" eyebrow — just above the hero's cap so they read as one phrase.
  setFont(ctx, small, 700);
  ctx.fillStyle = "rgba(44,40,35,0.58)";
  ctx.fillText("Made on", W / 2, cy - heroPx * 0.92);

  const sc = 0.88 + 0.12 * clamp01(p * 3);
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.scale(sc, sc);
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = heroPx * 0.06;
  ctx.shadowOffsetY = heroPx * 0.04;
  ctx.fillStyle = SEAL;
  setFont(ctx, heroPx, 800);
  ctx.fillText("clunoid.com", 0, 0);
  ctx.restore();

  // "Make your own stat battle" subline — fit to width so it never overruns.
  const subPx = fitText(ctx, "Make your own stat battle", small, 700, W * 0.9);
  setFont(ctx, subPx, 700);
  ctx.fillStyle = "rgba(44,40,35,0.72)";
  ctx.fillText("Make your own stat battle", W / 2, cy + heroPx * 0.9);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

/* ── render the race into a downloadable/shareable video (SILENT race; Isaac's
 *    voiced clunoid.com call-to-action plays only over the outro) ─────────────── */
export async function renderRaceVideo(
  race: RaceData,
  aspect: ReelAspect,
  opts: { host?: HTMLElement | null; onProgress?: (p: number, l: string) => void; signal?: AbortSignal }
): Promise<RenderResult> {
  const { w: W, h: H } = aspectSize(aspect);
  const rec = createCanvasRecorder(W, H, 30, opts.host);
  const { ctx, ac, dest } = rec;
  opts.onProgress?.(4, "Loading media…");
  // Isaac's outro voice — a single PRE-RECORDED clip reused for every video
  // (no per-render TTS). Loaded up front so we know its exact length.
  let outroBuf: AudioBuffer | null = null;
  try {
    const [, , resp] = await Promise.all([
      document.fonts.load('800 120px "Baloo 2"'),
      preloadRaceImages(race),
      fetch("/stat-outro.mp3").catch(() => null),
    ]);
    if (resp?.ok) {
      outroBuf = await ac.decodeAudioData(await resp.arrayBuffer());
    }
  } catch {
    /* fonts / images / voice all optional */
  }
  const state = newRaceState();
  drawRaceFrame(ctx, W, H, race, state, 0);

  try {
    await ac.resume();
  } catch {
    /* ignore */
  }
  const raceEnd = race.durationSec + END_HOLD;
  const outroDur = outroBuf ? outroBuf.duration + 1.0 : 3.5;
  const total = raceEnd + outroDur;
  const t0 = ac.currentTime + 0.1;

  // The race itself is SILENT; Isaac speaks only over the outro.
  if (outroBuf) {
    const src = ac.createBufferSource();
    src.buffer = outroBuf;
    src.connect(dest);
    try {
      src.connect(ac.destination);
    } catch {
      /* ignore */
    }
    src.start(t0 + raceEnd + 0.3);
  }

  rec.start();
  opts.onProgress?.(6, "Recording…");
  await new Promise<void>((resolve, reject) => {
    const frame = () => {
      if (opts.signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      const el = Math.max(0, ac.currentTime - t0);
      try {
        if (el < raceEnd) drawRaceFrame(ctx, W, H, race, state, Math.min(el, race.durationSec));
        else drawStatOutro(ctx, W, H, (el - raceEnd) / outroDur);
      } catch (e) {
        reject(e as Error);
        return;
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
  return { blob, ext, mime, hadVoice: !!outroBuf };
}
