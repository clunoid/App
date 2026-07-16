/**
 * DERIV MT5 — "Adaptive Regime Dual-Engine" (ARDE).
 *
 * One engine, three profiles. A regime classifier (EMA stack + ADX + Choppiness)
 * routes every symbol, every bar, between a TREND engine (breakout + ATR-trailing
 * with pyramiding) and a RANGE engine (mean-reversion with hard stops). The
 * in-between regime is "manage only, no new entry" — the single rule that kills
 * most whipsaw losses. Continuous cadence comes from scanning a basket, not from
 * over-trading one chopping symbol.
 *
 * Thresholds are ATR/percent-normalised so the same code is valid on a 5-digit
 * forex pair and a 2-digit synthetic index. Output is a Signal the EA executes
 * verbatim, or a NoSignal (stand aside).
 */
import type { Candle, EngineOutput, MarketDef, Regime, Side, Signal } from "./types";
import type { ProfileParams } from "./profiles";
import {
  adx, atr, bollinger, choppiness, closes, donchian, ema, emaSeries, keltner, rsi, slope, zScore,
} from "./indicators";

const CHOP_TREND = 38.2; // below → trending
const CHOP_RANGE = 61.8; // above → ranging
const MIN_BARS = 120; // need enough history for stable indicators

const round = (v: number, digits: number) => Number(v.toFixed(digits));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function noSignal(m: MarketDef, regime: Regime, reason: string, now: number): EngineOutput {
  return { symbol: m.mt5, ws: m.ws, name: m.name, category: m.category, regime, reason, generatedAt: now };
}

/** Classify the current regime from the EMA stack, ADX strength and Choppiness. */
function classify(c: Candle[], adxGate: number): { regime: Regime; adxVal: number; chop: number; dir: Side | null } {
  const v = closes(c);
  const e8 = ema(v, 8), e21 = ema(v, 21), e55 = ema(v, 55);
  const adxVal = adx(c, 14);
  const chop = choppiness(c, 14);
  const up = e8 > e21 && e21 > e55;
  const down = e8 < e21 && e21 < e55;
  const dir: Side | null = up ? "buy" : down ? "sell" : null;

  if (adxVal >= adxGate && chop < CHOP_TREND && dir) {
    return { regime: dir === "buy" ? "trend_up" : "trend_down", adxVal, chop, dir };
  }
  if (adxVal < 20 && chop > CHOP_RANGE) return { regime: "range", adxVal, chop, dir: null };
  return { regime: "transitional", adxVal, chop, dir };
}

/** TREND engine — Donchian breakout in the EMA direction, ATR-trailed, pyramided. */
function trendSignal(
  c: Candle[], m: MarketDef, p: ProfileParams, side: Side, adxVal: number, now: number,
): EngineOutput | null {
  const price = c[c.length - 1].c;
  const a = atr(c, 14);
  if (!(a > 0)) return null;
  const dc = donchian(c, 20);
  const micro = donchian(c, 10);
  const kel = keltner(c, 20, 2);

  // Entry trigger: fresh breakout of the 20-bar channel, OR a pullback to the
  // EMA21/Keltner mid that then re-breaks the 10-bar channel (continuation).
  const brokeOut = side === "buy" ? price >= dc.hi : price <= dc.lo;
  const pulledBack = side === "buy" ? price <= kel.mid * 1.001 : price >= kel.mid * 0.999;
  const microBreak = side === "buy" ? price >= micro.hi : price <= micro.lo;
  const trigger = brokeOut || (pulledBack && microBreak);
  if (!trigger) return null;

  const stopDist = p.atrTrailMult * a;
  const stopLoss = side === "buy" ? price - stopDist : price + stopDist;
  const takeProfit = side === "buy" ? price + p.minRR * stopDist : price - p.minRR * stopDist;

  // Pyramiding: add on pullbacks toward EMA21, each add smaller than the last.
  const adds = [];
  const e21 = ema(closes(c), 21);
  for (let i = 1; i <= p.maxPyramidAdds; i++) {
    const back = side === "buy" ? e21 - i * 0.15 * a : e21 + i * 0.15 * a;
    adds.push({ price: round(back, m.digits), sizePct: round(p.riskPerTradePct / (i + 1), 2) });
  }

  // Partials at R multiples along the way (1R = the stop distance); a runner
  // stays on the ATR trail.
  const partials = p.partials.map((pp) => ({
    price: round(side === "buy" ? price + pp.atR * stopDist : price - pp.atR * stopDist, m.digits),
    closePct: pp.closePct,
  }));

  const strength = clamp((adxVal - p.adxGate) / 25, 0, 1); // how far past the gate
  const confidence = Math.round(clamp(58 + strength * 34, 0, 95));

  const sig: Signal = {
    symbol: m.mt5, ws: m.ws, name: m.name, category: m.category, side,
    regime: side === "buy" ? "trend_up" : "trend_down",
    confidence, entry: round(price, m.digits),
    stopLoss: round(stopLoss, m.digits), takeProfit: round(takeProfit, m.digits),
    riskPct: p.riskPerTradePct, trailAtr: round(stopDist, m.digits),
    adds, partials,
    reason: `Trend ${side === "buy" ? "up" : "down"} · ADX ${adxVal.toFixed(0)} · ${brokeOut ? "channel breakout" : "pullback continuation"}`,
    digits: m.digits, generatedAt: now, ttlSec: 180,
  };
  return sig;
}

/** RANGE engine — z-score mean-reversion with a hard z≈±3 stop. Disabled on
 *  trend-only synthetics (Crash/Boom). */
function rangeSignal(c: Candle[], m: MarketDef, p: ProfileParams, now: number): EngineOutput | null {
  if (m.trendOnly) return null;
  const price = c[c.length - 1].c;
  const a = atr(c, 14);
  const z = zScore(c, 20);
  const bb = bollinger(c, 20, 2);
  const r = rsi(c, 14);
  const loBand = m.category === "volatility" ? 20 : 30;
  const hiBand = m.category === "volatility" ? 80 : 70;

  let side: Side | null = null;
  if (z <= -2 && r <= loBand) side = "buy";
  else if (z >= 2 && r >= hiBand) side = "sell";
  if (!side) return null;

  const sd = Math.abs(price - bb.mid) / Math.max(Math.abs(z), 1e-9); // ≈ 1σ in price
  const stopLoss = side === "buy" ? bb.mid - 3 * sd : bb.mid + 3 * sd; // hard z=±3
  const takeProfit = bb.mid; // revert to the mean
  const stopDist = Math.abs(price - stopLoss);
  const rr = Math.abs(takeProfit - price) / Math.max(stopDist, 1e-9);
  if (rr < Math.min(p.minRR, 1.0)) return null; // range trades are lower-RR; floor at 1

  const partials = [{ price: round((price + bb.mid) / 2, m.digits), closePct: 50 }];
  const confidence = Math.round(clamp(52 + (Math.abs(z) - 2) * 20, 0, 88));

  const sig: Signal = {
    symbol: m.mt5, ws: m.ws, name: m.name, category: m.category, side,
    regime: "range", confidence, entry: round(price, m.digits),
    stopLoss: round(stopLoss, m.digits), takeProfit: round(takeProfit, m.digits),
    riskPct: p.riskPerTradePct * 0.8, // ranges get slightly less risk than trends
    trailAtr: round(p.atrTrailMult * a, m.digits),
    adds: [], partials,
    reason: `Range fade · z ${z.toFixed(1)} · RSI ${r.toFixed(0)}`,
    digits: m.digits, generatedAt: now, ttlSec: 180,
  };
  return sig;
}

/**
 * Evaluate one symbol. Returns a Signal to act on, or a NoSignal explaining why
 * we're standing aside. `now` is injected (unix seconds) for deterministic tests.
 */
export function evaluate(candles: Candle[], market: MarketDef, profile: ProfileParams, now: number): EngineOutput {
  if (candles.length < MIN_BARS) return noSignal(market, "no_trade", "warming up (not enough history)", now);
  const { regime, adxVal, dir } = classify(candles, profile.adxGate);

  if (regime === "trend_up" || regime === "trend_down") {
    const side: Side = regime === "trend_up" ? "buy" : "sell";
    return trendSignal(candles, market, profile, side, adxVal, now) ?? noSignal(market, regime, "in trend, waiting for entry trigger", now);
  }
  if (regime === "range") {
    return rangeSignal(candles, market, profile, now) ?? noSignal(market, regime, "ranging, price not at a band extreme", now);
  }
  // transitional — only Aggressive trades it, reduced size, trend-direction only.
  if (regime === "transitional" && profile.tradeTransitional && dir && !market.trendOnly) {
    const s = trendSignal(candles, market, profile, dir, Math.max(adxVal, profile.adxGate), now);
    if (s && "side" in s) {
      s.riskPct = round(s.riskPct * 0.5, 2);
      s.confidence = Math.min(s.confidence, 62);
      s.reason = `Transitional ${dir === "buy" ? "up" : "down"} (reduced size) · ${s.reason}`;
      return s;
    }
  }
  return noSignal(market, regime, regime === "transitional" ? "regime unclear — standing aside" : "no tradable regime", now);
}

/** Directional bias helper (for UI badges) — the EMA-stack slope. */
export function bias(candles: Candle[]): Side | null {
  if (candles.length < 55) return null;
  const s = slope(emaSeries(closes(candles), 21), 5);
  return s > 0 ? "buy" : s < 0 ? "sell" : null;
}
