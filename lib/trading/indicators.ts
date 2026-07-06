/**
 * Indicator kernel — small, allocation-light, dependency-free implementations of
 * the classical indicators the strategy suite uses. Every function returns an
 * array aligned 1:1 with the input bars (NaN until warm), so strategies index by
 * bar without off-by-one bookkeeping. All values derive ONLY from provided bars —
 * no interpolation, no synthetic fill.
 */
import type { Bar } from "./types";

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(0, d)) / period;
    avgL = (avgL * (period - 1) + Math.max(0, -d)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

/** Wilder ATR. */
export function atr(bars: Bar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  if (bars.length <= period) return out;
  const tr = (i: number) =>
    Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr(i);
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr(i)) / period;
    out[i] = prev;
  }
  return out;
}

export function stdev(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let m = 0;
    for (let j = i - period + 1; j <= i; j++) m += values[j];
    m /= period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (values[j] - m) * (values[j] - m);
    out[i] = Math.sqrt(v / period);
  }
  return out;
}

export type Bands = { mid: number[]; upper: number[]; lower: number[] };

export function bollinger(closes: number[], period = 20, mult = 2): Bands {
  const mid = sma(closes, period);
  const sd = stdev(closes, period);
  const upper = mid.map((m, i) => m + mult * sd[i]);
  const lower = mid.map((m, i) => m - mult * sd[i]);
  return { mid, upper, lower };
}

export function keltner(bars: Bar[], period = 20, mult = 1.5): Bands {
  const closes = bars.map((b) => b.c);
  const mid = ema(closes, period);
  const a = atr(bars, period);
  return { mid, upper: mid.map((m, i) => m + mult * a[i]), lower: mid.map((m, i) => m - mult * a[i]) };
}

export function donchian(bars: Bar[], period = 20): { upper: number[]; lower: number[] } {
  const upper = new Array<number>(bars.length).fill(NaN);
  const lower = new Array<number>(bars.length).fill(NaN);
  for (let i = period - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].h > hi) hi = bars[j].h;
      if (bars[j].l < lo) lo = bars[j].l;
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower };
}

/** ADX (Wilder) — trend-strength filter for the mean-reversion strategy. */
export function adx(bars: Bar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  if (bars.length <= period * 2) return out;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trs: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].h - bars[i - 1].h;
    const dn = bars[i - 1].l - bars[i].l;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
    trs.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)));
  }
  // Wilder smoothing
  let trS = 0;
  let pS = 0;
  let mS = 0;
  for (let i = 1; i <= period; i++) {
    trS += trs[i];
    pS += plusDM[i];
    mS += minusDM[i];
  }
  const dxs = new Array<number>(bars.length).fill(NaN);
  for (let i = period + 1; i < bars.length; i++) {
    trS = trS - trS / period + trs[i];
    pS = pS - pS / period + plusDM[i];
    mS = mS - mS / period + minusDM[i];
    const pDI = trS === 0 ? 0 : (100 * pS) / trS;
    const mDI = trS === 0 ? 0 : (100 * mS) / trS;
    const dx = pDI + mDI === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / (pDI + mDI);
    dxs[i] = dx;
  }
  // ADX = Wilder-smoothed DX
  let sum = 0;
  let n = 0;
  let prev = NaN;
  for (let i = period + 1; i < bars.length; i++) {
    if (Number.isNaN(dxs[i])) continue;
    if (n < period) {
      sum += dxs[i];
      n++;
      if (n === period) {
        prev = sum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (period - 1) + dxs[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Percentile rank of the latest value within a trailing window (0..1). Used for
 *  the ATR volatility-regime classifier. */
export function percentileRank(values: number[], i: number, window: number): number {
  const start = Math.max(0, i - window + 1);
  let below = 0;
  let count = 0;
  for (let j = start; j <= i; j++) {
    if (Number.isNaN(values[j])) continue;
    count++;
    if (values[j] <= values[i]) below++;
  }
  return count ? below / count : NaN;
}

/** Swing highs/lows (fractal, `k` bars each side) — structure + stop placement. */
export function swings(bars: Bar[], k = 2): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < bars.length - k; i++) {
    let isH = true;
    let isL = true;
    for (let j = 1; j <= k; j++) {
      if (bars[i].h < bars[i - j].h || bars[i].h < bars[i + j].h) isH = false;
      if (bars[i].l > bars[i - j].l || bars[i].l > bars[i + j].l) isL = false;
    }
    if (isH) highs.push(i);
    if (isL) lows.push(i);
  }
  return { highs, lows };
}

/** Most recent swing low/high index at or before bar i (from swings() output). */
export function lastAtOrBefore(indices: number[], i: number): number | null {
  let lo = 0;
  let hi = indices.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (indices[mid] <= i) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? indices[ans] : null;
}
