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
  /** Bars of history the strategy needs before it can fire (longest look-back).
   *  The live engine refuses to run a champion with fewer closed bars than this
   *  — loudly, via the pair's scan error — instead of silently never firing. */
  warmupBars?: number;
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

/* ── 6. RSI(2) reversion (Connors) — short-horizon snap-back in a trend ────── */
const rsi2Reversion: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const closes = bars.map((b) => b.c);
  const e200 = ema(closes, 200);
  const r2 = rsi(closes, 2);
  const a = atr(bars, 14);
  for (let i = 210; i < bars.length; i++) {
    if ([e200[i], r2[i], a[i]].some(Number.isNaN)) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 1, 21)) continue; // avoid the illiquid rollover hours
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.9) continue;
    if (closes[i] > e200[i] && r2[i] < p.rsiTh) {
      const stop = closes[i] - p.slAtr * a[i];
      const target = closes[i] + p.tpAtr * a[i];
      out.push(mk(pair, tf, "long", closes[i], stop, [target], "rsi2Reversion", i, [`RSI(2) washed out at ${r2[i].toFixed(0)}`, "Price above EMA200 — dip in an uptrend", volNote(vol)]));
    } else if (closes[i] < e200[i] && r2[i] > 100 - p.rsiTh) {
      const stop = closes[i] + p.slAtr * a[i];
      const target = closes[i] - p.tpAtr * a[i];
      out.push(mk(pair, tf, "short", closes[i], stop, [target], "rsi2Reversion", i, [`RSI(2) stretched at ${r2[i].toFixed(0)}`, "Price below EMA200 — pop in a downtrend", volNote(vol)]));
    }
  }
  return out;
};

/* ── 7. Inside-bar breakout — compression release with trend filter ───────── */
const insideBarBreakout: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const closes = bars.map((b) => b.c);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const a = atr(bars, 14);
  for (let i = 210; i < bars.length; i++) {
    if ([e50[i], e200[i], a[i]].some(Number.isNaN)) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 6, 20)) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.93) continue;
    // bar i-1 fully inside the "mother" bar i-2; mother must be a real bar
    const mother = bars[i - 2];
    const inner = bars[i - 1];
    if (!(inner.h < mother.h && inner.l > mother.l)) continue;
    const mRange = mother.h - mother.l;
    if (mRange < p.minMother * a[i]) continue;
    const up = e50[i] > e200[i];
    const dn = e50[i] < e200[i];
    if (up && bars[i].c > mother.h) {
      const stop = Math.max(mother.l, mother.h - mRange * 0.75) - 0.1 * a[i];
      const risk = bars[i].c - stop;
      if (risk > 0.25 * a[i] && risk < 3 * a[i]) out.push(mk(pair, tf, "long", bars[i].c, stop, [bars[i].c + risk, bars[i].c + p.tpR * risk], "insideBarBreakout", i, ["Inside-bar compression under the mother-bar high", "Break with the EMA50>EMA200 trend", volNote(vol)]));
    } else if (dn && bars[i].c < mother.l) {
      const stop = Math.min(mother.h, mother.l + mRange * 0.75) + 0.1 * a[i];
      const risk = stop - bars[i].c;
      if (risk > 0.25 * a[i] && risk < 3 * a[i]) out.push(mk(pair, tf, "short", bars[i].c, stop, [bars[i].c - risk, bars[i].c - p.tpR * risk], "insideBarBreakout", i, ["Inside-bar compression over the mother-bar low", "Break with the EMA50<EMA200 trend", volNote(vol)]));
    }
  }
  return out;
};

/* ── 8. NY opening-range breakout — the US-session sibling of londonBreakout ─ */
const nyOpenRange: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const a = atr(bars, 14);
  const perBarMs = bars.length > 1 ? Math.min(bars[1].t - bars[0].t, bars[2] ? bars[2].t - bars[1].t : Infinity) : 3_600_000;
  const barsPerHour = Math.max(1, Math.round(3_600_000 / perBarMs));
  for (let i = 30; i < bars.length; i++) {
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 14, 19)) continue; // break window: NY morning after the range forms
    if (Number.isNaN(a[i])) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.95) continue;
    // opening range: bars with UTC hour ∈ [12,14) on the same UTC day
    const dayStart = new Date(bars[i].t);
    dayStart.setUTCHours(0, 0, 0, 0);
    let hi = -Infinity;
    let lo = Infinity;
    let n = 0;
    for (let j = i - 1; j >= 0 && j > i - 8 * barsPerHour; j--) {
      if (bars[j].t < dayStart.getTime()) break;
      const bh = utcHour(bars[j].t);
      if (bh < 12 || bh >= 14) continue;
      hi = Math.max(hi, bars[j].h);
      lo = Math.min(lo, bars[j].l);
      n++;
    }
    if (n < 2 * barsPerHour - 1 || !isFinite(hi) || !isFinite(lo)) continue;
    const range = hi - lo;
    if (range < p.minRangeAtr * a[i] || range > 4 * a[i]) continue;
    const buf = p.bufferAtr * a[i];
    const c = bars[i].c;
    if (c > hi + buf) {
      const stop = Math.max(lo, hi - range * 0.5) - buf;
      const risk = c - stop;
      if (risk > 0.2 * a[i]) out.push(mk(pair, tf, "long", c, stop, [c + risk, c + p.tpR * risk], "nyOpenRange", i, [`NY opening range ${fmtR(range, a[i])}×ATR broken up`, "US-session momentum window", volNote(vol)]));
    } else if (c < lo - buf) {
      const stop = Math.min(hi, lo + range * 0.5) + buf;
      const risk = stop - c;
      if (risk > 0.2 * a[i]) out.push(mk(pair, tf, "short", c, stop, [c - risk, c - p.tpR * risk], "nyOpenRange", i, [`NY opening range ${fmtR(range, a[i])}×ATR broken down`, "US-session momentum window", volNote(vol)]));
    }
  }
  return dedupeDaily(out, bars);
};

/* ── 9. EMA cross with ADX filter — classic trend engagement ──────────────── */
const emaCrossTrend: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const closes = bars.map((b) => b.c);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const trendStr = adx(bars, 14);
  const a = atr(bars, 14);
  for (let i = 210; i < bars.length; i++) {
    if ([e20[i], e50[i], e200[i], trendStr[i], a[i], e20[i - 1], e50[i - 1]].some(Number.isNaN)) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 6, 20)) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol < 0.2 || vol > 0.9) continue;
    if (trendStr[i] < p.adxTh) continue; // only engage when a real trend is measured
    const crossedUp = e20[i - 1] <= e50[i - 1] && e20[i] > e50[i];
    const crossedDn = e20[i - 1] >= e50[i - 1] && e20[i] < e50[i];
    if (crossedUp && closes[i] > e200[i]) {
      const stop = closes[i] - p.slAtr * a[i];
      const risk = closes[i] - stop;
      out.push(mk(pair, tf, "long", closes[i], stop, [closes[i] + risk, closes[i] + p.tpR * risk], "emaCrossTrend", i, ["EMA20 crossed above EMA50", `ADX ${trendStr[i].toFixed(0)} confirms trend`, "Above EMA200 regime", volNote(vol)]));
    } else if (crossedDn && closes[i] < e200[i]) {
      const stop = closes[i] + p.slAtr * a[i];
      const risk = stop - closes[i];
      out.push(mk(pair, tf, "short", closes[i], stop, [closes[i] - risk, closes[i] - p.tpR * risk], "emaCrossTrend", i, ["EMA20 crossed below EMA50", `ADX ${trendStr[i].toFixed(0)} confirms trend`, "Below EMA200 regime", volNote(vol)]));
    }
  }
  return out;
};

/* ── 10. Keltner pullback — price-action reclaim of the mid-band in a trend ── */
const keltnerPullback: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const closes = bars.map((b) => b.c);
  const e200 = ema(closes, 200);
  const kc = keltner(bars, 20, 1.5);
  const a = atr(bars, 14);
  for (let i = 210; i < bars.length; i++) {
    if ([e200[i], kc.mid[i], a[i]].some(Number.isNaN)) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 6, 20)) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.93) continue;
    const up = kc.mid[i] > e200[i] && closes[i] > e200[i];
    const dn = kc.mid[i] < e200[i] && closes[i] < e200[i];
    // pullback: prior bar tagged the mid-band against the trend; this bar reclaims
    // with a price-action trigger (close beyond the prior bar's extreme)
    if (up && bars[i - 1].l <= kc.mid[i - 1] && closes[i] > bars[i - 1].h) {
      const stop = Math.min(bars[i - 1].l, bars[i].l) - p.slAtr * a[i];
      const risk = closes[i] - stop;
      if (risk > 0.25 * a[i] && risk < 3 * a[i]) out.push(mk(pair, tf, "long", closes[i], stop, [closes[i] + risk, closes[i] + p.tpR * risk], "keltnerPullback", i, ["Pullback tagged the Keltner mid-band", "Reclaim bar closed above the prior high", "Trend regime above EMA200", volNote(vol)]));
    } else if (dn && bars[i - 1].h >= kc.mid[i - 1] && closes[i] < bars[i - 1].l) {
      const stop = Math.max(bars[i - 1].h, bars[i].h) + p.slAtr * a[i];
      const risk = stop - closes[i];
      if (risk > 0.25 * a[i] && risk < 3 * a[i]) out.push(mk(pair, tf, "short", closes[i], stop, [closes[i] - risk, closes[i] - p.tpR * risk], "keltnerPullback", i, ["Pullback tagged the Keltner mid-band", "Rejection bar closed below the prior low", "Trend regime below EMA200", volNote(vol)]));
    }
  }
  return out;
};

/* ── 11. HTF trend rider — higher-timeframe regime, H1 pullback entry ─────── */
const htfTrendRider: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const closes = bars.map((b) => b.c);
  // H1 proxies for higher-timeframe regime: EMA(240)≈10-day, EMA(1200)≈50-day
  const eFast = ema(closes, 240);
  const eSlow = ema(closes, 1200);
  const a = atr(bars, 14);
  for (let i = 1260; i < bars.length; i++) {
    if ([eFast[i], eSlow[i], a[i]].some(Number.isNaN)) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 6, 20)) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.93) continue;
    const up = eFast[i] > eSlow[i] && closes[i] > eFast[i];
    const dn = eFast[i] < eSlow[i] && closes[i] < eFast[i];
    // entry: an N-bar counter-trend drift, then a close back through the prior high/low
    const N = p.pullBars;
    let drifted = true;
    for (let j = i - N; j < i; j++) {
      if (up && bars[j].c > bars[j - 1].c) drifted = false;
      if (dn && bars[j].c < bars[j - 1].c) drifted = false;
    }
    if (!drifted) continue;
    if (up && closes[i] > bars[i - 1].h) {
      const stop = Math.min(bars[i - 1].l, bars[i - 2].l) - p.slAtr * a[i];
      const risk = closes[i] - stop;
      if (risk > 0.25 * a[i] && risk < 3 * a[i]) out.push(mk(pair, tf, "long", closes[i], stop, [closes[i] + risk, closes[i] + p.tpR * risk], "htfTrendRider", i, ["Higher-timeframe uptrend (10d>50d proxy)", `${N}-bar drift resolved back up`, volNote(vol)]));
    } else if (dn && closes[i] < bars[i - 1].l) {
      const stop = Math.max(bars[i - 1].h, bars[i - 2].h) + p.slAtr * a[i];
      const risk = stop - closes[i];
      if (risk > 0.25 * a[i] && risk < 3 * a[i]) out.push(mk(pair, tf, "short", closes[i], stop, [closes[i] - risk, closes[i] - p.tpR * risk], "htfTrendRider", i, ["Higher-timeframe downtrend (10d<50d proxy)", `${N}-bar drift resolved back down`, volNote(vol)]));
    }
  }
  return out;
};

/* ── 12. Wide-range continuation — momentum ignition follow-through ───────── */
const wideRangeContinuation: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const a = atr(bars, 14);
  for (let i = 30; i < bars.length; i++) {
    if (Number.isNaN(a[i])) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 7, 19)) continue; // London + NY ignition hours
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.9) continue;
    const b = bars[i];
    const range = b.h - b.l;
    if (range < p.rangeAtr * a[i]) continue; // must be a genuine ignition bar
    const posInRange = range > 0 ? (b.c - b.l) / range : 0.5;
    if (posInRange > 0.75) {
      const stop = b.l + range * 0.5 - 0.1 * a[i]; // bar midpoint
      const risk = b.c - stop;
      if (risk > 0.25 * a[i]) out.push(mk(pair, tf, "long", b.c, stop, [b.c + risk, b.c + p.tpR * risk], "wideRangeContinuation", i, [`Ignition bar ${(range / a[i]).toFixed(1)}×ATR closing strong`, "Active-session momentum follow-through", volNote(vol)]));
    } else if (posInRange < 0.25) {
      const stop = b.h - range * 0.5 + 0.1 * a[i];
      const risk = stop - b.c;
      if (risk > 0.25 * a[i]) out.push(mk(pair, tf, "short", b.c, stop, [b.c - risk, b.c - p.tpR * risk], "wideRangeContinuation", i, [`Ignition bar ${(range / a[i]).toFixed(1)}×ATR closing weak`, "Active-session momentum follow-through", volNote(vol)]));
    }
  }
  return out;
};

/* ── 13. Asian compression breakout — narrow overnight range → London release ─ */
// Refinement of the (rejected) naive londonBreakout: Crabel's contraction→
// expansion effect says the tradeable Asian-range breaks are the UNUSUALLY
// NARROW ones (overnight information accumulates in thin liquidity, then
// releases into deep London liquidity). compRatio 1.0 = filter off — a built-in
// ablation cell: the filtered cells must beat it or the hypothesis is dead.
const asianCompression: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const a = atr(bars, 14);
  const tfH = TF_HOURS[tf];
  // full Asian range (UTC 00:00–06:59) per UTC calendar day — complete before
  // any London-window decision bar of the same day, so no look-ahead
  const dayKey = (t: number) => Math.floor(t / 86_400_000);
  const asian = new Map<number, { hi: number; lo: number; hours: number }>();
  for (const b of bars) {
    if (utcHour(b.t) >= 7) continue;
    const k = dayKey(b.t);
    const s = asian.get(k);
    if (!s) asian.set(k, { hi: b.h, lo: b.l, hours: tfH });
    else {
      if (b.h > s.hi) s.hi = b.h;
      if (b.l < s.lo) s.lo = b.l;
      s.hours += tfH;
    }
  }
  const dayKeys = [...asian.keys()].sort((x, y) => x - y);
  const keyPos = new Map(dayKeys.map((k, idx) => [k, idx]));
  for (let i = 30; i < bars.length; i++) {
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 7, 11)) continue;
    if (Number.isNaN(a[i])) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.95) continue;
    const k = dayKey(bars[i].t);
    const s = asian.get(k);
    if (!s || s.hours < 5) continue;
    const range = s.hi - s.lo;
    if (!(range > 0)) continue;
    // compression: today's Asian range vs the average of the prior ≤20 sessions
    const pos = keyPos.get(k)!;
    if (pos < 10) continue;
    let sum = 0;
    let n = 0;
    for (let j = pos - 1; j >= 0 && n < 20; j--) {
      const prev = asian.get(dayKeys[j])!;
      if (prev.hours < 5) continue;
      sum += prev.hi - prev.lo;
      n++;
    }
    if (n < 10) continue;
    if (range > p.compRatio * (sum / n)) continue;
    const buf = p.bufferAtr * a[i];
    const c = bars[i].c;
    if (c > s.hi + buf) {
      // structure stop at the range midpoint, floored at 0.8×ATR so compressed-
      // range stops cannot sit inside the noise band
      const stop = Math.min(Math.max(s.lo, s.hi - range * 0.5) - buf, c - 0.8 * a[i]);
      const risk = c - stop;
      if (risk > 0.25 * a[i]) out.push(mk(pair, tf, "long", c, stop, [c + risk, c + p.tpR * risk], "asianCompression", i, [`Compressed Asian range (${((range / (sum / n)) * 100).toFixed(0)}% of 20-day avg) broken up`, "London-open expansion window", volNote(vol)]));
    } else if (c < s.lo - buf) {
      const stop = Math.max(Math.min(s.hi, s.lo + range * 0.5) + buf, c + 0.8 * a[i]);
      const risk = stop - c;
      if (risk > 0.25 * a[i]) out.push(mk(pair, tf, "short", c, stop, [c - risk, c - p.tpR * risk], "asianCompression", i, [`Compressed Asian range (${((range / (sum / n)) * 100).toFixed(0)}% of 20-day avg) broken down`, "London-open expansion window", volNote(vol)]));
    }
  }
  return dedupeDaily(out, bars);
};

/* ── 14. Breakout–retest continuation — prior-day extreme, held on retest ───── */
// The suite's only two-stage entry: a close through the prior day's extreme ARMS
// the level; a later bar that tags the level and CLOSES back beyond it confirms
// that a second wave of order flow defends the break (filters the false
// breakouts that plague choppy pairs). A close back through the level cancels.
const breakoutRetest: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const a = atr(bars, 14);
  const dc = dayContext(bars);
  let armL = -1; // bar index the long side armed at (-1 = not armed)
  let armS = -1;
  let curDay = -1;
  for (let i = 30; i < bars.length; i++) {
    if (dc.dayOf[i] !== curDay) {
      curDay = dc.dayOf[i];
      armL = -1;
      armS = -1;
    }
    const prev = dc.prevDay(i);
    if (!prev) continue;
    const c = bars[i].c;
    // CANCEL/TIMEOUT transitions run on EVERY bar of the day — a failed
    // breakout must disarm even on bars the entry-quality gates below would
    // skip (a p95-volatility news bar closing back through the level is
    // precisely the false breakout this family exists to filter).
    if (armL >= 0 && (c < prev.hi || i - armL > p.retestBars)) armL = -1;
    if (armS >= 0 && (c > prev.lo || i - armS > p.retestBars)) armS = -1;
    // entry-quality gates apply only to ARMING and CONFIRMING
    if (Number.isNaN(a[i])) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 7, 15)) continue; // arming and retesting live in London/early NY
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.93) continue;
    // long side
    if (armL < 0) {
      if (c > prev.hi && bars[i - 1].c <= prev.hi) armL = i;
    } else if (i > armL && bars[i].l <= prev.hi + 0.25 * a[i] && c > prev.hi) {
      const stop = bars[i].l - p.slAtr * a[i];
      const risk = c - stop;
      if (risk > 0.25 * a[i] && risk < 4 * a[i]) out.push(mk(pair, tf, "long", c, stop, [c + risk, c + p.tpR * risk], "breakoutRetest", i, ["Prior-day high broken, retest held on a close", "Second-wave order flow defends the level", volNote(vol)]));
      armL = -1;
    }
    // short side
    if (armS < 0) {
      if (c < prev.lo && bars[i - 1].c >= prev.lo) armS = i;
    } else if (i > armS && bars[i].h >= prev.lo - 0.25 * a[i] && c < prev.lo) {
      const stop = bars[i].h + p.slAtr * a[i];
      const risk = stop - c;
      if (risk > 0.25 * a[i] && risk < 4 * a[i]) out.push(mk(pair, tf, "short", c, stop, [c - risk, c - p.tpR * risk], "breakoutRetest", i, ["Prior-day low broken, retest held on a close", "Second-wave order flow defends the level", volNote(vol)]));
      armS = -1;
    }
  }
  return dedupeDaily(out, bars);
};

/* ── 15. NR7 daily breakout — narrowest daily range in N → expansion day ────── */
// Crabel (1990): a daily range narrower than the prior N-1 days means both sides
// withdrew; the next initiative order flow travels through a vacuum. N∈{4,7} are
// Crabel's published values — priors fixed 35 years out-of-sample. Time-boxed to
// the same trading day (maxBars → 21:00 UTC), no overnight hold.
const nr7Breakout: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const a = atr(bars, 14);
  const dc = dayContext(bars);
  const tfH = TF_HOURS[tf];
  for (let i = 30; i < bars.length; i++) {
    if (Number.isNaN(a[i])) continue;
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 7, 15)) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.95) continue;
    const d = dc.dayOf[i];
    if (d < p.nrN + 1) continue;
    const prev = dc.days[d - 1];
    let isNR = true;
    for (let j = 2; j <= p.nrN; j++) {
      if (prev.range >= dc.days[d - j].range) {
        isNR = false;
        break;
      }
    }
    if (!isNR || !(prev.range > 0)) continue;
    const adr14 = dc.adr(i, 14);
    if (Number.isNaN(adr14)) continue;
    const buf = p.buffer * adr14;
    const c = bars[i].c;
    const maxBars = Math.max(1, Math.round((21 - h) / tfH) - 1);
    if (c > prev.hi + buf) {
      const stop = prev.lo - buf;
      const risk = c - stop;
      if (risk > 0.3 * a[i] && risk < 8 * a[i]) out.push(mk(pair, tf, "long", c, stop, [c + risk, c + p.tpR * risk], "nr7Breakout", i, [`NR${p.nrN} day: narrowest range of ${p.nrN} sessions`, "Expansion-day breakout, same-day time box", volNote(vol)], maxBars));
    } else if (c < prev.lo - buf) {
      const stop = prev.hi + buf;
      const risk = stop - c;
      if (risk > 0.3 * a[i] && risk < 8 * a[i]) out.push(mk(pair, tf, "short", c, stop, [c - risk, c - p.tpR * risk], "nr7Breakout", i, [`NR${p.nrN} day: narrowest range of ${p.nrN} sessions`, "Expansion-day breakout, same-day time box", volNote(vol)], maxBars));
    }
  }
  return dedupeDaily(out, bars);
};

/* ── 16. London-close fade — stretched day reverses off the 16:00 fix ───────── */
// Evans (2018) and the FCA occasional paper 46 document systematic reversal of
// moves into the 4pm London WMR fix; Breedon & Ranaldo tie intraday FX drift to
// local-session order flow that reverts when the driving session closes. The
// stretch condition (day move ≥ stretch×ADR20) selects the forced-flow days.
// sigHour is gridded {15,16} because the fix is 16:00 LONDON time (UTC drifts
// with DST — same fixed-UTC-window convention the whole suite validates under).
const londonCloseFade: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const a = atr(bars, 14);
  const dc = dayContext(bars);
  const tfH = TF_HOURS[tf];
  // first bar at/after 07:00 UTC per UTC calendar day → the London "day open"
  const dayKey = (t: number) => Math.floor(t / 86_400_000);
  const open7 = new Map<number, number>();
  for (const b of bars) {
    if (utcHour(b.t) < 7) continue;
    const k = dayKey(b.t);
    if (!open7.has(k)) open7.set(k, b.o);
  }
  for (let i = 30; i < bars.length; i++) {
    const h = utcHour(bars[i].t);
    if (h !== p.sigHour) continue;
    if (Number.isNaN(a[i])) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.95) continue;
    const adr20 = dc.adr(i, 20);
    if (Number.isNaN(adr20) || !(adr20 > 0)) continue;
    const o7 = open7.get(dayKey(bars[i].t));
    if (o7 === undefined) continue;
    const c = bars[i].c;
    const dayMove = c - o7;
    if (Math.abs(dayMove) < p.stretch * adr20) continue;
    const maxBars = Math.max(1, Math.round((21 - h) / tfH) - 1);
    const closeHHMM = `${String(Math.floor((h + tfH) % 24)).padStart(2, "0")}:00 UTC`;
    if (dayMove > 0) {
      const stop = dc.runHi[i] + 0.5 * adr20;
      const target = c - p.tgt * adr20;
      const risk = stop - c;
      if (risk > 0.25 * a[i]) out.push(mk(pair, tf, "short", c, stop, [target], "londonCloseFade", i, [`Day stretched +${(Math.abs(dayMove) / adr20).toFixed(2)}×ADR20 by the ${closeHHMM} close`, "Session-flow reversal window, same-day time box", volNote(vol)], maxBars));
    } else {
      const stop = dc.runLo[i] - 0.5 * adr20;
      const target = c + p.tgt * adr20;
      const risk = c - stop;
      if (risk > 0.25 * a[i]) out.push(mk(pair, tf, "long", c, stop, [target], "londonCloseFade", i, [`Day stretched -${(Math.abs(dayMove) / adr20).toFixed(2)}×ADR20 by the ${closeHHMM} close`, "Session-flow reversal window, same-day time box", volNote(vol)], maxBars));
    }
  }
  return dedupeDaily(out, bars);
};

/* ── 17. ADR exhaustion fade — the day's range budget is spent ──────────────── */
// Base-rate anchor, not a price pattern: price exceeds ~100% of its average
// daily range on only ~40% of days (and 200% on ~3%) — once the budget is spent
// AND price sits at the day's extreme, extension odds collapse. All parameters
// are in ADR units (scale-free across pairs — a real plateau should appear on
// several pairs or none). Same-day time box, never holds overnight by design.
const adrExhaustionFade: StrategyFn = (bars, p, pair, tf) => {
  const out: Setup[] = [];
  const a = atr(bars, 14);
  const dc = dayContext(bars);
  const tfH = TF_HOURS[tf];
  for (let i = 30; i < bars.length; i++) {
    const h = utcHour(bars[i].t);
    if (!hourIn(h, 8, 16)) continue;
    if (Number.isNaN(a[i])) continue;
    const vol = percentileRank(a, i, VOL_WINDOW);
    if (vol > 0.95) continue;
    const adr20 = dc.adr(i, 20);
    if (Number.isNaN(adr20) || !(adr20 > 0)) continue;
    const dayRange = dc.runHi[i] - dc.runLo[i];
    if (dayRange < p.trig * adr20) continue;
    const c = bars[i].c;
    const posInDay = (c - dc.runLo[i]) / dayRange;
    const maxBars = Math.max(1, Math.round((21 - h) / tfH) - 1);
    if (posInDay >= 0.8) {
      const stop = dc.runHi[i] + p.slAdr * adr20;
      const target = c - p.tgt * adr20;
      const risk = stop - c;
      if (risk > 0.25 * a[i] && target < c) out.push(mk(pair, tf, "short", c, stop, [target], "adrExhaustionFade", i, [`Day range ${((dayRange / adr20) * 100).toFixed(0)}% of ADR20, close at the day's high`, "Range-budget exhaustion fade, same-day time box", volNote(vol)], maxBars));
    } else if (posInDay <= 0.2) {
      const stop = dc.runLo[i] - p.slAdr * adr20;
      const target = c + p.tgt * adr20;
      const risk = c - stop;
      if (risk > 0.25 * a[i] && target > c) out.push(mk(pair, tf, "long", c, stop, [target], "adrExhaustionFade", i, [`Day range ${((dayRange / adr20) * 100).toFixed(0)}% of ADR20, close at the day's low`, "Range-budget exhaustion fade, same-day time box", volNote(vol)], maxBars));
    }
  }
  return dedupeDaily(out, bars);
};

/* ── helpers ──────────────────────────────────────────────────────────────── */
/** Hours per bar by timeframe — declared, not inferred (a weekend gap between
 *  the first two bars would corrupt an inferred value). */
const TF_HOURS: Record<Timeframe, number> = { "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4 };

/** Per-bar trading-day context under the NY-close convention (day boundary at
 *  21:00 UTC, the FX daily-bar standard — Sunday's 3-hour stub belongs to
 *  Monday's day). Everything exposed is strictly backward-looking at bar i:
 *  prevDay/adr read only COMPLETED days; runHi/runLo are the running extremes
 *  up to and including bar i (which is closed at decision time). */
function dayContext(bars: Bar[]) {
  const key = (t: number) => Math.floor((t + 10_800_000) / 86_400_000);
  const dayOf = new Array<number>(bars.length);
  const days: { hi: number; lo: number; range: number }[] = [];
  const runHi = new Array<number>(bars.length);
  const runLo = new Array<number>(bars.length);
  let curKey = NaN;
  for (let i = 0; i < bars.length; i++) {
    const k = key(bars[i].t);
    if (k !== curKey) {
      curKey = k;
      days.push({ hi: bars[i].h, lo: bars[i].l, range: bars[i].h - bars[i].l });
    }
    const d = days[days.length - 1];
    if (bars[i].h > d.hi) d.hi = bars[i].h;
    if (bars[i].l < d.lo) d.lo = bars[i].l;
    d.range = d.hi - d.lo;
    dayOf[i] = days.length - 1;
    runHi[i] = d.hi;
    runLo[i] = d.lo;
  }
  return {
    dayOf,
    days,
    runHi,
    runLo,
    /** Average daily range of the n COMPLETED days before bar i's day. */
    adr(i: number, n: number): number {
      const d = dayOf[i];
      if (d < n) return NaN;
      let s = 0;
      for (let j = d - n; j < d; j++) s += days[j].range;
      return s / n;
    },
    /** The completed day before bar i's day (full-session extremes). */
    prevDay(i: number): { hi: number; lo: number; range: number } | null {
      return dayOf[i] >= 1 ? days[dayOf[i] - 1] : null;
    },
  };
}

function mk(pair: Pair, timeframe: Timeframe, direction: "long" | "short", entry: number, stop: number, targets: number[], strategy: string, barIndex: number, factors: string[], maxBars?: number): Setup {
  return { pair, timeframe, direction, entry, stop, targets, strategy, factors, barIndex, ...(maxBars !== undefined ? { maxBars } : {}) };
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
  // grids stay COARSE on purpose (small overfitting surface); the two 2024-cohort
  // near-misses (londonBreakout, trendPullback) carry one extra option per axis so
  // the walk-forward can explore the plateau the neighborhood test hinted at.
  { id: "londonBreakout", label: "London Open Breakout", family: "breakout", run: londonBreakout, grid: { bufferAtr: [0.05, 0.1, 0.15], minRangeAtr: [0.8, 1.2], tpR: [1.2, 1.6, 2.0] } },
  { id: "trendPullback", label: "Trend Pullback", family: "trend", run: trendPullback, grid: { rsiTrig: [40, 45, 50], slAtr: [0.3, 0.5], tpR: [1.6, 2.0, 2.4] } },
  { id: "squeezeBreakout", label: "Squeeze Breakout", family: "volatility", run: squeezeBreakout, grid: { minSqueeze: [4, 6], tpR: [1.6, 2.0] } },
  { id: "rangeFade", label: "Range Fade", family: "meanReversion", run: rangeFade, grid: { adxTh: [18, 22], slAtr: [1.0, 1.4] } },
  { id: "donchianMomo", label: "Donchian Momentum", family: "momentum", run: donchianMomo, grid: { period: [20, 28], slAtr: [1.0, 1.4] } },
  { id: "rsi2Reversion", label: "RSI(2) Reversion", family: "meanReversion", run: rsi2Reversion, grid: { rsiTh: [5, 10], slAtr: [1.2, 1.6], tpAtr: [0.8, 1.2] } },
  { id: "insideBarBreakout", label: "Inside-Bar Breakout", family: "breakout", run: insideBarBreakout, grid: { minMother: [0.6, 1.0], tpR: [1.5, 2.0] } },
  { id: "nyOpenRange", label: "NY Opening Range", family: "breakout", run: nyOpenRange, grid: { bufferAtr: [0.05, 0.1], minRangeAtr: [0.5, 0.8], tpR: [1.5, 2.0] } },
  { id: "emaCrossTrend", label: "EMA Cross Trend", family: "trend", run: emaCrossTrend, grid: { adxTh: [18, 22], slAtr: [1.2, 1.6], tpR: [2.0, 2.5] } },
  { id: "keltnerPullback", label: "Keltner Pullback", family: "trend", run: keltnerPullback, grid: { slAtr: [0.3, 0.5], tpR: [1.6, 2.0, 2.4] } },
  { id: "htfTrendRider", label: "HTF Trend Rider", family: "trend", run: htfTrendRider, warmupBars: 1260, grid: { pullBars: [2, 3], slAtr: [0.3, 0.5], tpR: [1.8, 2.4] } },
  { id: "wideRangeContinuation", label: "Wide-Range Continuation", family: "momentum", run: wideRangeContinuation, grid: { rangeAtr: [1.6, 2.0], tpR: [1.5, 2.0] } },
  // 2026-07 cohort — evidence-based families from the literature review (Crabel
  // contraction→expansion, break-retest order-flow defense, London-fix reversal,
  // ADR range-budget base rates). Grids stay coarse; compRatio 1.0 is a built-in
  // ablation cell (filter off) the compressed cells must beat out-of-sample.
  { id: "asianCompression", label: "Asian Compression Breakout", family: "breakout", run: asianCompression, grid: { compRatio: [0.6, 0.8, 1.0], bufferAtr: [0.05, 0.1], tpR: [1.5, 2.0] } },
  { id: "breakoutRetest", label: "Breakout Retest", family: "breakout", run: breakoutRetest, grid: { retestBars: [6, 12], slAtr: [1.0, 1.5], tpR: [1.5, 2.0] } },
  { id: "nr7Breakout", label: "NR7 Daily Breakout", family: "volatility", run: nr7Breakout, grid: { nrN: [4, 7], buffer: [0.1, 0.2], tpR: [1.5, 2.0] } },
  { id: "londonCloseFade", label: "London-Close Fade", family: "meanReversion", run: londonCloseFade, grid: { sigHour: [15, 16], stretch: [0.6, 0.8], tgt: [0.25, 0.35] } },
  { id: "adrExhaustionFade", label: "ADR Exhaustion Fade", family: "meanReversion", run: adrExhaustionFade, grid: { trig: [1.0, 1.2], tgt: [0.25, 0.35], slAdr: [0.5, 0.75] } },
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
