/**
 * DERIV MT5 — technical indicators (pure functions, no deps).
 *
 * All operate on a chronological Candle[] (oldest → newest) and return the value
 * at the LATEST bar (or a short series where the strategy needs slope). Thresholds
 * elsewhere are ATR/percent-normalized so the same code works on a 5-digit forex
 * pair and a 2-digit synthetic index.
 */
import type { Candle } from "./types";

export const closes = (c: Candle[]): number[] => c.map((x) => x.c);

/** Simple moving average of the last `n` values. */
export function sma(v: number[], n: number): number {
  if (v.length < n) return NaN;
  let s = 0;
  for (let i = v.length - n; i < v.length; i++) s += v[i];
  return s / n;
}

/** Exponential moving average series (same length as input; seeded with SMA). */
export function emaSeries(v: number[], n: number): number[] {
  const out: number[] = [];
  if (!v.length) return out;
  const k = 2 / (n + 1);
  let prev = v[0];
  for (let i = 0; i < v.length; i++) {
    prev = i === 0 ? v[0] : v[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export const ema = (v: number[], n: number): number => {
  const s = emaSeries(v, n);
  return s.length ? s[s.length - 1] : NaN;
};

export function stdev(v: number[], n: number): number {
  if (v.length < n) return NaN;
  const slice = v.slice(v.length - n);
  const m = slice.reduce((a, b) => a + b, 0) / n;
  const varr = slice.reduce((a, b) => a + (b - m) * (b - m), 0) / n;
  return Math.sqrt(varr);
}

/** True range series. */
function trueRanges(c: Candle[]): number[] {
  const tr: number[] = [];
  for (let i = 0; i < c.length; i++) {
    if (i === 0) { tr.push(c[i].h - c[i].l); continue; }
    const p = c[i - 1].c;
    tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - p), Math.abs(c[i].l - p)));
  }
  return tr;
}

/** Wilder's ATR at the latest bar. */
export function atr(c: Candle[], n = 14): number {
  if (c.length < n + 1) return NaN;
  const tr = trueRanges(c);
  // Wilder smoothing
  let a = tr.slice(1, n + 1).reduce((x, y) => x + y, 0) / n;
  for (let i = n + 1; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

/** Wilder ADX (trend strength, 0..100) at the latest bar. */
export function adx(c: Candle[], n = 14): number {
  if (c.length < 2 * n + 1) return NaN;
  const plusDM: number[] = [0], minusDM: number[] = [0], tr: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].h - c[i - 1].h;
    const down = c[i - 1].l - c[i].l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const p = c[i - 1].c;
    tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - p), Math.abs(c[i].l - p)));
  }
  const wilder = (v: number[]): number[] => {
    const out: number[] = [];
    let s = 0;
    for (let i = 1; i <= n; i++) s += v[i] || 0;
    out[n] = s;
    for (let i = n + 1; i < v.length; i++) out[i] = out[i - 1] - out[i - 1] / n + v[i];
    return out;
  };
  const trS = wilder(tr), pS = wilder(plusDM), mS = wilder(minusDM);
  const dx: number[] = [];
  for (let i = n; i < c.length; i++) {
    if (!trS[i]) { dx.push(0); continue; }
    const pdi = 100 * (pS[i] / trS[i]);
    const mdi = 100 * (mS[i] / trS[i]);
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  }
  if (dx.length < n) return NaN;
  let adxVal = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < dx.length; i++) adxVal = (adxVal * (n - 1) + dx[i]) / n;
  return adxVal;
}

/** Choppiness Index (0..100): high = choppy/range, low = trending. */
export function choppiness(c: Candle[], n = 14): number {
  if (c.length < n + 1) return NaN;
  const tr = trueRanges(c);
  const slice = c.slice(c.length - n);
  const atrSum = tr.slice(tr.length - n).reduce((a, b) => a + b, 0);
  const hh = Math.max(...slice.map((x) => x.h));
  const ll = Math.min(...slice.map((x) => x.l));
  const range = hh - ll;
  if (range <= 0 || atrSum <= 0) return 50;
  return (100 * Math.log10(atrSum / range)) / Math.log10(n);
}

/** Donchian channel over the last `n` bars (excludes the current bar). */
export function donchian(c: Candle[], n: number): { hi: number; lo: number } {
  const s = c.slice(Math.max(0, c.length - 1 - n), c.length - 1);
  return { hi: Math.max(...s.map((x) => x.h)), lo: Math.min(...s.map((x) => x.l)) };
}

/** Keltner channel (EMA ± mult·ATR). */
export function keltner(c: Candle[], n = 20, mult = 2): { mid: number; upper: number; lower: number } {
  const mid = ema(closes(c), n);
  const a = atr(c, n);
  return { mid, upper: mid + mult * a, lower: mid - mult * a };
}

/** Bollinger bands. */
export function bollinger(c: Candle[], n = 20, mult = 2): { mid: number; upper: number; lower: number } {
  const v = closes(c);
  const mid = sma(v, n);
  const sd = stdev(v, n);
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd };
}

/** Wilder RSI (0..100) — seeded with the SMA of the first n changes, then
 *  recursively smoothed over all remaining bars (not a plain rolling average). */
export function rsi(c: Candle[], n = 14): number {
  const v = closes(c);
  if (v.length < n + 1) return NaN;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / n, al = loss / n;
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n;
    al = (al * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

/** Z-score of the latest close vs its `n`-bar mean (mean-reversion distance). */
export function zScore(c: Candle[], n = 20): number {
  const v = closes(c);
  const m = sma(v, n);
  const sd = stdev(v, n);
  if (!sd) return 0;
  return (v[v.length - 1] - m) / sd;
}

/** Slope sign of a short series (+1 rising, -1 falling, 0 flat). */
export function slope(v: number[], look = 3): number {
  if (v.length < look + 1) return 0;
  const d = v[v.length - 1] - v[v.length - 1 - look];
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}
