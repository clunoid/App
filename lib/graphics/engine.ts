"use client";

/**
 * THE MOTION ENGINE — deterministic canvas renderer for a MotionSpec. Every frame is a
 * pure function of (spec, timing, assets, t), so the WebCodecs exporter can render
 * faster than real time and the result is identical every run. Visual language:
 * modern SaaS/tech explainer — kinetic typography, stroked vector icons, animated UI
 * mockups, charts, counters, timelines, soft-gradient backgrounds, professional easing,
 * gentle camera drift, word-synced captions.
 */
import type { MotionSpec, MotionScene, MotionElement, CaptionWord } from "./spec";
import { iconNode, drawIcon } from "./icons";

/* ── timing ───────────────────────────────────────────────────────────────── */
export type MotionTiming = { sceneDurs: number[]; sceneStarts: number[]; endCard: number; total: number };
const TRANS = 0.7; // cross-transition length (straddles the boundary)

export function computeMotionTiming(spec: MotionSpec, narrations: (AudioBuffer | null)[], branded: boolean): MotionTiming {
  const sceneDurs = spec.scenes.map((s, i) => {
    const audio = narrations[i]?.duration ?? 0;
    // a scene lasts as long as its narration + settle room; unvoiced scenes pace by content
    const base = audio > 0 ? audio + 1.0 : 3.2 + Math.min(3, (s.elements?.length || 0)) * 0.9;
    return Math.max(3.4, base);
  });
  const sceneStarts: number[] = [];
  let acc = 0;
  for (const d of sceneDurs) {
    sceneStarts.push(acc);
    acc += d;
  }
  const endCard = branded ? 2.2 : 0;
  return { sceneDurs, sceneStarts, endCard, total: acc + endCard };
}

/* ── deterministic rng (per scene, so backgrounds are stable per frame) ───── */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── easing (the polish lives here) ───────────────────────────────────────── */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const outExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(t)));
const outCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const outBack = (t: number) => {
  const c = 1.70158 * 1.2;
  const x = clamp01(t) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const inOut = (t: number) => (clamp01(t) < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** progress of a sub-animation starting at `at` lasting `dur` within scene time sc */
const seg = (sc: number, at: number, dur: number) => clamp01((sc - at) / Math.max(0.001, dur));

/* ── palette ──────────────────────────────────────────────────────────────── */
export type Pal = {
  dark: boolean;
  bg0: string; bg1: string;
  ink: string; muted: string; faint: string;
  accent: string; accent2: string; accentSoft: string;
  surface: string; surface2: string; line: string;
  good: string; bad: string;
};
export function makePalette(spec: MotionSpec): Pal {
  const h = spec.style.hue ?? 250;
  const h2 = spec.style.hue2 ?? (h + 40) % 360;
  const dark = spec.style.theme !== "light";
  if (dark) {
    return {
      dark, bg0: `hsl(${h}, 42%, 8%)`, bg1: `hsl(${h2}, 45%, 13%)`,
      ink: "#f5f6fa", muted: "rgba(235,238,248,0.66)", faint: "rgba(235,238,248,0.38)",
      accent: `hsl(${h}, 92%, 64%)`, accent2: `hsl(${h2}, 88%, 60%)`, accentSoft: `hsla(${h}, 92%, 64%, 0.16)`,
      surface: "rgba(255,255,255,0.055)", surface2: "rgba(255,255,255,0.10)", line: "rgba(255,255,255,0.10)",
      good: "hsl(150, 70%, 55%)", bad: "hsl(0, 78%, 64%)",
    };
  }
  return {
    dark, bg0: `hsl(${h}, 40%, 98%)`, bg1: `hsl(${h2}, 55%, 94%)`,
    ink: "#161821", muted: "rgba(22,24,33,0.66)", faint: "rgba(22,24,33,0.4)",
    accent: `hsl(${h}, 85%, 52%)`, accent2: `hsl(${h2}, 80%, 50%)`, accentSoft: `hsla(${h}, 85%, 52%, 0.12)`,
    surface: "rgba(22,24,33,0.045)", surface2: "rgba(22,24,33,0.08)", line: "rgba(22,24,33,0.10)",
    good: "hsl(150, 65%, 40%)", bad: "hsl(0, 70%, 52%)",
  };
}

/* ── fonts: reuse the app's already-loaded Inter (next/font hashes the family name,
 *    so we resolve the REAL runtime family from the body once) ─────────────── */
let FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export function resolveMotionFont(): void {
  try {
    const f = getComputedStyle(document.body).fontFamily;
    if (f && f.length > 3) FAMILY = f;
  } catch {
    /* keep fallback */
  }
}
function setFont(ctx: CanvasRenderingContext2D, px: number, weight = 800) {
  ctx.font = `${weight} ${Math.max(1, Math.round(px))}px ${FAMILY}`;
}

/* ── small helpers ────────────────────────────────────────────────────────── */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
function wrap(ctx: CanvasRenderingContext2D, text: string, px: number, weight: number, maxW: number, maxLines: number): string[] {
  setFont(ctx, px, weight);
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else line = t;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxW && last.length > 1) last = last.slice(0, -1);
    if (last !== lines[maxLines - 1]) lines[maxLines - 1] = last.replace(/\s+\S*$/, "") + "…";
  }
  return lines;
}
function fitPx(ctx: CanvasRenderingContext2D, text: string, px: number, weight: number, maxW: number): number {
  let p = px;
  setFont(ctx, p, weight);
  while (ctx.measureText(text).width > maxW && p > 9) {
    p *= 0.94;
    setFont(ctx, p, weight);
  }
  return p;
}
const fmtNum = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(abs >= 1e10 ? 0 : 1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + "M";
  if (abs >= 1e4) return Math.round(n / 1e3) + "K";
  return Math.round(n).toLocaleString();
};

/* ── backgrounds ──────────────────────────────────────────────────────────── */
function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, pal: Pal, flavor: string, t: number, seed: number, energy: number) {
  const g = ctx.createLinearGradient(0, 0, W * 0.9, H);
  g.addColorStop(0, pal.bg0);
  g.addColorStop(1, pal.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const min = Math.min(W, H);
  const rng = mulberry(seed * 7919 + 13);
  ctx.save();
  if (flavor === "dots") {
    ctx.fillStyle = pal.dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    const step = min * 0.055;
    const drift = (t * energy * 6) % step;
    for (let y = -step; y < H + step; y += step)
      for (let x = -step; x < W + step; x += step) {
        ctx.beginPath();
        ctx.arc(x + drift * 0.4, y + drift * 0.2, min * 0.0035, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (flavor === "grid") {
    ctx.strokeStyle = pal.dark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)";
    ctx.lineWidth = 1;
    const step = min * 0.085;
    const off = (t * energy * 4) % step;
    ctx.beginPath();
    for (let x = -step + off; x < W + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = -step + off * 0.6; y < H + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  } else if (flavor === "waves") {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const baseY = H * (0.62 + i * 0.14);
      const amp = min * (0.03 + i * 0.012);
      for (let x = 0; x <= W; x += 8) {
        const y = baseY + Math.sin(x / (min * 0.28) + t * energy * (0.5 + i * 0.2) + i * 2) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = i === 2 ? pal.accentSoft : pal.dark ? `rgba(255,255,255,${0.03 - i * 0.008})` : `rgba(0,0,0,${0.03 - i * 0.008})`;
      ctx.fill();
    }
  } else if (flavor === "blobs") {
    for (let i = 0; i < 3; i++) {
      const bx = W * (0.15 + rng() * 0.7) + Math.sin(t * energy * 0.3 + i * 2.1) * min * 0.05;
      const by = H * (0.15 + rng() * 0.7) + Math.cos(t * energy * 0.24 + i * 1.7) * min * 0.05;
      const r = min * (0.22 + rng() * 0.16);
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      const col = i === 0 ? pal.accent : pal.accent2;
      bg.addColorStop(0, col.replace(")", ", 0.10)").replace("hsl", "hsla"));
      bg.addColorStop(1, col.replace(")", ", 0)").replace("hsl", "hsla"));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }
  } else if (flavor === "beams") {
    ctx.globalAlpha = pal.dark ? 0.1 : 0.07;
    for (let i = 0; i < 4; i++) {
      const bx = W * (0.1 + i * 0.26) + Math.sin(t * energy * 0.2 + i) * W * 0.02;
      const bw = min * (0.05 + (i % 2) * 0.03);
      const bg = ctx.createLinearGradient(bx, 0, bx + H * 0.35, H);
      bg.addColorStop(0, i % 2 ? pal.accent2 : pal.accent);
      bg.addColorStop(1, "transparent");
      ctx.fillStyle = bg;
      ctx.save();
      ctx.translate(bx, 0);
      ctx.rotate(0.32);
      ctx.fillRect(0, -H * 0.2, bw, H * 1.8);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // soft vignette for depth
  const v = ctx.createRadialGradient(W / 2, H * 0.42, min * 0.25, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, pal.dark ? "rgba(0,0,0,0.34)" : "rgba(30,30,50,0.10)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/* ── kinetic headline + kicker ────────────────────────────────────────────── */
function drawHeadline(ctx: CanvasRenderingContext2D, scene: MotionScene, pal: Pal, x: number, y: number, w: number, sc: number, align: "left" | "center", basePx: number): number {
  let cy = y;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = align;
  const ax = align === "center" ? x + w / 2 : x;
  if (scene.kicker) {
    const kp = seg(sc, 0.05, 0.5);
    if (kp > 0) {
      const px = basePx * 0.24;
      setFont(ctx, px, 800);
      ctx.globalAlpha = outCubic(kp);
      const kx = ax + (align === "left" ? (1 - outExpo(kp)) * -px : 0);
      // accent tick + spaced uppercase eyebrow
      ctx.fillStyle = pal.accent;
      const kw = ctx.measureText(scene.kicker.toUpperCase()).width;
      if (align === "left") ctx.fillRect(x, cy - px * 0.78, px * 0.22, px * 0.95);
      else ctx.fillRect(ax - kw / 2 - px * 0.7, cy - px * 0.78, px * 0.22, px * 0.95);
      ctx.fillStyle = pal.muted;
      ctx.fillText(scene.kicker.toUpperCase(), kx + (align === "left" ? px * 0.55 : 0), cy);
      ctx.globalAlpha = 1;
    }
    cy += basePx * 0.52;
  }
  if (!scene.headline) return cy;
  const lines = wrap(ctx, scene.headline, basePx, 900, w, 3);
  const lh = basePx * 1.12;
  let wordIdx = 0;
  for (const line of lines) {
    const words = line.split(" ");
    setFont(ctx, basePx, 900);
    const lineW = ctx.measureText(line).width;
    let wx = align === "center" ? ax - lineW / 2 : x;
    const spaceW = ctx.measureText(" ").width;
    for (const word of words) {
      const p = seg(sc, 0.14 + wordIdx * 0.085, 0.62);
      if (p > 0) {
        const e = outExpo(p);
        ctx.globalAlpha = e;
        // the LAST word gets the accent (classic SaaS two-tone headline)
        const isLast = wordIdx === scene.headline.split(/\s+/).length - 1;
        ctx.fillStyle = isLast ? pal.accent : pal.ink;
        ctx.save();
        ctx.textAlign = "left";
        ctx.translate(wx, cy + (1 - e) * basePx * 0.55);
        ctx.fillText(word, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      wx += ctx.measureText(word).width + spaceW;
      wordIdx++;
    }
    cy += lh;
  }
  ctx.textAlign = "left";
  return cy;
}

/* ── element drawers (each draws into rect r with scene-local time sc) ────── */
type Rect = { x: number; y: number; w: number; h: number };

function tileBg(ctx: CanvasRenderingContext2D, pal: Pal, r: Rect, rad: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = rad * 0.8;
  ctx.shadowOffsetY = rad * 0.22;
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = pal.dark ? "rgba(20,22,34,0.72)" : "rgba(255,255,255,0.9)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = Math.max(1, rad * 0.05);
  ctx.stroke();
  ctx.restore();
}

function drawIconHero(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number) {
  const node = iconNode(el.icon) || iconNode("sparkles")!;
  const p = seg(sc, at, 0.7);
  if (p <= 0) return;
  const min = Math.min(r.w, r.h);
  const size = min * 0.62;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const e = outBack(p);
  const floatY = el.emphasis === "float" || !el.emphasis ? Math.sin(sc * 1.6) * min * 0.012 : 0;
  ctx.save();
  ctx.translate(cx, cy + floatY);
  ctx.scale(e, e);
  // glow ring + soft tile
  const ringR = size * 0.78;
  const glow = ctx.createRadialGradient(0, 0, ringR * 0.3, 0, 0, ringR * 1.5);
  glow.addColorStop(0, pal.accentSoft);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, ringR * 1.5, 0, Math.PI * 2);
  ctx.fill();
  rr(ctx, -size * 0.72, -size * 0.72, size * 1.44, size * 1.44, size * 0.34);
  ctx.fillStyle = pal.dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = Math.max(1.5, size * 0.02);
  ctx.stroke();
  drawIcon(ctx, node, 0, 0, size, el.accent === false ? pal.ink : pal.accent, seg(sc, at + 0.1, 0.8));
  ctx.restore();
  // label under the tile
  if (el.text) {
    const tp = seg(sc, at + 0.35, 0.5);
    if (tp > 0) {
      ctx.globalAlpha = outCubic(tp);
      ctx.textAlign = "center";
      setFont(ctx, min * 0.085, 800);
      ctx.fillStyle = pal.ink;
      ctx.fillText(el.text, cx, cy + size * 0.72 + min * 0.16 + (1 - outExpo(tp)) * min * 0.03);
      if (el.sub) {
        setFont(ctx, min * 0.055, 600);
        ctx.fillStyle = pal.muted;
        ctx.fillText(el.sub, cx, cy + size * 0.72 + min * 0.25);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
  }
}

function drawIconGrid(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number, vertical: boolean) {
  const items = el.items || [];
  const n = Math.max(1, items.length);
  const cols = vertical ? Math.min(2, n) : Math.min(3, n);
  const rows = Math.ceil(n / cols);
  const cw = r.w / cols;
  const ch = r.h / rows;
  for (let i = 0; i < n; i++) {
    const p = seg(sc, at + i * 0.16, 0.6);
    if (p <= 0) continue;
    const cx = r.x + (i % cols) * cw + cw / 2;
    const cy = r.y + Math.floor(i / cols) * ch + ch / 2;
    const s = Math.min(cw, ch);
    const tile = s * 0.44;
    const e = outBack(p);
    ctx.save();
    ctx.translate(cx, cy - s * 0.1);
    ctx.scale(e, e);
    rr(ctx, -tile / 2, -tile / 2, tile, tile, tile * 0.3);
    ctx.fillStyle = i === (el.items?.length ?? 0) - 1 && el.accent ? pal.accentSoft : pal.dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.95)";
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.stroke();
    const node = iconNode(el.icons?.[i]) || iconNode("check-circle")!;
    drawIcon(ctx, node, 0, 0, tile * 0.56, pal.accent, 1);
    ctx.restore();
    ctx.globalAlpha = outCubic(p);
    ctx.textAlign = "center";
    setFont(ctx, s * 0.085, 700);
    ctx.fillStyle = pal.muted;
    const lbl = wrap(ctx, items[i], s * 0.085, 700, cw * 0.9, 2);
    lbl.forEach((ln, li) => ctx.fillText(ln, cx, cy + tile * 0.62 + s * 0.06 + li * s * 0.105));
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number) {
  const items = el.items || [];
  if (!items.length) return; // an empty list must not draw a ghost row
  const n = items.length;
  const rowH = Math.min(r.h / n, r.w * 0.14);
  const px = rowH * 0.34;
  for (let i = 0; i < n; i++) {
    const p = seg(sc, at + i * 0.22, 0.55);
    if (p <= 0) continue;
    const e = outExpo(p);
    const y = r.y + i * rowH + rowH / 2;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate((1 - e) * -r.w * 0.06, 0);
    const tick = rowH * 0.52;
    rr(ctx, r.x, y - tick / 2, tick, tick, tick * 0.3);
    ctx.fillStyle = pal.accentSoft;
    ctx.fill();
    const node = iconNode(el.icon) || iconNode("check-circle")!;
    drawIcon(ctx, node, r.x + tick / 2, y, tick * 0.6, pal.accent, 1);
    ctx.fillStyle = pal.ink;
    ctx.textBaseline = "middle";
    const maxW = r.w - tick - px * 1.2;
    setFont(ctx, fitPx(ctx, items[i], px, 700, maxW), 700);
    ctx.fillText(items[i], r.x + tick + px * 0.8, y);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
}

function drawChart(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number) {
  const c = el.chart;
  if (!c || !c.values.length) return;
  const p = seg(sc, at, 1.1);
  if (p <= 0) return;
  const pad = Math.min(r.w, r.h) * 0.1;
  const box: Rect = { x: r.x, y: r.y, w: r.w, h: r.h };
  tileBg(ctx, pal, box, pad * 0.7, outCubic(seg(sc, at, 0.4)));
  const inX = box.x + pad * 1.2;
  const inY = box.y + pad;
  const inW = box.w - pad * 2.4;
  const inH = box.h - pad * 2.2;
  const maxV = Math.max(...c.values, 1e-9);
  const n = c.values.length;
  ctx.save();
  if (c.kind === "donut") {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const R = Math.min(inW, inH) * 0.38;
    const lw = R * 0.42;
    const total = c.values.reduce((a, b) => a + b, 0) || 1;
    let a0 = -Math.PI / 2;
    const sweep = outCubic(seg(sc, at + 0.15, 1.0)) * Math.PI * 2;
    const hi = Math.min(Math.max(0, c.highlight ?? 0), n - 1); // clamp — an out-of-range highlight must never NaN
    for (let i = 0; i < n; i++) {
      const frac = (c.values[i] / total) * Math.PI * 2;
      const a1 = a0 + Math.min(frac, Math.max(0, sweep - (a0 + Math.PI / 2)));
      // Stroke only when the PADDED arc is still forward — end < start makes canvas
      // draw the complementary ~full circle (a giant ring over the whole donut).
      const s0 = a0 + 0.02;
      const s1 = a1 - 0.02;
      if (s1 > s0) {
        ctx.beginPath();
        ctx.strokeStyle = i === hi ? pal.accent : `hsla(${(200 + i * 42) % 360}, 60%, ${pal.dark ? 62 : 48}%, 0.55)`;
        ctx.lineWidth = lw;
        ctx.arc(cx, cy, R, s0, s1);
        ctx.stroke();
      }
      a0 += frac;
    }
    const pct = Math.round((c.values[hi] / total) * 100 * outCubic(seg(sc, at + 0.3, 1.0)));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setFont(ctx, R * 0.52, 900);
    ctx.fillStyle = pal.ink;
    ctx.fillText(`${pct}%`, cx, cy - R * 0.05);
    setFont(ctx, R * 0.17, 700);
    ctx.fillStyle = pal.muted;
    ctx.fillText(c.labels[hi] || "", cx, cy + R * 0.3);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  } else if (c.kind === "bar") {
    const gap = inW / n * 0.3;
    const bw = (inW - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const bp = outCubic(seg(sc, at + 0.15 + i * 0.09, 0.7));
      const h = (c.values[i] / maxV) * inH * 0.92 * bp;
      const x = inX + i * (bw + gap);
      const y = inY + inH - h;
      rr(ctx, x, y, bw, h, Math.min(bw * 0.24, 10));
      ctx.fillStyle = i === c.highlight ? pal.accent : pal.dark ? "rgba(255,255,255,0.22)" : "rgba(22,24,33,0.22)";
      ctx.fill();
      ctx.globalAlpha = bp;
      ctx.textAlign = "center";
      setFont(ctx, Math.min(bw * 0.34, inH * 0.09), 700);
      ctx.fillStyle = pal.muted;
      ctx.fillText(c.labels[i] || "", x + bw / 2, inY + inH + pad * 0.72);
      if (i === c.highlight) {
        setFont(ctx, Math.min(bw * 0.4, inH * 0.11), 900);
        ctx.fillStyle = pal.ink;
        ctx.fillText(fmtNum(c.values[i]), x + bw / 2, y - pad * 0.3);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
  } else {
    // line / area — dash-draw the path left→right
    const pts = c.values.map((v, i) => ({ x: inX + (i / Math.max(1, n - 1)) * inW, y: inY + inH - (v / maxV) * inH * 0.9 }));
    const dp = outCubic(seg(sc, at + 0.15, 1.1));
    const upto = Math.max(1, Math.ceil(dp * (pts.length - 1)) + 1);
    ctx.beginPath();
    pts.slice(0, upto).forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    if (c.kind === "area") {
      const grad = ctx.createLinearGradient(0, inY, 0, inY + inH);
      grad.addColorStop(0, pal.accentSoft);
      grad.addColorStop(1, "transparent");
      ctx.save();
      ctx.lineTo(pts[Math.min(upto, pts.length) - 1].x, inY + inH);
      ctx.lineTo(inX, inY + inH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      pts.slice(0, upto).forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    }
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = Math.max(2, inH * 0.02);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    const last = pts[Math.min(upto, pts.length) - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, inH * 0.028, 0, Math.PI * 2);
    ctx.fillStyle = pal.accent;
    ctx.fill();
  }
  ctx.restore();
}

function drawCounter(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number) {
  const p = seg(sc, at, 1.3);
  if (p <= 0) return;
  const v = (el.value ?? 100) * outExpo(seg(sc, at, 1.25));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const big = `${el.prefix || ""}${fmtNum(v)}${el.suffix || ""}`;
  ctx.textAlign = "center";
  const settle = 1 + (1 - outExpo(seg(sc, at, 0.8))) * 0.05;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(settle, settle);
  setFont(ctx, fitPx(ctx, big, Math.min(r.h * 0.42, r.w * 0.22), 900, r.w * 0.94), 900);
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = outCubic(p);
  ctx.fillText(big, 0, r.h * 0.05);
  ctx.restore();
  if (el.text) {
    ctx.globalAlpha = outCubic(seg(sc, at + 0.3, 0.6));
    setFont(ctx, fitPx(ctx, el.text, r.h * 0.1, 700, r.w * 0.9), 700);
    ctx.fillStyle = pal.muted;
    ctx.fillText(el.text, cx, cy + r.h * 0.24);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function drawUiCard(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number, dur: number) {
  const ui = el.ui || { frame: "card" as const };
  const p = seg(sc, at, 0.7);
  if (p <= 0) return;
  const e = outExpo(p);
  const isPhone = ui.frame === "phone";
  const ar = isPhone ? 0.52 : 1.5; // width/height
  let w = r.w * 0.94;
  let h = w / ar;
  if (h > r.h * 0.96) {
    h = r.h * 0.96;
    w = h * ar;
  }
  const x = r.x + (r.w - w) / 2;
  const y = r.y + (r.h - h) / 2 + (1 - e) * r.h * 0.08;
  const rad = Math.min(w, h) * (isPhone ? 0.09 : 0.055);
  ctx.save();
  ctx.globalAlpha = e;
  // shadowed shell
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = rad * 1.6;
  ctx.shadowOffsetY = rad * 0.5;
  rr(ctx, x, y, w, h, rad);
  ctx.fillStyle = pal.dark ? "#181b28" : "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  rr(ctx, x, y, w, h, rad);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = Math.max(1, rad * 0.06);
  ctx.stroke();
  const headH = h * (isPhone ? 0.1 : 0.14);
  // chrome
  if (ui.frame === "browser") {
    ctx.fillStyle = pal.dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
    rr(ctx, x, y, w, headH, rad);
    ctx.fill();
    ctx.fillRect(x, y + headH / 2, w, headH / 2);
    const dotR = headH * 0.14;
    ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(x + headH * 0.5 + i * dotR * 3, y + headH / 2, dotR, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
    if (ui.title) {
      rr(ctx, x + w * 0.3, y + headH * 0.26, w * 0.4, headH * 0.48, headH * 0.24);
      ctx.fillStyle = pal.dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
      ctx.fill();
      ctx.textAlign = "center";
      setFont(ctx, headH * 0.32, 600);
      ctx.fillStyle = pal.faint;
      ctx.textBaseline = "middle";
      ctx.fillText(ui.title, x + w / 2, y + headH * 0.52);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    }
  } else if (isPhone) {
    rr(ctx, x + w * 0.32, y + h * 0.015, w * 0.36, h * 0.028, h * 0.014); // notch pill
    ctx.fillStyle = pal.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)";
    ctx.fill();
    if (ui.title) {
      ctx.textAlign = "center";
      setFont(ctx, h * 0.032, 800);
      ctx.fillStyle = pal.ink;
      ctx.fillText(ui.title, x + w / 2, y + h * 0.1);
      ctx.textAlign = "left";
    }
  } else if (ui.title) {
    setFont(ctx, headH * 0.4, 800);
    ctx.fillStyle = pal.ink;
    ctx.fillText(ui.title, x + w * 0.06, y + headH * 0.72);
  }
  // stat hero inside
  let cy = y + headH * (isPhone ? 1.5 : 1.35);
  const inX = x + w * 0.07;
  const inW = w * 0.86;
  if (ui.stat) {
    const sp = seg(sc, at + 0.35, 0.8);
    if (sp > 0) {
      ctx.globalAlpha = e * outCubic(sp);
      setFont(ctx, fitPx(ctx, ui.stat, h * (isPhone ? 0.07 : 0.16), 900, inW), 900);
      ctx.fillStyle = pal.accent;
      ctx.fillText(ui.stat, inX, cy + h * (isPhone ? 0.05 : 0.1));
      ctx.globalAlpha = e;
    }
    cy += h * (isPhone ? 0.09 : 0.2);
  }
  // rows (skeleton-style, sliding in)
  const rows = ui.rows || [];
  const rowH = Math.min((y + h - cy - h * 0.14) / Math.max(1, rows.length), h * (isPhone ? 0.085 : 0.14));
  rows.forEach((row, i) => {
    const rp = seg(sc, at + 0.45 + i * 0.16, 0.5);
    if (rp <= 0) return;
    const re = outExpo(rp);
    const ry = cy + i * (rowH * 1.14);
    ctx.globalAlpha = e * re;
    ctx.save();
    ctx.translate((1 - re) * w * 0.05, 0);
    rr(ctx, inX, ry, inW, rowH, rowH * 0.3);
    ctx.fillStyle = pal.dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
    ctx.fill();
    const ir = rowH * 0.52;
    ctx.beginPath();
    ctx.arc(inX + rowH * 0.62, ry + rowH / 2, ir / 2, 0, Math.PI * 2);
    ctx.fillStyle = pal.accentSoft;
    ctx.fill();
    drawIcon(ctx, iconNode("check-circle")!, inX + rowH * 0.62, ry + rowH / 2, ir * 0.62, pal.accent, 1);
    ctx.textBaseline = "middle";
    setFont(ctx, fitPx(ctx, row, rowH * 0.36, 700, inW - rowH * 2), 700);
    ctx.fillStyle = pal.ink;
    ctx.fillText(row, inX + rowH * 1.24, ry + rowH * 0.54);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  });
  // CTA button — "presses" once late in the scene
  if (ui.cta) {
    const bp = seg(sc, at + 0.6, 0.5);
    if (bp > 0) {
      const clickAt = Math.max(at + 1.6, dur * 0.62);
      const press = 1 - Math.sin(clamp01((sc - clickAt) / 0.35) * Math.PI) * 0.06;
      const bw = Math.min(inW, w * 0.6);
      const bh = h * (isPhone ? 0.06 : 0.12);
      const bx = x + (w - bw) / 2;
      const by = y + h - bh - h * (isPhone ? 0.035 : 0.07);
      ctx.globalAlpha = e * outCubic(bp);
      ctx.save();
      ctx.translate(bx + bw / 2, by + bh / 2);
      ctx.scale(press, press);
      ctx.shadowColor = pal.accentSoft;
      ctx.shadowBlur = bh * 0.8;
      rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.5);
      ctx.fillStyle = pal.accent;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      setFont(ctx, fitPx(ctx, ui.cta, bh * 0.44, 800, bw * 0.86), 800);
      ctx.fillStyle = pal.dark ? "#0d0f18" : "#ffffff";
      ctx.fillText(ui.cta, 0, bh * 0.03);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawTimeline(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number) {
  const items = el.items || [];
  const n = Math.max(2, items.length);
  const p = seg(sc, at, 0.3);
  if (p <= 0) return;
  const y = r.y + r.h * 0.42;
  const x0 = r.x + r.w * 0.06;
  const x1 = r.x + r.w * 0.94;
  const prog = outCubic(seg(sc, at + 0.1, 1.4));
  ctx.save();
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = Math.max(2, r.h * 0.014);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.strokeStyle = pal.accent;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + (x1 - x0) * prog, y);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const nx = x0 + ((x1 - x0) * i) / (n - 1);
    const reached = prog >= i / (n - 1) - 0.001;
    const np = seg(sc, at + 0.1 + (i / (n - 1)) * 1.3, 0.35);
    const e = outBack(np);
    const nodeR = r.h * 0.052;
    if (np > 0) {
      ctx.save();
      ctx.translate(nx, y);
      ctx.scale(e, e);
      ctx.beginPath();
      ctx.arc(0, 0, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = reached ? pal.accent : pal.dark ? "#232636" : "#e8e8f2";
      ctx.fill();
      ctx.strokeStyle = pal.dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)";
      ctx.lineWidth = nodeR * 0.24;
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = outCubic(np);
      ctx.textAlign = "center";
      setFont(ctx, r.h * 0.075, 800);
      ctx.fillStyle = pal.ink;
      const lines = wrap(ctx, items[i] || "", r.h * 0.075, 800, (r.w / n) * 0.94, 2);
      lines.forEach((ln, li) => ctx.fillText(ln, nx, y + r.h * 0.17 + li * r.h * 0.095));
      setFont(ctx, r.h * 0.06, 700);
      ctx.fillStyle = pal.faint;
      ctx.fillText(`0${i + 1}`, nx, y - r.h * 0.12);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
  }
  ctx.restore();
}

function drawProgress(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number) {
  const v = clamp01((el.value ?? 75) / 100) * outCubic(seg(sc, at, 1.3));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R = Math.min(r.w, r.h) * 0.32;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = R * 0.22;
  ctx.strokeStyle = pal.dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = pal.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setFont(ctx, R * 0.52, 900);
  ctx.fillStyle = pal.ink;
  ctx.fillText(`${Math.round(v * 100)}%`, cx, cy);
  if (el.text) {
    setFont(ctx, R * 0.18, 700);
    ctx.fillStyle = pal.muted;
    ctx.fillText(el.text, cx, cy + R * 1.55);
  }
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.restore();
}

function drawQuote(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number) {
  const p = seg(sc, at, 0.8);
  if (p <= 0) return;
  const px = Math.min(r.h * 0.16, r.w * 0.06);
  ctx.save();
  ctx.globalAlpha = outCubic(p);
  setFont(ctx, px * 3.2, 900);
  ctx.fillStyle = pal.accentSoft.replace("0.16", "0.5").replace("0.12", "0.4");
  ctx.fillText("“", r.x, r.y + px * 2.4);
  const lines = wrap(ctx, el.text || "", px, 800, r.w * 0.92, 4);
  let cy = r.y + px * 2.6;
  ctx.fillStyle = pal.ink;
  for (const [li, ln] of lines.entries()) {
    const lp = outExpo(seg(sc, at + 0.12 + li * 0.14, 0.6));
    ctx.globalAlpha = lp;
    setFont(ctx, px, 800);
    ctx.fillText(ln, r.x + px * 0.2, cy + (1 - lp) * px * 0.4);
    cy += px * 1.32;
  }
  if (el.sub) {
    ctx.globalAlpha = outCubic(seg(sc, at + 0.6, 0.5));
    setFont(ctx, px * 0.55, 700);
    ctx.fillStyle = pal.accent;
    ctx.fillText(`— ${el.sub}`, r.x + px * 0.2, cy + px * 0.3);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawBadge(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number) {
  const p = seg(sc, at, 0.55);
  if (p <= 0) return;
  const e = outBack(p);
  const h = Math.min(r.h * 0.5, r.w * 0.16);
  setFont(ctx, h * 0.42, 800);
  const tw = ctx.measureText(el.text || "").width;
  const node = el.icon ? iconNode(el.icon) : null;
  const w = tw + h * (node ? 1.7 : 1.0);
  const x = r.x + (r.w - w) / 2;
  const y = r.y + (r.h - h) / 2;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(e, e);
  rr(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fillStyle = el.accent ? pal.accent : pal.accentSoft;
  ctx.fill();
  let tx = -w / 2 + h * 0.5;
  if (node) {
    drawIcon(ctx, node, tx + h * 0.1, 0, h * 0.5, el.accent ? (pal.dark ? "#0d0f18" : "#fff") : pal.accent, 1);
    tx += h * 0.7;
  }
  ctx.textBaseline = "middle";
  setFont(ctx, h * 0.42, 800);
  ctx.fillStyle = el.accent ? (pal.dark ? "#0d0f18" : "#fff") : pal.ink;
  ctx.fillText(el.text || "", tx, h * 0.03);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawImageEl(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number, dur: number, img: HTMLImageElement | null) {
  const p = seg(sc, at, 0.7);
  if (p <= 0) return;
  const e = outCubic(p);
  const rad = Math.min(r.w, r.h) * 0.06;
  ctx.save();
  ctx.globalAlpha = e;
  tileBg(ctx, pal, r, rad);
  rr(ctx, r.x + rad * 0.25, r.y + rad * 0.25, r.w - rad * 0.5, r.h - rad * 0.5, rad * 0.8);
  ctx.clip();
  if (img && img.width) {
    // Ken Burns: slow zoom-out + drift across the scene
    const k = 1.14 - 0.1 * clamp01(sc / Math.max(1, dur));
    const s = Math.max((r.w / img.width) * k, (r.h / img.height) * k);
    const dx = r.x + r.w / 2 - (img.width * s) / 2 + Math.sin(sc * 0.3) * r.w * 0.01;
    const dy = r.y + r.h / 2 - (img.height * s) / 2;
    ctx.drawImage(img, dx, dy, img.width * s, img.height * s);
    const tint = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    tint.addColorStop(0, "rgba(0,0,0,0)");
    tint.addColorStop(1, pal.dark ? "rgba(8,10,20,0.45)" : "rgba(255,255,255,0.15)");
    ctx.fillStyle = tint;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  } else {
    ctx.fillStyle = pal.accentSoft;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawIcon(ctx, iconNode("camera")!, r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.24, pal.accent, 1);
  }
  ctx.restore();
  if (el.text) {
    const tp = seg(sc, at + 0.3, 0.5);
    ctx.globalAlpha = outCubic(tp);
    setFont(ctx, Math.min(r.w, r.h) * 0.07, 800);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText(el.text, r.x + rad, r.y + r.h - rad);
    ctx.shadowColor = "transparent";
    ctx.globalAlpha = 1;
  }
}

function drawLogo(ctx: CanvasRenderingContext2D, text: string, pal: Pal, r: Rect, sc: number, at: number) {
  const chars = (text || "").split("");
  const px = fitPx(ctx, text, Math.min(r.h * 0.4, r.w * 0.14), 900, r.w * 0.9);
  setFont(ctx, px, 900);
  const totalW = ctx.measureText(text).width;
  let x = r.x + (r.w - totalW) / 2;
  const y = r.y + r.h / 2 + px * 0.34;
  for (const [i, ch] of chars.entries()) {
    const p = seg(sc, at + i * 0.045, 0.5);
    if (p > 0) {
      const e = outExpo(p);
      ctx.globalAlpha = e;
      ctx.fillStyle = pal.ink;
      setFont(ctx, px, 900);
      ctx.fillText(ch, x, y + (1 - e) * px * 0.5);
      ctx.globalAlpha = 1;
    }
    x += ctx.measureText(ch).width;
  }
  // underline sweep
  const up = seg(sc, at + chars.length * 0.045 + 0.15, 0.5);
  if (up > 0) {
    const uw = totalW * outExpo(up);
    ctx.fillStyle = pal.accent;
    rr(ctx, r.x + (r.w - totalW) / 2, y + px * 0.22, uw, px * 0.08, px * 0.04);
    ctx.fill();
  }
}

function drawTextEl(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number, align: "left" | "center") {
  const px = Math.min(r.h * 0.16, r.w * 0.055);
  const lines = wrap(ctx, el.text || "", px, 600, r.w, 5);
  let cy = r.y + px * 1.1;
  const ax = align === "center" ? r.x + r.w / 2 : r.x;
  ctx.textAlign = align;
  for (const [li, ln] of lines.entries()) {
    const p = seg(sc, at + li * 0.12, 0.55);
    if (p > 0) {
      const e = outExpo(p);
      ctx.globalAlpha = e * 0.92;
      setFont(ctx, px, 600);
      ctx.fillStyle = pal.muted;
      ctx.fillText(ln, ax, cy + (1 - e) * px * 0.4);
      ctx.globalAlpha = 1;
    }
    cy += px * 1.42;
  }
  if (el.sub) {
    const p = seg(sc, at + lines.length * 0.12 + 0.1, 0.5);
    ctx.globalAlpha = outCubic(p);
    setFont(ctx, px * 0.78, 600);
    ctx.fillStyle = pal.faint;
    ctx.fillText(el.sub, ax, cy);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";
}

function drawElement(ctx: CanvasRenderingContext2D, el: MotionElement, pal: Pal, r: Rect, sc: number, at: number, dur: number, vertical: boolean, images: Map<string, HTMLImageElement>) {
  switch (el.type) {
    case "title": {
      const fake: MotionScene = { narration: "", headline: el.text || "", elements: [] };
      drawHeadline(ctx, fake, pal, r.x, r.y + r.h * 0.4, r.w, sc - at, "center", Math.min(r.h * 0.3, r.w * 0.1));
      return;
    }
    case "text": return drawTextEl(ctx, el, pal, r, sc, at, vertical ? "center" : "left");
    case "bullets": return drawBullets(ctx, el, pal, r, sc, at);
    case "icon": return drawIconHero(ctx, el, pal, r, sc, at);
    case "iconGrid": return drawIconGrid(ctx, el, pal, r, sc, at, vertical);
    case "chart": return drawChart(ctx, el, pal, r, sc, at);
    case "counter": return drawCounter(ctx, el, pal, r, sc, at);
    case "uiCard": return drawUiCard(ctx, el, pal, r, sc, at, dur);
    case "timeline": return drawTimeline(ctx, el, pal, r, sc, at);
    case "progress": return drawProgress(ctx, el, pal, r, sc, at);
    case "quote": return drawQuote(ctx, el, pal, r, sc, at);
    case "badge": return drawBadge(ctx, el, pal, r, sc, at);
    case "image": return drawImageEl(ctx, el, pal, r, sc, at, dur, el.imageUrl ? images.get(el.imageUrl) ?? null : null);
    case "logo": return drawLogo(ctx, el.text || "", pal, r, sc, at);
  }
}

/* ── scene composition ────────────────────────────────────────────────────── */
const BG_CYCLE = ["blobs", "dots", "beams", "grid", "waves"] as const;

function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, spec: MotionSpec, idx: number, sc: number, dur: number, pal: Pal, images: Map<string, HTMLImageElement>, energy: number) {
  const scene = spec.scenes[idx];
  const vertical = H > W;
  const min = Math.min(W, H);
  const flavor = scene.bg || BG_CYCLE[idx % BG_CYCLE.length];
  drawBg(ctx, W, H, pal, flavor, sc + idx * 3.7, idx + 1, energy);

  // gentle camera: slow zoom-in + micro drift (professional "always moving")
  ctx.save();
  const zoom = 1.015 + 0.035 * inOut(clamp01(sc / Math.max(4, dur)));
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2 + Math.sin(sc * 0.22 + idx) * min * 0.004, -H / 2 + Math.cos(sc * 0.17 + idx) * min * 0.004);

  const pad = min * 0.075;
  const els = scene.elements || [];
  const hasHeadline = !!scene.headline || !!scene.kicker;
  const layout = scene.layout || (els.length === 0 ? "center" : els.length > 1 ? "grid" : vertical ? "stack" : "split");
  const headPx = vertical ? min * 0.085 : min * 0.105;

  if (layout === "center" || els.length === 0) {
    if (hasHeadline) {
      // vertically-centered headline block
      const lines = scene.headline ? wrap(ctx, scene.headline, headPx * 1.15, 900, W - pad * 2, 3).length : 0;
      const blockH = (scene.kicker ? headPx * 0.6 : 0) + lines * headPx * 1.3;
      const startY = els.length ? H * 0.2 : (H - blockH) / 2 + headPx;
      drawHeadline(ctx, scene, pal, pad, startY, W - pad * 2, sc, "center", headPx * 1.15);
      if (els.length) {
        const r: Rect = { x: pad, y: startY + blockH * 0.6, w: W - pad * 2, h: H - (startY + blockH * 0.6) - pad * 1.6 };
        els.slice(0, 1).forEach((el) => drawElement(ctx, el, pal, r, sc, 0.5, dur, vertical, images));
      }
    } else if (els.length) {
      const r: Rect = { x: pad, y: pad * 1.5, w: W - pad * 2, h: H - pad * 3.4 };
      els.slice(0, 1).forEach((el) => drawElement(ctx, el, pal, r, sc, 0.3, dur, vertical, images));
    }
  } else if (layout === "split" && !vertical) {
    const txtW = W * 0.44;
    let cy = H * (hasHeadline ? 0.3 : 0.4);
    cy = drawHeadline(ctx, scene, pal, pad, cy, txtW - pad, sc, "left", headPx);
    // supporting text elements flow under the headline; visuals go right
    const textEls = els.filter((e) => e.type === "text" || e.type === "bullets" || e.type === "badge");
    const visEls = els.filter((e) => !textEls.includes(e));
    let ty = cy + min * 0.03;
    for (const el of textEls) {
      const h = H - ty - pad * 2;
      if (h < min * 0.08) break; // no room left below a tall headline — never draw into a negative rect
      const r: Rect = { x: pad, y: ty, w: txtW - pad, h };
      drawElement(ctx, el, pal, r, sc, 0.55, dur, false, images);
      ty += el.type === "bullets" ? Math.min((el.items?.length || 1) * min * 0.1, r.h) : min * 0.16;
    }
    const vr: Rect = { x: txtW + pad * 0.5, y: pad * 1.4, w: W - txtW - pad * 1.8, h: H - pad * 3 };
    visEls.slice(0, 1).forEach((el) => drawElement(ctx, el, pal, vr, sc, 0.45, dur, false, images));
  } else if (layout === "grid") {
    const cy = drawHeadline(ctx, scene, pal, pad, H * (vertical ? 0.13 : 0.17), W - pad * 2, sc, "center", headPx * 0.9);
    const gy = cy + min * 0.02;
    const r: Rect = { x: pad, y: gy, w: W - pad * 2, h: H - gy - pad * 1.8 };
    const n = Math.min(els.length, 3);
    if (n === 1) drawElement(ctx, els[0], pal, r, sc, 0.5, dur, vertical, images);
    else {
      // side-by-side (or stacked on vertical)
      for (let i = 0; i < n; i++) {
        const cellR: Rect = vertical
          ? { x: r.x, y: r.y + (r.h / n) * i, w: r.w, h: r.h / n - pad * 0.3 }
          : { x: r.x + (r.w / n) * i + (i ? pad * 0.3 : 0), y: r.y, w: r.w / n - pad * 0.3, h: r.h };
        drawElement(ctx, els[i], pal, cellR, sc, 0.5 + i * 0.22, dur, vertical, images);
      }
    }
  } else if (layout === "full") {
    // visual fills the frame; headline overlays lower third
    const vis = els[0];
    if (vis) drawElement(ctx, vis, pal, { x: pad * 0.6, y: pad * 0.6, w: W - pad * 1.2, h: H - pad * 1.2 }, sc, 0.15, dur, vertical, images);
    if (hasHeadline) {
      const y = H * 0.78;
      ctx.save();
      const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, pal.dark ? "rgba(6,8,16,0.88)" : "rgba(255,255,255,0.92)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
      ctx.restore();
      drawHeadline(ctx, scene, pal, pad, y, W - pad * 2, sc, "left", headPx * 0.85);
    }
  } else {
    // "stack" (default vertical): headline top, one visual below
    const cy = drawHeadline(ctx, scene, pal, pad, H * (vertical ? 0.14 : 0.18), W - pad * 2, sc, "center", headPx);
    const r: Rect = { x: pad, y: cy + min * 0.025, w: W - pad * 2, h: H - cy - min * 0.025 - pad * (vertical ? 2.6 : 1.7) };
    els.slice(0, 2).forEach((el, i) => {
      const half = els.length > 1;
      const cell: Rect = half ? { x: r.x, y: r.y + (r.h / 2) * i, w: r.w, h: r.h / 2 - pad * 0.2 } : r;
      drawElement(ctx, el, pal, cell, sc, 0.5 + i * 0.3, dur, vertical, images);
    });
  }
  ctx.restore();
}

/* ── captions (word-synced, social style) ─────────────────────────────────── */
function drawCaptions(ctx: CanvasRenderingContext2D, W: number, H: number, pal: Pal, words: CaptionWord[], sc: number) {
  if (!words.length) return;
  // group words into short chunks (~4) and show the active chunk
  const CHUNK = 4;
  let gi = -1;
  for (let i = 0; i < words.length; i += CHUNK) {
    const end = words[Math.min(i + CHUNK, words.length) - 1].end;
    if (sc <= end + 0.12) {
      gi = i;
      break;
    }
  }
  if (gi < 0) return;
  const group = words.slice(gi, gi + CHUNK);
  if (sc < group[0].start - 0.25) return;
  const min = Math.min(W, H);
  const px = min * 0.042;
  setFont(ctx, px, 800);
  const gapW = px * 0.32;
  const widths = group.map((w) => ctx.measureText(w.text).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + gapW * (group.length - 1);
  const padX = px * 0.7;
  const y = H - min * 0.075;
  const x0 = W / 2 - totalW / 2;
  ctx.save();
  rr(ctx, x0 - padX, y - px * 1.15, totalW + padX * 2, px * 1.75, px * 0.5);
  ctx.fillStyle = "rgba(8,9,16,0.62)";
  ctx.fill();
  let x = x0;
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < group.length; i++) {
    const w = group[i];
    const active = sc >= w.start && sc <= w.end + 0.08;
    const spoken = sc > w.end;
    ctx.fillStyle = active ? pal.accent : spoken ? "#ffffff" : "rgba(255,255,255,0.55)";
    setFont(ctx, px, 800);
    ctx.fillText(w.text, x, y);
    x += widths[i] + gapW;
  }
  ctx.restore();
}

/* ── watermark + end card ─────────────────────────────────────────────────── */
function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number, pal: Pal) {
  const min = Math.min(W, H);
  const px = min * 0.026;
  setFont(ctx, px, 800);
  const text = "clunoid.com";
  const tw = ctx.measureText(text).width;
  const x = W - tw - px * 1.6;
  const y = min * 0.055;
  ctx.save();
  rr(ctx, x - px * 0.7, y - px * 0.95, tw + px * 1.4, px * 1.5, px * 0.75);
  ctx.fillStyle = "rgba(10,12,20,0.4)";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText(text, x, y + px * 0.18);
  ctx.restore();
}
function drawEndCard(ctx: CanvasRenderingContext2D, W: number, H: number, pal: Pal, p: number) {
  drawBg(ctx, W, H, pal, "blobs", p * 2, 99, 0.6);
  const min = Math.min(W, H);
  const e = outExpo(clamp01(p * 2.2));
  ctx.save();
  ctx.globalAlpha = e;
  ctx.textAlign = "center";
  setFont(ctx, min * 0.085, 900);
  ctx.fillStyle = "#f5f6fa";
  ctx.fillText("Made on", W / 2, H / 2 - min * 0.045);
  setFont(ctx, min * 0.115, 900);
  ctx.fillStyle = pal.accent;
  ctx.fillText("clunoid.com", W / 2, H / 2 + min * 0.075);
  ctx.textAlign = "left";
  ctx.restore();
}

/* ── public: one deterministic frame ──────────────────────────────────────── */
export type MotionAssets = { images: Map<string, HTMLImageElement>; captionWords: CaptionWord[][] };

export function drawMotionFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  spec: MotionSpec,
  timing: MotionTiming,
  assets: MotionAssets,
  pal: Pal,
  t: number,
  branded: boolean
) {
  const energy = spec.style.energy === "high" ? 1.5 : spec.style.energy === "calm" ? 0.55 : 1;
  const n = spec.scenes.length;
  const bodyEnd = timing.total - timing.endCard;

  if (t >= bodyEnd && timing.endCard > 0) {
    drawEndCard(ctx, W, H, pal, (t - bodyEnd) / timing.endCard);
    return;
  }
  // locate scene
  let idx = 0;
  for (let i = 0; i < n; i++) if (t >= timing.sceneStarts[i] - 1e-9) idx = i;
  const sc = t - timing.sceneStarts[idx];
  const dur = timing.sceneDurs[idx];

  // cross-transition into the NEXT scene during the last TRANS/2 + first TRANS/2
  const nextStart = timing.sceneStarts[idx] + dur;
  const inTransOut = idx < n - 1 && t > nextStart - TRANS / 2;
  const inTransIn = idx > 0 && sc < TRANS / 2;

  const renderOne = (i: number, localT: number) => drawScene(ctx, W, H, spec, i, localT, timing.sceneDurs[i], pal, assets.images, energy);

  if (inTransOut) {
    const nt = spec.scenes[idx].transition || "fade";
    const p = inOut((t - (nextStart - TRANS / 2)) / TRANS);
    applyTransition(ctx, W, H, nt, p, () => renderOne(idx, sc), () => renderOne(idx + 1, t - nextStart + 0.0001 + TRANS / 2 * 0));
  } else if (inTransIn) {
    const nt = spec.scenes[idx - 1].transition || "fade";
    const p = inOut(0.5 + sc / TRANS);
    applyTransition(ctx, W, H, nt, p, () => renderOne(idx - 1, timing.sceneDurs[idx - 1] + sc), () => renderOne(idx, sc));
  } else {
    renderOne(idx, sc);
  }

  // captions ride on top (not affected by scene camera)
  if (spec.captions !== false) drawCaptions(ctx, W, H, pal, assets.captionWords[idx] || [], sc);
  if (branded) drawWatermark(ctx, W, H, pal);
}

function applyTransition(ctx: CanvasRenderingContext2D, W: number, H: number, kind: string, p: number, drawA: () => void, drawB: () => void) {
  if (kind === "slide") {
    ctx.save();
    ctx.translate(-W * p, 0);
    drawA();
    ctx.restore();
    ctx.save();
    ctx.translate(W * (1 - p), 0);
    drawB();
    ctx.restore();
  } else if (kind === "wipe") {
    drawA();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W * p, H);
    ctx.clip();
    drawB();
    ctx.restore();
  } else if (kind === "zoom") {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1 + p * 0.12, 1 + p * 0.12);
    ctx.translate(-W / 2, -H / 2);
    ctx.globalAlpha = 1 - p;
    drawA();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(W / 2, H / 2);
    const s = 1.06 - p * 0.06;
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);
    drawB();
    ctx.restore();
    ctx.globalAlpha = 1;
  } else {
    // fade
    drawA();
    ctx.save();
    ctx.globalAlpha = p;
    drawB();
    ctx.restore();
  }
}
