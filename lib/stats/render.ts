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

/** Compact value for tight labels (the bubble design): abbreviates large raw
 *  magnitudes (1.4B, $888B, $3.3T) but keeps small / already-scaled figures exact
 *  (300 m, 975, $28.8T) so the bars design's full exact values stay untouched. */
export function fmtValueCompact(v: number, race: RaceData): string {
  const n = Math.max(0, v);
  if (n < 1e6) return fmtValue(v, race); // small or already-scaled → keep exact
  const pre = race.unitPrefix || "";
  const suf = race.unitSuffix || "";
  for (const [d, u] of [[1e12, "T"], [1e9, "B"], [1e6, "M"]] as const) {
    if (n >= d) {
      const x = n / d;
      return pre + (x >= 100 ? x.toFixed(0) : x.toFixed(1)) + u + suf;
    }
  }
  return fmtValue(v, race);
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
export type RaceState = { disp: Map<string, number>; max: number; init: boolean; lastEl: number; leader: string; evIdx: number; evChange: number; vis: number; peak: number; bub: Map<string, { x: number; y: number; r?: number }> };
export function newRaceState(): RaceState {
  return { disp: new Map(), max: 0, init: false, lastEl: 0, leader: "", evIdx: -1, evChange: 0, vis: 0, peak: 0, bub: new Map() };
}

/** Interpolated value for every entity at continuous time t (handles enter/leave). */
/**
 * Each entity's value at continuous time t, with a `fade` (1 = solid, 0 = gone).
 * A LEAVING entity (present then omitted by the brain — e.g. someone whose active
 * period ended) HOLDS its last value at a SOLID bar, then DROPS off cleanly at the
 * next keyframe (no fade, no cratering to zero) so the current leaders keep
 * competing. The brain decides who leaves: for "richest each year" it drops people
 * once they're past their peak; for cumulative/all-time records it keeps the
 * holders listed (so they never leave).
 */
type Val = { v: number; fade: number };
function valuesAt(race: RaceData, t: number): Map<string, Val> {
  const f = race.frames;
  const out = new Map<string, Val>();
  if (f.length === 0) return out;
  if (t <= f[0].time) {
    for (const e of race.entities) out.set(e.name, { v: f[0].values[e.name] ?? 0, fade: 1 });
    return out;
  }
  if (t >= f[f.length - 1].time) {
    const last = f[f.length - 1];
    for (const e of race.entities) out.set(e.name, { v: last.values[e.name] ?? 0, fade: 1 });
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
    if (va != null && vb != null) out.set(e.name, { v: va + (vb - va) * frac, fade: 1 });
    else if (vb != null) out.set(e.name, { v: vb * frac, fade: 1 }); // entering — grows from 0
    else if (va != null) out.set(e.name, { v: va, fade: 1 }); // leaving — HOLD the bar solid, then DROP it off cleanly at the next keyframe (no fade, no crater)
    else out.set(e.name, { v: 0, fade: 0 });
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

  const ranked = race.entities.map((e) => ({ e, v: vals.get(e.name)?.v || 0, fade: vals.get(e.name)?.fade ?? 1 })).sort((a, b) => b.v - a.v);
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
  // The MOST bars ever on screen AT ONCE (≤ topN), computed once. Rows are sized
  // to this so a sparse early frame keeps bars at their normal, serious size
  // instead of ballooning; the still-empty rows get a "more to come" placeholder.
  // It counts the brief overlap during a membership SWAP too — a LEAVING bar is
  // held on screen until the next keyframe while a new one is already entering —
  // so bars are sized to fit that transient and never overflow the bars zone.
  if (!state.peak) {
    let p = 1;
    let prev: Set<string> | null = null;
    for (const f of race.frames) {
      const cur = new Set<string>();
      for (const nm in f.values) if (f.values[nm] > 1e-6) cur.add(nm);
      let simul = cur.size;
      if (prev) for (const nm of prev) if (!cur.has(nm)) simul++; // leavers still held from the prior keyframe
      if (simul > p) p = simul;
      prev = cur;
    }
    state.peak = Math.min(p, race.topN);
  }
  // How many bars are REAL (non-zero) right now → a smoothed "fill line" used to
  // place the placeholder below the live bars (no fake/0 bars are ever shown).
  const liveCount = ranked.reduce((n, r) => n + (r.v > 1e-6 && r.fade > 0.05 ? 1 : 0), 0);
  const targetVis = Math.max(0, Math.min(state.peak, liveCount));
  state.vis = state.vis > 0 ? state.vis + (targetVis - state.vis) * kRank : targetVis;
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
    // Constrain the subtitle to the bars' width and WRAP to a second line if
    // needed (ellipsized) so a long subtitle never runs off the canvas edge on
    // narrow / small layouts (it used to draw at a fixed size with no fit).
    const subPx = min * (vertical ? 0.03 : 0.026);
    const subMaxW = barsRight - padX;
    const subLines = wrapLines(ctx, race.subtitle, subPx, 700, subMaxW, 2);
    setFont(ctx, subPx, 700);
    ctx.fillStyle = SEAL;
    let sy = titleY + titlePx * 0.72;
    for (const ln of subLines) {
      ctx.fillText(ln, padX, sy);
      sy += subPx * 1.08;
    }
  }

  // ── bars ──
  // Row height is sized for the chart's EVENTUAL fill (state.peak), so bars keep a
  // consistent, serious thickness instead of ballooning when only a couple exist
  // early on. A sparse frame shows a few normal-size bars at the top; the unfilled
  // rows are handled by the "more to come" placeholder below.
  const rowDenom = Math.max(state.peak, 2);
  const rowH = (barsBottom - barsTop) / rowDenom;
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
    if (r.v <= 1e-6 || r.fade <= 1e-3) continue; // absent that year, or fully faded out (dropped off)
    const dispR = state.disp.get(r.e.name)!;
    if (dispR > race.topN - 0.25) continue;
    const alpha = clamp01(race.topN - dispR) * r.fade; // fade a leaving competitor's bar out as it drops off
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

  // ── "more to come" placeholder for the not-yet-filled rows ──────────────────
  // Shown ONLY while more competitors are genuinely still due to appear — i.e. a
  // LATER keyframe has more live entities than now — so it reads as "filling up".
  // It never shows once the field is full, nor while entities are dropping out
  // (a v18 "per-period" race), where the empty rows are exits, not arrivals.
  let futureMax = 0;
  for (const f of race.frames) {
    if (f.time <= curT + 1e-6) continue;
    let c = 0;
    for (const nm in f.values) if (f.values[nm] > 1e-6) c++;
    if (c > futureMax) futureMax = c;
  }
  futureMax = Math.min(futureMax, state.peak);
  const firstEmpty = state.vis; // smoothed fill line
  if (futureMax > firstEmpty + 0.25) {
    const phFade = clamp01((futureMax - firstEmpty) / Math.max(1.2, futureMax));
    const ghostW = Math.min(maxBarW * 0.4, barsRight - X0);
    ctx.save();
    ctx.lineCap = "round";
    ctx.setLineDash([Math.max(3, barH * 0.16), Math.max(3, barH * 0.13)]);
    ctx.lineWidth = Math.max(1.4, barH * 0.045);
    for (let i = Math.ceil(firstEmpty - 0.001); i < futureMax; i++) {
      const depth = (i - firstEmpty) / Math.max(1, futureMax - firstEmpty);
      const yMid = barsTop + i * rowH + rowH / 2;
      ctx.strokeStyle = `rgba(44,40,35,${0.16 * (1 - depth * 0.7) * phFade})`;
      roundRect(ctx, X0, yMid - barH / 2, ghostW * (1 - depth * 0.3), barH, barH * 0.18);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // one brief caption, centered in the empty band (only with room for it)
    if (futureMax - firstEmpty >= 1.4) {
      const capY = barsTop + ((firstEmpty + futureMax) / 2) * rowH;
      setFont(ctx, Math.min(rowH * 0.32, min * 0.026), 700);
      ctx.fillStyle = `rgba(44,40,35,${0.36 * phFade})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("More appear as the years roll on", X0 + (barsRight - X0) / 2, capY);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }

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

/* ── SECOND design: a "bubble" race ───────────────────────────────────────────
 * The SAME data shown as circles sized by value, laid out in an adaptive grid by
 * rank, each entity's flag/photo/logo inside a colored ring with its name & value
 * below. A cleaner, modern alternative to the horizontal bars — gives users a
 * choice of styles for one prompt. Shares all the chrome (title, year counter,
 * story panel, source, brand) with drawRaceFrame so the two feel like one feature. */
function drawRaceBubbles(ctx: CanvasRenderingContext2D, W: number, H: number, race: RaceData, state: RaceState, el: number) {
  const min = Math.min(W, H);
  const vertical = H > W;
  const t0 = race.frames[0].time;
  const t1 = race.frames[race.frames.length - 1].time;
  const prog = clamp01(race.durationSec > 0 ? el / race.durationSec : 1);
  const curT = t0 + (t1 - t0) * prog;
  const vals = valuesAt(race, curT);

  const ranked = race.entities
    .map((e) => ({ e, v: vals.get(e.name)?.v || 0, fade: vals.get(e.name)?.fade ?? 1 }))
    .filter((r) => r.v > 1e-6 && r.fade > 0.05)
    .sort((a, b) => b.v - a.v)
    .slice(0, race.topN);

  const dt = state.init ? Math.max(0, Math.min(0.1, el - state.lastEl)) : 0;
  state.lastEl = el;
  const kPos = state.init ? 1 - Math.exp(-dt * 6) : 1; // ease circles between grid cells on reorder
  const kMax = state.init ? 1 - Math.exp(-dt * 5) : 1;
  const targetMax = Math.max(1e-6, ranked.length ? ranked[0].v : 1);
  state.max = state.init ? state.max + (targetMax - state.max) * kMax : targetMax;
  const maxV = Math.max(1e-6, state.max);
  state.init = true;

  const { ev, idx: evIdx } = activeEvent(race, curT);
  if (evIdx !== state.evIdx) {
    state.evIdx = evIdx;
    state.evChange = el;
  }
  const evAlpha = clamp01((el - state.evChange) / 0.45);

  drawCertificateBg(ctx, W, H);

  // regions — match the bars layout so the shared chrome lines up exactly
  const padX = W * (vertical ? 0.045 : 0.035);
  const titleY = H * (vertical ? 0.06 : 0.085);
  const plotTop = H * (vertical ? 0.14 : 0.19);
  const plotBottom = H * (vertical ? 0.6 : 0.9);
  const plotLeft = padX;
  const plotRight = vertical ? W - padX : W * 0.66;
  const panelX = vertical ? padX : W * 0.675;
  const panelY = vertical ? H * 0.63 : H * 0.17;
  const panelW = vertical ? W - 2 * padX : W * 0.965 - panelX;
  const panelH = vertical ? H * 0.32 : H * 0.9 - H * 0.17;

  // title + subtitle (same as the bars header)
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const titlePx = fitText(ctx, race.title, min * (vertical ? 0.055 : 0.05), 800, plotRight - padX);
  ctx.fillStyle = INK;
  ctx.fillText(race.title, padX, titleY);
  if (race.subtitle) {
    const subPx = min * (vertical ? 0.03 : 0.026);
    const subLines = wrapLines(ctx, race.subtitle, subPx, 700, plotRight - padX, 2);
    setFont(ctx, subPx, 700);
    ctx.fillStyle = SEAL;
    let sy = titleY + titlePx * 0.72;
    for (const ln of subLines) {
      ctx.fillText(ln, padX, sy);
      sy += subPx * 1.08;
    }
  }

  // ── bubbles in an adaptive grid (cols chosen for the plot's aspect) ──
  const N = ranked.length;
  if (N > 0) {
    const plotW = plotRight - plotLeft;
    const plotH = plotBottom - plotTop;
    const cols = Math.min(N, Math.max(1, Math.round(Math.sqrt((N * plotW) / Math.max(1, plotH)))));
    const rows = Math.ceil(N / cols);
    const cellW = plotW / cols;
    const cellH = plotH / rows;
    // Split each cell into a CIRCLE zone (top) and a LABEL zone (bottom) so a
    // bubble's name + value sit in their own reserved space and can never overlap
    // the neighbouring bubbles, their labels, or the row below.
    const labelH = Math.min(cellH * 0.34, cellW * 0.5);
    const circleH = cellH - labelH;
    const rMax = Math.min(cellW * 0.42, circleH * 0.46);
    const namePx = Math.min(labelH * 0.4, cellW * 0.14);
    const valPx = Math.min(labelH * 0.36, cellW * 0.13);

    ctx.textAlign = "center";
    ranked.forEach((r, i) => {
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? N - row * cols : cols;
      const col = i - row * cols;
      const rowLeft = plotLeft + (plotW - inRow * cellW) / 2;
      const cellTop = plotTop + row * cellH;
      const tx = rowLeft + (col + 0.5) * cellW;
      const ty = cellTop + circleH / 2; // circle centered in its (top) circle-zone
      let p = state.bub.get(r.e.name);
      if (!p) {
        p = { x: tx, y: ty };
        state.bub.set(r.e.name, p);
      }
      p.x += (tx - p.x) * kPos;
      p.y += (ty - p.y) * kPos;
      const rad = rMax * (0.5 + 0.5 * Math.sqrt(clamp01(r.v / maxV))); // min 50% so small bubbles stay readable
      const ringW = Math.max(2.5, rad * 0.12);

      // base color circle (the entity's identity ring shows around the media)
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.20)";
      ctx.shadowBlur = rad * 0.22;
      ctx.shadowOffsetY = rad * 0.07;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = r.e.color;
      ctx.fill();
      ctx.restore();

      // BEST media for every bubble: its own logo/photo/flag → else its country
      // flag → else initials. (Both the primary and the flag are preloaded.)
      const primary = getImg(r.e.image);
      const flagImg = r.e.kind !== "country" && r.e.country ? getImg(flagUrlFromIso2(r.e.country)) : null;
      const mainImg = primary || flagImg;
      if (mainImg) {
        drawCircleMedia(ctx, mainImg, p.x, p.y, (rad - ringW) * 2);
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad - ringW, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2);
        const ini = r.e.name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
        setFont(ctx, (rad - ringW) * 0.9, 800);
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(ini, p.x, p.y);
        ctx.textBaseline = "alphabetic";
        ctx.restore();
      }
      // country badge only when the main media is a logo/photo (avoid a duplicate flag)
      if (primary && flagImg) drawCircleMedia(ctx, flagImg, p.x + rad * 0.64, p.y + rad * 0.64, rad * 0.5);

      // name + value in the reserved LABEL zone below the circle
      const nameY = cellTop + circleH + labelH * 0.42;
      ctx.fillStyle = INK;
      setFont(ctx, fitText(ctx, r.e.name, namePx, 800, cellW * 0.95), 800);
      ctx.fillText(r.e.name, p.x, nameY);
      const vStr = fmtValueCompact(r.v, race); // compact so labels don't crowd under bubbles
      ctx.fillStyle = SEAL;
      setFont(ctx, fitText(ctx, vStr, valPx, 800, cellW * 0.95), 800);
      ctx.fillText(vStr, p.x, nameY + labelH * 0.42);
    });
    // forget circles that have left so the map can't grow unbounded
    if (state.bub.size > race.entities.length) {
      const live = new Set(ranked.map((r) => r.e.name));
      for (const k of [...state.bub.keys()]) if (!live.has(k)) state.bub.delete(k);
    }
    ctx.textAlign = "left";
  }

  drawStoryPanel(ctx, panelX, panelY, panelW, panelH, race, curT, ev, evAlpha, vertical);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (race.source) {
    setFont(ctx, min * 0.026, 700);
    ctx.fillStyle = "rgba(44,40,35,0.45)";
    ctx.fillText(`Source: ${race.source}`, padX, H * 0.975);
  }
  drawBrandBadge(ctx, W - padX, H * 0.965, min * 0.034);
}

/** Smooth (horizontal-tangent) path through points — gives the bump trails their
 *  elegant S-curves between rank changes. */
function drawSmoothPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x + 0.01, pts[0].y);
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const mx = (a.x + b.x) / 2;
    ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
  }
}

/** Per-keyframe rank (0-based, by value desc among present) of every entity —
 *  a pure function of the race, so it's computed once and cached per RaceData. */
const bumpRankCache = new WeakMap<RaceData, Map<string, number>[]>();
function bumpRankMapsFor(race: RaceData): Map<string, number>[] {
  let maps = bumpRankCache.get(race);
  if (!maps) {
    maps = race.frames.map((f) => {
      const present = Object.keys(f.values)
        .filter((nm) => f.values[nm] > 1e-6)
        .sort((a, b) => f.values[b] - f.values[a]);
      const m = new Map<string, number>();
      present.forEach((nm, i) => m.set(nm, i));
      return m;
    });
    bumpRankCache.set(race, maps);
  }
  return maps;
}

/* ── THIRD design: a "Trail" bump chart ───────────────────────────────────────
 * The same data as a RANK-over-time race: each competitor is a smooth trail that
 * rises and falls through the standings, the lines CROSSING as they overtake one
 * another (the literal battle for position), with a media avatar + current value
 * at each trail's head. Rank rows are evenly spaced (no value-scale squashing), so
 * it's a genuinely different, modern view from the bars (magnitude) and bubbles
 * (proportion). Shares all the chrome (header, story panel, source, brand). */
function drawRaceBump(ctx: CanvasRenderingContext2D, W: number, H: number, race: RaceData, state: RaceState, el: number) {
  const min = Math.min(W, H);
  const vertical = H > W;
  const t0 = race.frames[0].time;
  const t1 = race.frames[race.frames.length - 1].time;
  const prog = clamp01(race.durationSec > 0 ? el / race.durationSec : 1);
  const curT = t0 + (t1 - t0) * prog;
  const vals = valuesAt(race, curT);
  const ranked = race.entities
    .map((e) => ({ e, v: vals.get(e.name)?.v || 0, fade: vals.get(e.name)?.fade ?? 1 }))
    .filter((r) => r.v > 1e-6 && r.fade > 0.05)
    .sort((a, b) => b.v - a.v);
  const N = Math.max(1, Math.min(race.topN, ranked.length));
  const visible = ranked.slice(0, N);

  // Ease each visible entity's row toward its current (value-sorted) rank, so the
  // head avatars + labels move smoothly AND sit on unique rows that match the
  // values (the trail BODY uses the continuous rankAt below for smooth crossings).
  const dt = state.init ? Math.max(0, Math.min(0.1, el - state.lastEl)) : 0;
  const kRank = state.init ? 1 - Math.exp(-dt * 8) : 1;
  visible.forEach((r, idx) => {
    const cur = state.disp.has(r.e.name) ? state.disp.get(r.e.name)! : idx;
    state.disp.set(r.e.name, cur + (idx - cur) * kRank);
  });
  state.lastEl = el;
  state.init = true;

  const { ev, idx: evIdx } = activeEvent(race, curT);
  if (evIdx !== state.evIdx) {
    state.evIdx = evIdx;
    state.evChange = el;
  }
  const evAlpha = clamp01((el - state.evChange) / 0.45);

  drawCertificateBg(ctx, W, H);

  const padX = W * (vertical ? 0.045 : 0.035);
  const titleY = H * (vertical ? 0.06 : 0.085);
  const plotTop = H * (vertical ? 0.15 : 0.2);
  const plotBottom = H * (vertical ? 0.6 : 0.9);
  const plotLeft = padX;
  const plotRight = vertical ? W - padX : W * 0.66;
  const panelX = vertical ? padX : W * 0.675;
  const panelY = vertical ? H * 0.63 : H * 0.17;
  const panelW = vertical ? W - 2 * padX : W * 0.965 - panelX;
  const panelH = vertical ? H * 0.32 : H * 0.9 - H * 0.17;

  // header (same as the other designs)
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const titlePx = fitText(ctx, race.title, min * (vertical ? 0.055 : 0.05), 800, plotRight - padX);
  ctx.fillStyle = INK;
  ctx.fillText(race.title, padX, titleY);
  if (race.subtitle) {
    const subPx = min * (vertical ? 0.03 : 0.026);
    const subLines = wrapLines(ctx, race.subtitle, subPx, 700, plotRight - padX, 2);
    setFont(ctx, subPx, 700);
    ctx.fillStyle = SEAL;
    let sy = titleY + titlePx * 0.72;
    for (const ln of subLines) {
      ctx.fillText(ln, padX, sy);
      sy += subPx * 1.08;
    }
  }

  // ── bump plot ──
  const labelStrip = Math.min((plotRight - plotLeft) * 0.27, min * 0.34);
  const linesRight = plotRight - labelStrip;
  const plotW = Math.max(10, linesRight - plotLeft);
  const plotH = plotBottom - plotTop;
  const rowH = plotH / N;
  const rowOf = (rank0: number) => plotTop + (rank0 + 0.5) * rowH;
  const lo = N - 1 + 0.6; // resting row for below-topN / entering trails
  const lineW = Math.max(2.5, rowH * 0.13);
  const aR = Math.min(rowH * 0.4, plotW * 0.06); // head avatar radius

  // SCROLLING window: show the most recent `windowSpan` of time so the trails flow
  // briskly (more engaging) WITHOUT touching the data speed. The window start is
  // clamped to t0, and every trail begins exactly at the left edge, so the back of
  // each trail stays attached to the left and never detaches.
  const windowSpan = Math.max((t1 - t0) * 0.5, 1e-6);
  const wStart = Math.max(t0, curT - windowSpan);
  const wEnd = Math.max(curT, wStart + 1e-6); // head pinned at the right edge
  const xOf = (t: number) => plotLeft + clamp01((t - wStart) / (wEnd - wStart)) * plotW;

  // faint rank guide rows
  ctx.save();
  ctx.strokeStyle = "rgba(44,40,35,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i < N; i++) {
    const y = rowOf(i);
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(linesRight, y);
    ctx.stroke();
  }
  ctx.restore();

  // rank (0-based) of every entity at EVERY keyframe (for the rank-vs-time curve) —
  // independent of time, so it's computed once per race and cached.
  const frames = race.frames;
  const kfRankMaps = bumpRankMapsFor(race);
  // An entity's smooth, continuous rank at any time τ — interpolated between the
  // surrounding keyframes (smoothstep for crisp crossings) and clamped to just
  // below the last row. This is what makes the trail gap-free and kink-free.
  const rankAt = (name: string, tau: number): number => {
    if (tau <= frames[0].time) {
      const r = kfRankMaps[0].get(name);
      return r == null ? lo : Math.min(r, lo);
    }
    if (tau >= frames[frames.length - 1].time) {
      const r = kfRankMaps[frames.length - 1].get(name);
      return r == null ? lo : Math.min(r, lo);
    }
    let i = 0;
    while (i < frames.length - 1 && !(frames[i].time <= tau && tau < frames[i + 1].time)) i++;
    const ra = kfRankMaps[i].get(name);
    const rb = kfRankMaps[i + 1].get(name);
    const f = (tau - frames[i].time) / Math.max(1e-9, frames[i + 1].time - frames[i].time);
    const ss = f * f * (3 - 2 * f); // smoothstep → snappy, crisp crossings
    if (ra != null && rb != null) return Math.min(ra + (rb - ra) * ss, lo);
    if (ra != null) return Math.min(ra, lo); // leaving → hold its row
    if (rb != null) return Math.min(lo + (rb - lo) * ss, lo); // entering → rises from below
    return lo;
  };

  // trails (non-leaders first so the leader sits on top)
  for (let vi = visible.length - 1; vi >= 0; vi--) {
    const r = visible[vi];
    const nm = r.e.name;
    const pts: { x: number; y: number }[] = [];
    pts.push({ x: plotLeft, y: rowOf(rankAt(nm, wStart)) }); // ATTACHED to the left edge
    for (let fi = 0; fi < frames.length; fi++) {
      const ft = frames[fi].time;
      if (ft > wStart + 1e-6 && ft < curT - 1e-6) {
        const rk = kfRankMaps[fi].get(nm);
        pts.push({ x: xOf(ft), y: rowOf(rk == null ? lo : Math.min(rk, lo)) });
      }
    }
    // head sits on the entity's eased value-sorted row → unique rows that match
    // the labels (no overlapping avatars), while the trail body stays smooth.
    const head = { x: plotLeft + plotW, y: rowOf(Math.min(state.disp.get(nm) ?? vi, lo)) };
    pts.push(head);

    ctx.save();
    ctx.strokeStyle = r.e.color;
    ctx.lineWidth = vi === 0 ? lineW * 1.25 : lineW;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    drawSmoothPath(ctx, pts);
    ctx.stroke();
    ctx.restore();

    drawEntityAvatar(ctx, r.e, head.x, head.y, aR);

    // name + current value in the right strip, centered on the head (one per row → no overlap)
    const lx = head.x + aR + Math.max(6, aR * 0.3);
    const lw = Math.max(20, plotRight - lx);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, fitText(ctx, nm, Math.min(rowH * 0.34, min * 0.026), 800, lw), 800);
    ctx.fillStyle = INK;
    ctx.fillText(nm, lx, head.y - rowH * 0.02);
    const vStr = fmtValueCompact(r.v, race);
    setFont(ctx, fitText(ctx, vStr, Math.min(rowH * 0.3, min * 0.024), 800, lw), 800);
    ctx.fillStyle = SEAL;
    ctx.fillText(vStr, lx, head.y + rowH * 0.32);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  drawStoryPanel(ctx, panelX, panelY, panelW, panelH, race, curT, ev, evAlpha, vertical);
  if (race.source) {
    setFont(ctx, min * 0.026, 700);
    ctx.fillStyle = "rgba(44,40,35,0.45)";
    ctx.fillText(`Source: ${race.source}`, padX, H * 0.975);
  }
  drawBrandBadge(ctx, W - padX, H * 0.965, min * 0.034);
}

/** A circular entity avatar: color identity ring + best media (own logo/photo/flag
 *  → its country flag → initials). Centered at (cx, cy), outer radius rad. */
function drawEntityAvatar(ctx: CanvasRenderingContext2D, e: RaceData["entities"][number], cx: number, cy: number, rad: number) {
  if (rad < 1) return;
  const ringW = Math.max(2, rad * 0.12);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = rad * 0.22;
  ctx.shadowOffsetY = rad * 0.07;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fillStyle = e.color;
  ctx.fill();
  ctx.restore();
  const primary = getImg(e.image);
  const flagImg = e.kind !== "country" && e.country ? getImg(flagUrlFromIso2(e.country)) : null;
  const mainImg = primary || flagImg;
  if (mainImg) {
    drawCircleMedia(ctx, mainImg, cx, cy, (rad - ringW) * 2);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad - ringW, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    const ini = e.name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
    setFont(ctx, (rad - ringW) * 0.9, 800);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ini, cx, cy);
    ctx.restore();
  }
}

const PODIUM_ACCENT = ["#D4AF37", "#9AA1AC", "#CD7F32"]; // gold / silver / bronze, by rank

/* ── FOURTH design: a "Podium" / Champions race ───────────────────────────────
 * The most dramatic view — the top 3 stand on a gold/silver/bronze medal podium
 * (#1 center & tallest) with big avatars, names & values, while the rest race
 * below as "chasers". Every competitor eases between its podium slot or chaser
 * spot, so they climb onto and fall off the podium as the standings change — a
 * literal battle for the rostrum. Shares all the chrome with the other designs. */
function drawRacePodium(ctx: CanvasRenderingContext2D, W: number, H: number, race: RaceData, state: RaceState, el: number) {
  const min = Math.min(W, H);
  const vertical = H > W;
  const t0 = race.frames[0].time;
  const t1 = race.frames[race.frames.length - 1].time;
  const prog = clamp01(race.durationSec > 0 ? el / race.durationSec : 1);
  const curT = t0 + (t1 - t0) * prog;
  const vals = valuesAt(race, curT);
  const ranked = race.entities
    .map((e) => ({ e, v: vals.get(e.name)?.v || 0, fade: vals.get(e.name)?.fade ?? 1 }))
    .filter((r) => r.v > 1e-6 && r.fade > 0.05)
    .sort((a, b) => b.v - a.v);
  const N = Math.max(1, Math.min(race.topN, ranked.length));
  const visible = ranked.slice(0, N);

  const dt = state.init ? Math.max(0, Math.min(0.1, el - state.lastEl)) : 0;
  state.lastEl = el;
  const k = state.init ? 1 - Math.exp(-dt * 6) : 1;
  state.init = true;

  const { ev, idx: evIdx } = activeEvent(race, curT);
  if (evIdx !== state.evIdx) {
    state.evIdx = evIdx;
    state.evChange = el;
  }
  const evAlpha = clamp01((el - state.evChange) / 0.45);

  drawCertificateBg(ctx, W, H);

  const padX = W * (vertical ? 0.045 : 0.035);
  const titleY = H * (vertical ? 0.06 : 0.085);
  const plotTop = H * (vertical ? 0.14 : 0.19);
  const plotBottom = H * (vertical ? 0.6 : 0.9);
  const plotLeft = padX;
  const plotRight = vertical ? W - padX : W * 0.66;
  const panelX = vertical ? padX : W * 0.675;
  const panelY = vertical ? H * 0.63 : H * 0.17;
  const panelW = vertical ? W - 2 * padX : W * 0.965 - panelX;
  const panelH = vertical ? H * 0.32 : H * 0.9 - H * 0.17;

  // header (same as the other designs)
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const titlePx = fitText(ctx, race.title, min * (vertical ? 0.055 : 0.05), 800, plotRight - padX);
  ctx.fillStyle = INK;
  ctx.fillText(race.title, padX, titleY);
  if (race.subtitle) {
    const subPx = min * (vertical ? 0.03 : 0.026);
    const subLines = wrapLines(ctx, race.subtitle, subPx, 700, plotRight - padX, 2);
    setFont(ctx, subPx, 700);
    ctx.fillStyle = SEAL;
    let sy = titleY + titlePx * 0.72;
    for (const ln of subLines) {
      ctx.fillText(ln, padX, sy);
      sy += subPx * 1.08;
    }
  }

  // ── layout ──
  const regL = plotLeft;
  const regR = plotRight;
  const regT = plotTop;
  const regB = plotBottom;
  const regW = regR - regL;
  const regH = regB - regT;
  const hasChasers = visible.length > 3;
  const podiumH = regH * (hasChasers ? 0.66 : 0.94);
  const baseY = regT + podiumH;
  const slotX = [regL + regW * 0.5, regL + regW * 0.21, regL + regW * 0.79]; // by rank0: #1 centre, #2 left, #3 right
  const pedW = Math.min(regW * 0.23, podiumH * 0.62);
  const pedH = [podiumH * 0.42, podiumH * 0.31, podiumH * 0.23]; // by rank0
  const aBase = Math.min(pedW * 0.46, podiumH * 0.2);
  const aRad = [aBase, aBase * 0.86, aBase * 0.78]; // by rank0
  const pedTop = (r0: number) => baseY - pedH[r0];
  const avatarYP = (r0: number) => pedTop(r0) - aRad[r0] - podiumH * 0.05;

  // chasers (rank 4..N) — up to two rows
  const nCh = Math.max(0, visible.length - 3);
  const chCols = nCh <= 6 ? Math.max(1, nCh) : Math.ceil(nCh / 2);
  const chRows = nCh > 0 ? Math.ceil(nCh / chCols) : 1;
  const chTop = baseY + regH * 0.05;
  const chZoneH = regB - chTop;
  const chRowH = chZoneH / chRows;
  const chR = nCh > 0 ? Math.min((regW / chCols) * 0.16, chRowH * 0.34) : 0;
  const chCx = (ci: number) => regL + ((ci % chCols) + 0.5) * (regW / chCols);
  const chCy = (ci: number) => chTop + (Math.floor(ci / chCols) + 0.42) * chRowH;

  const targetFor = (r0: number) => {
    if (r0 < 3) return { x: slotX[r0], y: avatarYP(r0), r: aRad[r0] };
    const ci = r0 - 3;
    return { x: chCx(ci), y: chCy(ci), r: chR };
  };

  visible.forEach((rr, r0) => {
    const tgt = targetFor(r0);
    let p = state.bub.get(rr.e.name);
    if (!p) {
      p = { x: tgt.x, y: tgt.y, r: tgt.r };
      state.bub.set(rr.e.name, p);
    }
    p.x += (tgt.x - p.x) * k;
    p.y += (tgt.y - p.y) * k;
    p.r = (p.r ?? tgt.r) + (tgt.r - (p.r ?? tgt.r)) * k;
  });
  if (state.bub.size > race.entities.length) {
    const live = new Set(visible.map((r) => r.e.name));
    for (const kk of [...state.bub.keys()]) if (!live.has(kk)) state.bub.delete(kk);
  }

  // pedestals (static, only for occupied slots)
  const topSlots = Math.min(3, visible.length);
  for (let r0 = topSlots - 1; r0 >= 0; r0--) {
    const x = slotX[r0];
    const top = pedTop(r0);
    const grad = ctx.createLinearGradient(0, top, 0, baseY);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(110,103,92,0.3)");
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.14)";
    ctx.shadowBlur = pedW * 0.07;
    ctx.shadowOffsetY = pedW * 0.03;
    roundRect(ctx, x - pedW / 2, top, pedW, baseY - top, pedW * 0.05);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PODIUM_ACCENT[r0]; // medal-colour cap
    roundRect(ctx, x - pedW / 2, top, pedW, Math.max(4, podiumH * 0.02), pedW * 0.03);
    ctx.fill();
    setFont(ctx, pedH[r0] * 0.46, 800); // big faint rank numeral
    ctx.fillStyle = "rgba(44,40,35,0.14)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(r0 + 1), x, top + (baseY - top) * 0.6);
  }
  ctx.textBaseline = "alphabetic";

  // baseline
  ctx.strokeStyle = "rgba(44,40,35,0.12)";
  ctx.lineWidth = Math.max(1, regH * 0.004);
  ctx.beginPath();
  ctx.moveTo(regL, baseY);
  ctx.lineTo(regR, baseY);
  ctx.stroke();

  // entities — chasers + lower medals first, #1 last (on top)
  const order = visible.map((_, i) => i).sort((a, b) => b - a);
  for (const r0 of order) {
    const rr = visible[r0];
    const p = state.bub.get(rr.e.name)!;
    const rad = p.r ?? targetFor(r0).r;
    drawEntityAvatar(ctx, rr.e, p.x, p.y, rad);
    ctx.textAlign = "center";
    if (r0 < 3) {
      // medal ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad + Math.max(2, rad * 0.08), 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2.5, rad * 0.12);
      ctx.strokeStyle = PODIUM_ACCENT[r0];
      ctx.stroke();
      ctx.restore();
      // value above the avatar
      ctx.fillStyle = INK;
      setFont(ctx, fitText(ctx, fmtValueCompact(rr.v, race), rad * 0.55, 800, pedW * 1.1), 800);
      ctx.fillText(fmtValueCompact(rr.v, race), p.x, p.y - rad - rad * 0.22);
      // name on the pedestal face
      ctx.fillStyle = INK;
      setFont(ctx, fitText(ctx, rr.e.name, Math.min(pedW * 0.15, podiumH * 0.07), 800, pedW * 0.9), 800);
      ctx.fillText(rr.e.name, slotX[r0], pedTop(r0) + (baseY - pedTop(r0)) * 0.32);
    } else {
      // chaser: small rank badge + name + value
      const bx = p.x - rad * 0.78;
      const by = p.y - rad * 0.78;
      const br = rad * 0.5;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = SEAL;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      setFont(ctx, br * 1.0, 800);
      ctx.fillText(String(r0 + 1), bx, by + br * 0.05);
      ctx.textBaseline = "alphabetic";
      const cw = regW / chCols;
      ctx.fillStyle = INK;
      setFont(ctx, fitText(ctx, rr.e.name, Math.min(chR * 0.52, min * 0.02), 800, cw * 0.92), 800);
      ctx.fillText(rr.e.name, p.x, p.y + rad + chR * 0.5);
      ctx.fillStyle = SEAL;
      setFont(ctx, fitText(ctx, fmtValueCompact(rr.v, race), Math.min(chR * 0.48, min * 0.018), 800, cw * 0.92), 800);
      ctx.fillText(fmtValueCompact(rr.v, race), p.x, p.y + rad + chR * 1.05);
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  drawStoryPanel(ctx, panelX, panelY, panelW, panelH, race, curT, ev, evAlpha, vertical);
  if (race.source) {
    setFont(ctx, min * 0.026, 700);
    ctx.fillStyle = "rgba(44,40,35,0.45)";
    ctx.fillText(`Source: ${race.source}`, padX, H * 0.975);
  }
  drawBrandBadge(ctx, W - padX, H * 0.965, min * 0.034);
}

/* ── small colour helper (entity hex → rgba, for the comet gradients) ───────── */
function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "").replace("#", "");
  if (h.length === 6) {
    const n = parseInt(h, 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if (h.length === 3) {
    const n = parseInt(h.split("").map((c) => c + c).join(""), 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [140, 130, 120];
}
const rgbaOf = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** A subtle full-height checkered "finish line" at x. */
function drawCheckeredFinish(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number) {
  const cw = w / 2;
  const rows = Math.ceil(h / cw);
  ctx.save();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "rgba(44,40,35,0.62)" : "rgba(246,244,238,0.85)";
      ctx.fillRect(x + c * cw, top + r * cw, cw, Math.min(cw, top + h - (top + r * cw)));
    }
  }
  ctx.restore();
}

/* ── FIFTH design: a "Race" — competitors sprint along lanes to a finish ───────
 * The most kinetic, on-theme view: each competitor is an avatar token racing
 * along its lane toward a checkered finish line, position ∝ value (the leader is
 * at the finish), with a motion comet behind it, its rank + name on the left and
 * its live value riding above. Lanes are ordered by rank and tokens slide between
 * them as the standings change. Shares all the chrome with the other designs. */
function drawRaceLanes(ctx: CanvasRenderingContext2D, W: number, H: number, race: RaceData, state: RaceState, el: number) {
  const min = Math.min(W, H);
  const vertical = H > W;
  const t0 = race.frames[0].time;
  const t1 = race.frames[race.frames.length - 1].time;
  const prog = clamp01(race.durationSec > 0 ? el / race.durationSec : 1);
  const curT = t0 + (t1 - t0) * prog;
  const vals = valuesAt(race, curT);
  const ranked = race.entities
    .map((e) => ({ e, v: vals.get(e.name)?.v || 0, fade: vals.get(e.name)?.fade ?? 1 }))
    .filter((r) => r.v > 1e-6 && r.fade > 0.05)
    .sort((a, b) => b.v - a.v);
  const N = Math.max(1, Math.min(race.topN, ranked.length));
  const visible = ranked.slice(0, N);

  const dt = state.init ? Math.max(0, Math.min(0.1, el - state.lastEl)) : 0;
  const kRank = state.init ? 1 - Math.exp(-dt * 8) : 1;
  const kMax = state.init ? 1 - Math.exp(-dt * 5) : 1;
  visible.forEach((r, idx) => {
    const cur = state.disp.has(r.e.name) ? state.disp.get(r.e.name)! : idx;
    state.disp.set(r.e.name, cur + (idx - cur) * kRank);
  });
  const targetMax = Math.max(1e-6, visible.length ? visible[0].v : 1);
  state.max = state.init ? state.max + (targetMax - state.max) * kMax : targetMax;
  const maxV = Math.max(1e-6, state.max);
  state.lastEl = el;
  state.init = true;

  const { ev, idx: evIdx } = activeEvent(race, curT);
  if (evIdx !== state.evIdx) {
    state.evIdx = evIdx;
    state.evChange = el;
  }
  const evAlpha = clamp01((el - state.evChange) / 0.45);

  drawCertificateBg(ctx, W, H);

  const padX = W * (vertical ? 0.045 : 0.035);
  const titleY = H * (vertical ? 0.06 : 0.085);
  const plotTop = H * (vertical ? 0.15 : 0.2);
  const plotBottom = H * (vertical ? 0.6 : 0.9);
  const plotLeft = padX;
  const plotRight = vertical ? W - padX : W * 0.66;
  const panelX = vertical ? padX : W * 0.675;
  const panelY = vertical ? H * 0.63 : H * 0.17;
  const panelW = vertical ? W - 2 * padX : W * 0.965 - panelX;
  const panelH = vertical ? H * 0.32 : H * 0.9 - H * 0.17;

  // header (same as the other designs)
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const titlePx = fitText(ctx, race.title, min * (vertical ? 0.055 : 0.05), 800, plotRight - padX);
  ctx.fillStyle = INK;
  ctx.fillText(race.title, padX, titleY);
  if (race.subtitle) {
    const subPx = min * (vertical ? 0.03 : 0.026);
    const subLines = wrapLines(ctx, race.subtitle, subPx, 700, plotRight - padX, 2);
    setFont(ctx, subPx, 700);
    ctx.fillStyle = SEAL;
    let sy = titleY + titlePx * 0.72;
    for (const ln of subLines) {
      ctx.fillText(ln, padX, sy);
      sy += subPx * 1.08;
    }
  }

  // ── lanes ──
  const regL = plotLeft;
  const regR = plotRight;
  const regT = plotTop;
  const regB = plotBottom;
  const regW = regR - regL;
  const regH = regB - regT;
  const rowH = regH / N;
  const rowY = (rank: number) => regT + (rank + 0.5) * rowH;
  const labelW = Math.min(regW * 0.3, regW - regH * 0.45);
  const finishW = Math.max(8, regW * 0.012);
  const finishX = regR - finishW;
  const trackLeft = regL + labelW;
  const trackRight = finishX - regW * 0.012;
  const tokenR = Math.min(rowH * 0.36, regW * 0.032);
  const trackUsable = Math.max(10, trackRight - trackLeft - tokenR * 2);

  // finish line
  drawCheckeredFinish(ctx, finishX, regT, finishW, regH);

  // faint lane guides
  ctx.save();
  ctx.strokeStyle = "rgba(44,40,35,0.05)";
  ctx.lineWidth = Math.max(1, rowH * 0.02);
  for (let i = 0; i < N; i++) {
    const y = rowY(i);
    ctx.beginPath();
    ctx.moveTo(trackLeft, y);
    ctx.lineTo(trackRight, y);
    ctx.stroke();
  }
  ctx.restore();

  // racers (back to front so the leader sits on top)
  for (let vi = visible.length - 1; vi >= 0; vi--) {
    const r = visible[vi];
    const nm = r.e.name;
    const y = rowY(Math.min(state.disp.get(nm) ?? vi, N - 1));
    const tx = trackLeft + tokenR + clamp01(r.v / maxV) * trackUsable;
    const tr = vi === 0 ? tokenR * 1.12 : tokenR; // leader slightly bigger

    // motion comet behind the token
    const cl = Math.min(tr * 3.4, tx - trackLeft + tr);
    if (cl > tr * 0.6) {
      const g = ctx.createLinearGradient(tx - cl, 0, tx, 0);
      g.addColorStop(0, rgbaOf(r.e.color, 0));
      g.addColorStop(1, rgbaOf(r.e.color, 0.5));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(tx - cl, y);
      ctx.lineTo(tx, y - tr * 0.66);
      ctx.lineTo(tx, y + tr * 0.66);
      ctx.closePath();
      ctx.fill();
    }

    // token avatar (leader gets a soft glow)
    if (vi === 0) {
      ctx.save();
      ctx.shadowColor = rgbaOf(r.e.color, 0.55);
      ctx.shadowBlur = tr * 0.8;
      drawEntityAvatar(ctx, r.e, tx, y, tr);
      ctx.restore();
    } else {
      drawEntityAvatar(ctx, r.e, tx, y, tr);
    }

    // value riding just above the token
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = SEAL;
    setFont(ctx, fitText(ctx, fmtValueCompact(r.v, race), Math.min(tr * 0.82, rowH * 0.3), 800, tr * 4.5), 800);
    ctx.fillText(fmtValueCompact(r.v, race), tx, y - tr - tr * 0.22);

    // left label: rank badge + name (slides with the racer)
    const badgeR = Math.min(rowH * 0.26, labelW * 0.09);
    const bx = regL + badgeR + regW * 0.004;
    ctx.beginPath();
    ctx.arc(bx, y, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = r.e.color;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setFont(ctx, badgeR * 1.05, 800);
    ctx.fillText(String(vi + 1), bx, y + badgeR * 0.04);
    const nx = bx + badgeR + regW * 0.012;
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    setFont(ctx, fitText(ctx, nm, Math.min(rowH * 0.36, min * 0.028), 800, trackLeft - nx - regW * 0.012), 800);
    ctx.fillText(nm, nx, y);
    ctx.textBaseline = "alphabetic";
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  drawStoryPanel(ctx, panelX, panelY, panelW, panelH, race, curT, ev, evAlpha, vertical);
  if (race.source) {
    setFont(ctx, min * 0.026, 700);
    ctx.fillStyle = "rgba(44,40,35,0.45)";
    ctx.fillText(`Source: ${race.source}`, padX, H * 0.975);
  }
  drawBrandBadge(ctx, W - padX, H * 0.965, min * 0.034);
}

/** Path for a column: rounded TOP corners, square bottom sitting on the baseline. */
function columnPath(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  ctx.beginPath();
  ctx.moveTo(x, top + h);
  ctx.lineTo(x, top + rr);
  ctx.arcTo(x, top, x + rr, top, rr);
  ctx.lineTo(x + w - rr, top);
  ctx.arcTo(x + w, top, x + w, top + rr, rr);
  ctx.lineTo(x + w, top + h);
  ctx.closePath();
}

/* ── SIXTH design: "Columns" — a vertical skyline race ─────────────────────────
 * The same data as glossy vertical columns rising from a baseline, ordered by rank
 * left→right, each with its avatar perched on top, its live value above and its
 * name below; the leader is tallest with a soft glow. The only VERTICAL view in the
 * set — columns slide between slots as the standings change. Shares all the chrome. */
function drawRaceColumns(ctx: CanvasRenderingContext2D, W: number, H: number, race: RaceData, state: RaceState, el: number) {
  const min = Math.min(W, H);
  const vertical = H > W;
  const t0 = race.frames[0].time;
  const t1 = race.frames[race.frames.length - 1].time;
  const prog = clamp01(race.durationSec > 0 ? el / race.durationSec : 1);
  const curT = t0 + (t1 - t0) * prog;
  const vals = valuesAt(race, curT);
  const ranked = race.entities
    .map((e) => ({ e, v: vals.get(e.name)?.v || 0, fade: vals.get(e.name)?.fade ?? 1 }))
    .filter((r) => r.v > 1e-6 && r.fade > 0.05)
    .sort((a, b) => b.v - a.v);
  const N = Math.max(1, Math.min(race.topN, ranked.length));
  const visible = ranked.slice(0, N);

  const dt = state.init ? Math.max(0, Math.min(0.1, el - state.lastEl)) : 0;
  const kRank = state.init ? 1 - Math.exp(-dt * 8) : 1;
  const kMax = state.init ? 1 - Math.exp(-dt * 5) : 1;
  visible.forEach((r, idx) => {
    const cur = state.disp.has(r.e.name) ? state.disp.get(r.e.name)! : idx;
    state.disp.set(r.e.name, cur + (idx - cur) * kRank);
  });
  const targetMax = Math.max(1e-6, visible.length ? visible[0].v : 1);
  state.max = state.init ? state.max + (targetMax - state.max) * kMax : targetMax;
  const maxV = Math.max(1e-6, state.max);
  state.lastEl = el;
  state.init = true;

  const { ev, idx: evIdx } = activeEvent(race, curT);
  if (evIdx !== state.evIdx) {
    state.evIdx = evIdx;
    state.evChange = el;
  }
  const evAlpha = clamp01((el - state.evChange) / 0.45);

  drawCertificateBg(ctx, W, H);

  const padX = W * (vertical ? 0.045 : 0.035);
  const titleY = H * (vertical ? 0.06 : 0.085);
  const plotTop = H * (vertical ? 0.16 : 0.21);
  const plotBottom = H * (vertical ? 0.6 : 0.9);
  const plotLeft = padX;
  const plotRight = vertical ? W - padX : W * 0.66;
  const panelX = vertical ? padX : W * 0.675;
  const panelY = vertical ? H * 0.63 : H * 0.17;
  const panelW = vertical ? W - 2 * padX : W * 0.965 - panelX;
  const panelH = vertical ? H * 0.32 : H * 0.9 - H * 0.17;

  // header (same as the other designs)
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const titlePx = fitText(ctx, race.title, min * (vertical ? 0.055 : 0.05), 800, plotRight - padX);
  ctx.fillStyle = INK;
  ctx.fillText(race.title, padX, titleY);
  if (race.subtitle) {
    const subPx = min * (vertical ? 0.03 : 0.026);
    const subLines = wrapLines(ctx, race.subtitle, subPx, 700, plotRight - padX, 2);
    setFont(ctx, subPx, 700);
    ctx.fillStyle = SEAL;
    let sy = titleY + titlePx * 0.72;
    for (const ln of subLines) {
      ctx.fillText(ln, padX, sy);
      sy += subPx * 1.08;
    }
  }

  // ── columns ──
  const regL = plotLeft;
  const regR = plotRight;
  const regT = plotTop;
  const regB = plotBottom;
  const regW = regR - regL;
  const regH = regB - regT;
  const nameZoneH = regH * 0.12; // names below the baseline
  const baselineY = regB - nameZoneH;
  const topZoneH = regH * 0.22; // avatar + value above each column top
  const maxColH = Math.max(20, baselineY - regT - topZoneH);
  const slotW = regW / N;
  const colW = Math.min(slotW * 0.62, regH * 0.13);
  const colX = (rank: number) => regL + (rank + 0.5) * slotW;
  const avatarR = Math.min(colW * 0.6, topZoneH * 0.42);

  // ground baseline
  ctx.strokeStyle = "rgba(44,40,35,0.18)";
  ctx.lineWidth = Math.max(1.5, regH * 0.005);
  ctx.beginPath();
  ctx.moveTo(regL, baselineY);
  ctx.lineTo(regR, baselineY);
  ctx.stroke();

  // columns — non-leaders first so the leader (glow) sits on top during slides
  for (let vi = visible.length - 1; vi >= 0; vi--) {
    const r = visible[vi];
    const nm = r.e.name;
    const cx = colX(Math.min(state.disp.get(nm) ?? vi, N - 1));
    const colH = Math.max(colW * 0.5, clamp01(r.v / maxV) * maxColH);
    const colTop = baselineY - colH;
    const left = cx - colW / 2;

    // column body (solid colour) with a soft drop shadow + a top gloss
    ctx.save();
    if (vi === 0) {
      ctx.shadowColor = rgbaOf(r.e.color, 0.5);
      ctx.shadowBlur = colW * 0.5;
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.16)";
      ctx.shadowBlur = colW * 0.18;
      ctx.shadowOffsetY = colW * 0.06;
    }
    columnPath(ctx, left, colTop, colW, colH, colW * 0.22);
    ctx.fillStyle = r.e.color;
    ctx.fill();
    ctx.restore();
    columnPath(ctx, left, colTop, colW, colH, colW * 0.22); // re-path for the gloss (no shadow)
    const gl = ctx.createLinearGradient(0, colTop, 0, colTop + Math.min(colH, maxColH * 0.5));
    gl.addColorStop(0, "rgba(255,255,255,0.34)");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl;
    ctx.fill();

    // avatar perched on top of the column
    const ay = colTop - avatarR - colW * 0.12;
    drawEntityAvatar(ctx, r.e, cx, ay, avatarR);

    // value above the avatar
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = SEAL;
    setFont(ctx, fitText(ctx, fmtValueCompact(r.v, race), Math.min(avatarR * 0.95, slotW * 0.3), 800, slotW * 0.96), 800);
    ctx.fillText(fmtValueCompact(r.v, race), cx, ay - avatarR - avatarR * 0.2);

    // name below the baseline
    ctx.fillStyle = INK;
    setFont(ctx, fitText(ctx, nm, Math.min(nameZoneH * 0.42, slotW * 0.2), 800, slotW * 0.96), 800);
    ctx.fillText(nm, cx, baselineY + nameZoneH * 0.5);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  drawStoryPanel(ctx, panelX, panelY, panelW, panelH, race, curT, ev, evAlpha, vertical);
  if (race.source) {
    setFont(ctx, min * 0.026, 700);
    ctx.fillStyle = "rgba(44,40,35,0.45)";
    ctx.fillText(`Source: ${race.source}`, padX, H * 0.975);
  }
  drawBrandBadge(ctx, W - padX, H * 0.965, min * 0.034);
}

/** The available visual styles for a stat battle (same data, different look). */
export type RaceStyle = "bars" | "bubbles" | "trail" | "podium" | "race" | "columns";
export const RACE_STYLES: { id: RaceStyle; label: string }[] = [
  { id: "bars", label: "Bars" },
  { id: "bubbles", label: "Bubbles" },
  { id: "trail", label: "Trail" },
  { id: "podium", label: "Podium" },
  { id: "race", label: "Race" },
  { id: "columns", label: "Columns" },
];
/** Draw one race frame in the chosen visual style. */
export function drawRaceStyle(ctx: CanvasRenderingContext2D, W: number, H: number, race: RaceData, state: RaceState, el: number, style: RaceStyle = "bars") {
  if (style === "bubbles") drawRaceBubbles(ctx, W, H, race, state, el);
  else if (style === "trail") drawRaceBump(ctx, W, H, race, state, el);
  else if (style === "podium") drawRacePodium(ctx, W, H, race, state, el);
  else if (style === "race") drawRaceLanes(ctx, W, H, race, state, el);
  else if (style === "columns") drawRaceColumns(ctx, W, H, race, state, el);
  else drawRaceFrame(ctx, W, H, race, state, el);
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

/* The "Stat Battle" brand mark — a bar-chart glyph that matches the lucide
 * BarChart3 icon used on the data sheet. Drawn in a square box at (x, y, size). */
function drawBarsIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  const u = s / 24;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // L-shaped axis (M3 3 v18 h18)
  ctx.lineWidth = 2.1 * u;
  ctx.beginPath();
  ctx.moveTo(x + 3 * u, y + 3 * u);
  ctx.lineTo(x + 3 * u, y + 21 * u);
  ctx.lineTo(x + 21 * u, y + 21 * u);
  ctx.stroke();
  // three ascending bars (thick rounded strokes), like BarChart3
  ctx.lineWidth = 3 * u;
  const bar = (bx: number, topY: number) => {
    ctx.beginPath();
    ctx.moveTo(x + bx * u, y + 17 * u);
    ctx.lineTo(x + bx * u, y + topY * u);
    ctx.stroke();
  };
  bar(8, 14);
  bar(13, 5);
  bar(18, 9);
  ctx.restore();
}

/* The "Stat Battle" logo lockup (bar-chart mark + wordmark), centered at
 * (cx, cy). h = wordmark cap height; the mark scales with it. */
function drawStatBattleLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number) {
  const word = "Stat Battle";
  setFont(ctx, h, 800);
  const ww = ctx.measureText(word).width;
  const iconS = h * 1.2;
  const gap = h * 0.4;
  const total = iconS + gap + ww;
  let x = cx - total / 2;
  drawBarsIcon(ctx, x, cy - iconS / 2, iconS, SEAL);
  x += iconS + gap;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(word, x, cy);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
}

/* ── Isaac's closing screen — the Stat Battle logo paired with clunoid.com ─────
 * The voice-over is a single PRE-RECORDED clip (public/stat-outro.mp3, Isaac
 * saying "Made on clunoid dot com. Make your own.") reused for every outro, so
 * we never call TTS per video. Re-record with scripts/genoutro.mjs if the line
 * changes. */
function drawStatOutro(ctx: CanvasRenderingContext2D, W: number, H: number, p: number) {
  drawCertificateBg(ctx, W, H);
  ctx.globalAlpha = clamp01(p * 3);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Everything is anchored to the hero's size (heroPx), NOT fixed H-fractions,
  // so the lockup keeps its spacing in BOTH portrait (9:16) and landscape (16:9)
  // — where H, but not min, shrinks. fitText also caps each line to the width.
  const heroPx = fitText(ctx, "clunoid.com", Math.min(W, H) * 0.155, 800, W * 0.9);
  const cy = H * 0.52;
  const small = heroPx * 0.3;

  // Stat Battle logo lockup (mark + wordmark), centered above the hero.
  drawStatBattleLogo(ctx, W / 2, cy - heroPx * 1.2, heroPx * 0.4);

  // hero "clunoid.com" — the dominant element, with a gentle pop-in.
  const sc = 0.9 + 0.1 * clamp01(p * 3);
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.scale(sc, sc);
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = heroPx * 0.06;
  ctx.shadowOffsetY = heroPx * 0.04;
  ctx.fillStyle = SEAL;
  setFont(ctx, heroPx, 800);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("clunoid.com", 0, 0);
  ctx.restore();

  // "Make your own" subline (matches the voice-over) — fit so it never overruns.
  const subPx = fitText(ctx, "Make your own", small, 700, W * 0.9);
  setFont(ctx, subPx, 700);
  ctx.fillStyle = "rgba(44,40,35,0.72)";
  ctx.textAlign = "center";
  ctx.fillText("Make your own", W / 2, cy + heroPx * 0.86);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

/* ── FALLBACK exporter — real-time canvas recording (MediaRecorder + captureStream).
 *    Used only when the WebCodecs path below isn't available. NOTE: this path is
 *    tab-focus-dependent: browsers throttle requestAnimationFrame to ~0fps while the
 *    tab is hidden/minimised, so the recording stalls. The WebCodecs path avoids
 *    that entirely; ShareModal shows a "keep this tab open" warning for this one. ─── */
async function renderRaceVideoRec(
  race: RaceData,
  aspect: ReelAspect,
  opts: { host?: HTMLElement | null; onProgress?: (p: number, l: string) => void; signal?: AbortSignal; style?: RaceStyle }
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
  drawRaceStyle(ctx, W, H, race, state, 0, opts.style);

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
        if (el < raceEnd) drawRaceStyle(ctx, W, H, race, state, Math.min(el, race.durationSec), opts.style);
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

/* ── WebCodecs feature gate + codec pick ──────────────────────────────────────
 *  The recording-free path needs the full WebCodecs surface (video + audio
 *  encoders + the frame/data wrappers) AND a usable H.264 profile for the size. */
type WC = typeof globalThis & {
  VideoEncoder?: typeof VideoEncoder;
  AudioEncoder?: typeof AudioEncoder;
  VideoFrame?: typeof VideoFrame;
  AudioData?: typeof AudioData;
};
function hasWebCodecs(): boolean {
  if (typeof window === "undefined") return false;
  const g = globalThis as WC;
  return !!(g.VideoEncoder && g.AudioEncoder && g.VideoFrame && g.AudioData);
}
async function pickAvcCodec(W: number, H: number): Promise<string | null> {
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
async function aacSupported(sampleRate: number, channels: number): Promise<boolean> {
  try {
    const r = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate: 128_000 });
    return !!r.supported;
  } catch {
    return false;
  }
}

/* ── RECORDING-FREE exporter (WebCodecs) ──────────────────────────────────────
 *  Renders and ENCODES each frame programmatically — faster than real time and
 *  NOT driven by requestAnimationFrame / captureStream, so it keeps running even
 *  if the user switches tabs or minimises the window (the bug this fixes). Output
 *  is a real MP4 (H.264 + AAC). Throws if WebCodecs/H.264/AAC isn't usable so the
 *  caller can fall back to renderRaceVideoRec. */
async function renderRaceVideoWeb(
  race: RaceData,
  aspect: ReelAspect,
  opts: { host?: HTMLElement | null; onProgress?: (p: number, l: string) => void; signal?: AbortSignal; style?: RaceStyle }
): Promise<RenderResult> {
  const { w: W, h: H } = aspectSize(aspect);
  const FPS = 30;

  const avc = await pickAvcCodec(W, H);
  if (!avc) throw new Error("no H.264 config");

  opts.onProgress?.(4, "Loading media…");
  // Isaac's pre-recorded outro voice + fonts + bar/event images, loaded up front.
  let outroBuf: AudioBuffer | null = null;
  const ACtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new ACtor();
  try {
    const [, , resp] = await Promise.all([
      document.fonts.load('800 120px "Baloo 2"'),
      preloadRaceImages(race),
      fetch("/stat-outro.mp3").catch(() => null),
    ]);
    if (resp?.ok) outroBuf = await ac.decodeAudioData(await resp.arrayBuffer());
  } catch {
    /* fonts / images / voice all optional */
  }

  const channels = outroBuf ? Math.min(2, outroBuf.numberOfChannels) : 1;
  const sampleRate = outroBuf ? outroBuf.sampleRate : 48000;
  const wantAudio = !!outroBuf && (await aacSupported(sampleRate, channels));

  // A standalone canvas we draw + grab frames from (also shown in the host as a
  // live preview). Hidden tabs throttle compositing, not 2D draws / VideoFrame.
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = "display:block;max-width:100%;max-height:100%;margin:0 auto;border-radius:14px";
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    try {
      await ac.close();
    } catch {
      /* ignore */
    }
    throw new Error("Canvas 2D not supported");
  }
  if (opts.host) {
    opts.host.innerHTML = "";
    opts.host.appendChild(canvas);
  }

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    video: { codec: "avc", width: W, height: H, frameRate: FPS },
    ...(wantAudio ? { audio: { codec: "aac" as const, numberOfChannels: channels, sampleRate } } : {}),
  });

  let encErr: unknown = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encErr = e;
    },
  });
  venc.configure({ codec: avc, width: W, height: H, bitrate: 9_000_000, framerate: FPS, latencyMode: "quality" });

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

  const raceEnd = race.durationSec + END_HOLD;
  const outroDur = outroBuf ? outroBuf.duration + 1.0 : 3.5;
  const total = raceEnd + outroDur;
  const totalFrames = Math.ceil(total * FPS);
  const usPerFrame = 1e6 / FPS;
  const state = newRaceState();

  const cleanup = async () => {
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
    try {
      await ac.close();
    } catch {
      /* ignore */
    }
  };
  const checkAbort = () => {
    if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (encErr) throw encErr instanceof Error ? encErr : new Error("encode error");
  };

  try {
    // ── VIDEO — deterministic, faster-than-real-time. flush() every ~2s both
    //    bounds memory and drains the queue without rAF/timers (so a hidden tab
    //    can't stall it). ──
    opts.onProgress?.(6, "Encoding in the background…");
    for (let f = 0; f < totalFrames; f++) {
      checkAbort();
      const el = f / FPS;
      if (el < raceEnd) drawRaceFrame(ctx, W, H, race, state, Math.min(el, race.durationSec));
      else drawStatOutro(ctx, W, H, (el - raceEnd) / outroDur);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(f * usPerFrame), duration: Math.round(usPerFrame) });
      venc.encode(frame);
      frame.close();
      if ((f + 1) % (FPS * 2) === 0) {
        await venc.flush();
        opts.onProgress?.(Math.min(wantAudio ? 86 : 96, 6 + Math.round((f / totalFrames) * (wantAudio ? 80 : 90))), "Encoding in the background…");
      }
    }
    await venc.flush();
    checkAbort();

    // ── AUDIO — silent through the race, Isaac's outro at the end. Built as
    //    f32-planar AudioData chunks and AAC-encoded. ──
    if (aenc && outroBuf) {
      opts.onProgress?.(90, "Encoding in the background…");
      const totalSamples = Math.ceil(total * sampleRate);
      const outroStart = Math.round((raceEnd + 0.3) * sampleRate);
      const outroCh: Float32Array[] = [];
      for (let c = 0; c < channels; c++) outroCh.push(outroBuf.getChannelData(Math.min(c, outroBuf.numberOfChannels - 1)));
      const CHUNK = 4096;
      for (let off = 0; off < totalSamples; off += CHUNK) {
        checkAbort();
        const n = Math.min(CHUNK, totalSamples - off);
        const data = new Float32Array(n * channels); // planar: [ch0…][ch1…]
        for (let c = 0; c < channels; c++) {
          const src = outroCh[c];
          for (let i = 0; i < n; i++) {
            const oi = off + i - outroStart;
            if (oi >= 0 && oi < src.length) data[c * n + i] = src[oi];
          }
        }
        const adata = new AudioData({ format: "f32-planar", sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((off / sampleRate) * 1e6), data });
        aenc.encode(adata);
        adata.close();
        if ((off / CHUNK) % 16 === 15) await aenc.flush();
      }
      await aenc.flush();
      checkAbort();
    }

    muxer.finalize();
    await cleanup();
    const blob = new Blob([target.buffer], { type: "video/mp4" });
    if (!blob.size) throw new Error("empty output");
    opts.onProgress?.(100, "Done");
    return { blob, ext: "mp4", mime: "video/mp4", hadVoice: !!outroBuf };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

/* ── Public exporter: prefer the recording-free WebCodecs path (background-safe),
 *    fall back to real-time recording when WebCodecs/H.264/AAC isn't available. ── */
export async function renderRaceVideo(
  race: RaceData,
  aspect: ReelAspect,
  opts: { host?: HTMLElement | null; onProgress?: (p: number, l: string) => void; signal?: AbortSignal; style?: RaceStyle }
): Promise<RenderResult> {
  if (hasWebCodecs()) {
    try {
      return await renderRaceVideoWeb(race, aspect, opts);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e; // user cancelled — don't restart
      console.warn("[stats] WebCodecs export unavailable, falling back to recording:", e);
    }
  }
  return renderRaceVideoRec(race, aspect, opts);
}
