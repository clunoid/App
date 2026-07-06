/**
 * Strategy suite — five evidence-based FX day-trading families. Each is a PURE
 * function over closed bars returning every setup it fires on the series, so the
 * exact code the walk-forward validator scored is the code the live scanner runs.
 *
 * Families (chosen from the literature on session behavior, momentum persistence
 * and volatility clustering in FX — see lib/trading/README.md for sources):
 *   • londonBreakout — Asian-range breakout at the London open (session vol edge)
 *   • trendPullback  — EMA-regime pullback continuation (trend following)
 *   • squeezeBreakout— BB-inside-Keltner compression → expansion (vol breakout)
 *   • rangeFade      — Bollinger extreme fade in low-ADX regimes (mean reversion)
 *   • donchianMomo   — Donchian channel momentum with regime filter (momentum)
 *
 * Shared discipline: ATR/structure stops, ≥1 measured target, session windows,
 * an ATR-percentile volatility-regime gate, and NO look-ahead — every decision
 * uses bar i's close or earlier; entries fill at bar i+1's open in the simulator.
 */
import type { Bar, Pair, Setup, Timeframe } from "./types";
import { atr, adx, bollinger, donchian, ema, keltner, lastAtOrBefore, percentileRank, rsi, swings } from "./indicators";
import { hourIn, utcHour } from "./sessions";

export type StrategyFn = (bars: Bar[], params: Record<string, number>, pair: Pair, tf: Timeframe) => Setup[];

export type StrategyDef = {
  id: string;
  label: string;
  family: "breakout" | "trend" | "volatility" | "meanReversion" | "momentum";
  /** Small, coarse grids on purpose: fewer degrees of freedom = less overfitting
   *  surface, and the neighborhood-stability gate needs a meaningful plateau. */
  grid: Record<string, number[]>;
  run: StrategyFn;
};

const VOL_WINDOW = 400; // bars for the ATR percentile regime classifier

/* ── 1. London open breakout of the Asian range ───────────────────────────── */
const londonBreakout: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const a = atr(bars, 14);
  const perBarMs = bars.length > 1 ? bars[1].t - bars[0].t : 3_600_000;
  const barsPerHour = Math.max(1, Math.round(3_600_000 / perBarMs));
  for (let i = 30; i < bars.length; i++) {
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 7, 11)) continue; // London morning only
    if (Number.isNaN(a[i])) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.95) continue; // extreme regime: stand aside
    // Asian range: bars whose UTC hour ∈ [0,7) on the SAME UTC day as bar i
    const dayStart = new Date(bars[i].t);
    dayStart.setUTCHours(0, 0, 0, 0);
    let hi = -Infinity;
    let lo = Infinity;
    let n = 0;
    for (let j = i - 1; j >= 0 && j > i - 12 * barsPerHour; j--) {
      if (bars[j].t < dayStart.getTime()) break;
      const bh = utcHour(bars[j].t);
      if (bh >= 7) continue;
      hi = Math.max(hi, bars[j].h);
      lo = Math.min(lo, bars[j].l);
      n++;
    }
    if (n < 3 * barsPerHour || !isFinite(hi) || !isFinite(lo)) continue;
    const range = hi - lo;
    if (range < p.minRangeAtr * a[i] || range > 4 * a[i]) continue; // too tight = noise, too wide = exhausted
    const buf = p.bufferAtr * a[i];
    const c = bars[i].c;
    if (c > hi + buf) {
      const stop = Math.max(lo, hi - range * 0.5) - buf;
      const risk = c - stop;
      if (risk > 0.2 * a[i]) out.push(mk(pair, tf, "long", c, stop, [c + risk, c + p.tpR * risk], "londonBreakout", i, [`Asian range ${fmtR(range, a[i])}×ATR broken up`, "London-open session window", volNote(vol)]));
    } else if (c < lo - buf) {
      const stop = Math.min(hi, lo + range * 0.5) + buf;
      const risk = stop - c;
      if (risk > 0.2 * a[i]) out.push(mk(pair, tf, "short", c, stop, [c - risk, c - p.tpR * risk], "londonBreakout", i, [`Asian range ${fmtR(range, a[i])}×ATR broken down`, "London-open session window", volNote(vol)]));
    }
  }
  return dedupeDaily(out, bars);
};

/* ── 2. Trend pullback (EMA regime + RSI recovery) ────────────────────────── */
const trendPullback: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const closes = bars.map((b) => b.c);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const a = atr(bars, 14);
  const sw = swings(bars, 2);
  for (let i = 210; i < bars.length; i++) {
    if ([e20[i], e50[i], e200[i], r[i], a[i]].some(Number.isNaN)) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 6, 20)) continue; // London + NY
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.95) continue;
    const up = e50[i] > e200[i] && closes[i] > e200[i];
    const dn = e50[i] < e200[i] && closes[i] < e200[i];
    // pullback: previous bar pierced EMA20 against trend; this bar closes back
    // through it with RSI recovering across the trigger
    if (up && bars[i - 1].l <= e20[i - 1] && closes[i] > e20[i] && r[i] > p.rsiTrig && r[i - 1] <= p.rsiTrig) {
      // NO look-ahead: a k=2 fractal swing at index s is only CONFIRMED once bars
      // s+1,s+2 exist, i.e. s ≤ i-2 at decision time. Combine it with the raw prior
      // bar's low (always known) for the actual stop.
      const swLow = lastAtOrBefore(sw.lows, i - 2);
      const stop = (swLow !== null ? Math.min(bars[swLow].l, bars[i - 1].l) : bars[i - 1].l) - p.slAtr * a[i];
      const risk = closes[i] - stop;
      if (risk > 0.25 * a[i] && risk < 3 * a[i])
        out.push(mk(pair, tf, "long", closes[i], stop, [closes[i] + risk, closes[i] + p.tpR * risk], "trendPullback", i, ["EMA50 > EMA200 uptrend regime", "Pullback to EMA20 reclaimed", `RSI recovered through ${p.rsiTrig}`, volNote(vol)]));
    } else if (dn && bars[i - 1].h >= e20[i - 1] && closes[i] < e20[i] && r[i] < 100 - p.rsiTrig && r[i - 1] >= 100 - p.rsiTrig) {
      const swHigh = lastAtOrBefore(sw.highs, i - 2);
      const stop = (swHigh !== null ? Math.max(bars[swHigh].h, bars[i - 1].h) : bars[i - 1].h) + p.slAtr * a[i];
      const risk = stop - closes[i];
      if (risk > 0.25 * a[i] && risk < 3 * a[i])
        out.push(mk(pair, tf, "short", closes[i], stop, [closes[i] - risk, closes[i] - p.tpR * risk], "trendPullback", i, ["EMA50 < EMA200 downtrend regime", "Pullback to EMA20 rejected", `RSI rolled through ${100 - p.rsiTrig}`, volNote(vol)]));
    }
  }
  return out;
};

/* ── 3. Squeeze breakout (BB inside Keltner → Donchian break) ─────────────── */
const squeezeBreakout: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const closes = bars.map((b) => b.c);
  const bb = bollinger(closes, 20, 2);
  const kc = keltner(bars, 20, 1.5);
  const dc = donchian(bars, 20);
  const a = atr(bars, 14);
  let squeezeLen = 0;
  for (let i = 40; i < bars.length; i++) {
    if ([bb.upper[i], kc.upper[i], dc.upper[i - 1], a[i]].some(Number.isNaN)) continue;
    const inSqueeze = bb.upper[i] < kc.upper[i] && bb.lower[i] > kc.lower[i];
    if (inSqueeze) {
      squeezeLen++;
      continue;
    }
    const hadSqueeze = squeezeLen >= p.minSqueeze;
    squeezeLen = 0;
    if (!hadSqueeze) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 6, 20)) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.9) continue;
    const width = bb.upper[i] - bb.lower[i];
    if (closes[i] > dc.upper[i - 1]) {
      const stop = bb.mid[i] - 0.2 * a[i];
      const risk = closes[i] - stop;
      if (risk > 0.25 * a[i]) out.push(mk(pair, tf, "long", closes[i], stop, [closes[i] + risk, closes[i] + Math.max(p.tpR * risk, width)], "squeezeBreakout", i, ["Bollinger-inside-Keltner squeeze released", "Donchian(20) high taken out", volNote(vol)]));
    } else if (closes[i] < dc.lower[i - 1]) {
      const stop = bb.mid[i] + 0.2 * a[i];
      const risk = stop - closes[i];
      if (risk > 0.25 * a[i]) out.push(mk(pair, tf, "short", closes[i], stop, [closes[i] - risk, closes[i] - Math.max(p.tpR * risk, width)], "squeezeBreakout", i, ["Bollinger-inside-Keltner squeeze released", "Donchian(20) low taken out", volNote(vol)]));
    }
  }
  return out;
};

/* ── 4. Range fade (mean reversion at Bollinger extremes, low ADX) ────────── */
const rangeFade: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const closes = bars.map((b) => b.c);
  const bb = bollinger(closes, 20, 2);
  const trendStr = adx(bars, 14);
  const a = atr(bars, 14);
  for (let i = 40; i < bars.length; i++) {
    if ([bb.upper[i], trendStr[i], a[i]].some(Number.isNaN)) continue;
    if (trendStr[i] > p.adxTh) continue; // only fade when trend is weak
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.85) continue; // never fade an expanding market
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 0, 15)) continue; // Asian → early London (calmer hours)
    if (closes[i] > bb.upper[i] && bars[i].c < bars[i].h) {
      const stop = closes[i] + p.slAtr * a[i];
      const target = bb.mid[i];
      const risk = stop - closes[i];
      if (target < closes[i] - 0.5 * risk) out.push(mk(pair, tf, "short", closes[i], stop, [target], "rangeFade", i, [`Close above upper Bollinger, ADX ${trendStr[i].toFixed(0)} < ${p.adxTh}`, "Quiet-session mean reversion", volNote(vol)]));
    } else if (closes[i] < bb.lower[i] && bars[i].c > bars[i].l) {
      const stop = closes[i] - p.slAtr * a[i];
      const target = bb.mid[i];
      const risk = closes[i] - stop;
      if (target > closes[i] + 0.5 * risk) out.push(mk(pair, tf, "long", closes[i], stop, [target], "rangeFade", i, [`Close below lower Bollinger, ADX ${trendStr[i].toFixed(0)} < ${p.adxTh}`, "Quiet-session mean reversion", volNote(vol)]));
    }
  }
  return out;
};

/* ── 5. Donchian momentum ─────────────────────────────────────────────────── */
const donchianMomo: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const dc = donchian(bars, p.period);
  const a = atr(bars, 14);
  for (let i = p.period + 10; i < bars.length; i++) {
    if ([dc.upper[i - 1], a[i]].some(Number.isNaN)) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 7, 20)) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol < 0.25 || vol > 0.9) continue; // needs a live but not blown-out tape
    const c = bars[i].c;
    if (c > dc.upper[i - 1]) {
      const stop = c - p.slAtr * a[i];
      out.push(mk(pair, tf, "long", c, stop, [c + (c - stop), c + 2 * (c - stop)], "donchianMomo", i, [`Donchian(${p.period}) high broken`, "Active-session momentum", volNote(vol)]));
    } else if (c < dc.lower[i - 1]) {
      const stop = c + p.slAtr * a[i];
      out.push(mk(pair, tf, "short", c, stop, [c - (stop - c), c - 2 * (stop - c)], "donchianMomo", i, [`Donchian(${p.period}) low broken`, "Active-session momentum", volNote(vol)]));
    }
  }
  return out;
};

/* ── helpers ──────────────────────────────────────────────────────────────── */
function mk(pair: Pair, timeframe: Timeframe, direction: "long" | "short", entry: number, stop: number, targets: number[], strategy: string, barIndex: number, factors: string[]): Setup {
  return { pair, timeframe, direction, entry, stop, targets, strategy, factors, barIndex };
}
const fmtR = (x: number, atrV: number) => (x / atrV).toFixed(1);
const volNote = (v: number) => `ATR regime p${Math.round(v * 100)}`;

/** London breakout: at most one setup per direction per day (first break wins). */
function dedupeDaily(setups: Setup[], bars: Bar[]): Setup[] {
  const seen = new Set<string>();
  const out: Setup[] = [];
  for (const s of setups) {
    const d = new Date(bars[s.barIndex].t);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}:${s.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export const STRATEGIES: StrategyDef[] = [
  { id: "londonBreakout", label: "London Open Breakout", family: "breakout", run: londonBreakout, grid: { bufferAtr: [0.05, 0.1], minRangeAtr: [0.8, 1.2], tpR: [1.5, 2.0] } },
  { id: "trendPullback", label: "Trend Pullback", family: "trend", run: trendPullback, grid: { rsiTrig: [45, 50], slAtr: [0.3, 0.5], tpR: [1.8, 2.2] } },
  { id: "squeezeBreakout", label: "Squeeze Breakout", family: "volatility", run: squeezeBreakout, grid: { minSqueeze: [4, 6], tpR: [1.6, 2.0] } },
  { id: "rangeFade", label: "Range Fade", family: "meanReversion", run: rangeFade, grid: { adxTh: [18, 22], slAtr: [1.0, 1.4] } },
  { id: "donchianMomo", label: "Donchian Momentum", family: "momentum", run: donchianMomo, grid: { period: [20, 28], slAtr: [1.0, 1.4] } },
];

export const strategyById = (id: string): StrategyDef | undefined => STRATEGIES.find((s) => s.id === id);

/** Expand a param grid into every combination. */
export function gridCombos(grid: Record<string, number[]>): Record<string, number>[] {
  let combos: Record<string, number>[] = [{}];
  for (const [k, vals] of Object.entries(grid)) {
    const next: Record<string, number>[] = [];
    for (const c of combos) for (const v of vals) next.push({ ...c, [k]: v });
    combos = next;
  }
  return combos;
}
