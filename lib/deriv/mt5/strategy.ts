/**
 * DERIV MT5 — "Adaptive Regime Dual-Engine" (ARDE) v2, post-backtest overhaul.
 *
 * One engine, three profiles. A regime classifier (EMA stack + ADX + Choppiness)
 * routes every symbol between a TREND engine (confirmed Donchian breakout +
 * ATR-trailing with winner-side pyramiding) and a RANGE engine (z-score fade
 * with hard stops). The in-between regime is "manage only, no new entry".
 *
 * v2 changes — each one removes a loss driver measured in the 3-year backtest
 * campaign (lib/deriv/mt5/backtest) or fixes a live-execution defect:
 *  - Signals fire only on CLOSED bars (engine drops the forming bar) and the
 *    breakout must CLOSE 0.1·ATR beyond the channel — no more tick-poke entries.
 *  - COST-ADMISSION GATE: a signal is rejected unless the symbol's typical
 *    spread is ≤10% of the stop distance, and the take-profit is placed so the
 *    reward:risk floor holds NET of spread.
 *  - ROLLOVER BLACKOUT: no new 24/5-market entries 21:00–22:59 UTC, where
 *    spreads blow out and stops get swept.
 *  - Higher-timeframe alignment: trend entries must agree with the H4 EMA
 *    regime when the engine provides it.
 *  - Pyramid adds are WINNER-side (+1R, +2R…), never below entry.
 *  - The transitional regime is never traded (it was the single largest bleeder).
 *
 * Thresholds are ATR/percent-normalised so the same code is valid on a 5-digit
 * forex pair and a 2-digit synthetic index.
 */
import type { Candle, EngineOutput, MarketDef, Regime, Side, Signal } from "./types";
import type { ProfileParams } from "./profiles";
import {
  adx, atr, bollinger, choppiness, closes, donchian, ema, emaSeries, keltner, rsi, slope, zScore,
} from "./indicators";

const CHOP_TREND = 38.2; // below → trending
const CHOP_RANGE = 61.8; // above → ranging
const MIN_BARS = 120; // need enough history for stable indicators
const SPREAD_STOP_MAX = 0.10; // spread may cost at most 10% of the stop distance
const BREAKOUT_BUFFER_ATR = 0.1; // close must clear the channel by this × ATR

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

/** True during the 24/5-market rollover dead zone (21:00–22:59 UTC): spreads
 *  blow out and breakouts are noise. 24/7 synthetics are exempt. */
function inRolloverBlackout(m: MarketDef, now: number): boolean {
  if (m.session === "24/7") return false;
  const hour = new Date(now * 1000).getUTCHours();
  return hour === 21 || hour === 22;
}

/** TREND engine — CONFIRMED Donchian breakout in the EMA direction, cost-gated,
 *  ATR-trailed, with winner-side pyramiding at +1R steps. */
function trendSignal(
  c: Candle[], m: MarketDef, p: ProfileParams, side: Side, adxVal: number, now: number,
): EngineOutput | null {
  const price = c[c.length - 1].c;
  const a = atr(c, 14);
  if (!(a > 0)) return null;
  const dc = donchian(c, 20);
  const micro = donchian(c, 10);
  const kel = keltner(c, 20, 2);
  const buf = BREAKOUT_BUFFER_ATR * a;

  // Entry trigger: the bar CLOSED beyond the 20-bar channel plus a buffer, OR a
  // pullback to the EMA21/Keltner mid that then re-closed beyond the 10-bar
  // channel (continuation).
  const brokeOut = side === "buy" ? price >= dc.hi + buf : price <= dc.lo - buf;
  const pulledBack = side === "buy" ? price <= kel.mid * 1.001 : price >= kel.mid * 0.999;
  const microBreak = side === "buy" ? price >= micro.hi + buf : price <= micro.lo - buf;
  const trigger = brokeOut || (pulledBack && microBreak);
  if (!trigger) return null;

  const stopDist = p.atrTrailMult * a;
  const spread = m.spreadEst ?? 0;

  // Cost-admission gate: the spread must be a small fraction of the stop.
  if (spread > 0 && spread / stopDist > SPREAD_STOP_MAX) return null;

  // Place the TP so minRR holds NET of spread: reward ≥ minRR·(risk+spread)+spread.
  const tpDist = p.minRR * (stopDist + spread) + spread;
  const stopLoss = side === "buy" ? price - stopDist : price + stopDist;
  const takeProfit = side === "buy" ? price + tpDist : price - tpDist;

  // Winner-side pyramiding: add ONLY as the trade proves itself, at +1R steps.
  // (The old below-entry adds bought into deteriorating trades — measured loser.)
  const adds = [];
  for (let i = 1; i <= p.maxPyramidAdds; i++) {
    const level = side === "buy" ? price + i * stopDist : price - i * stopDist;
    // don't stack an add on top of (or past) the take-profit
    if (side === "buy" ? level >= takeProfit : level <= takeProfit) break;
    adds.push({ price: round(level, m.digits), sizePct: round(p.riskPerTradePct / (i + 1), 2) });
  }

  // Partials at R multiples (1R = the stop distance); a runner stays on the trail.
  const partials = p.partials.map((pp) => ({
    price: round(side === "buy" ? price + pp.atR * stopDist : price - pp.atR * stopDist, m.digits),
    closePct: pp.closePct,
  }));

  const strength = clamp((adxVal - p.adxGate) / 25, 0, 1); // how far past the gate
  const confidence = Math.round(clamp(58 + strength * 34, 0, 95));

  const sig: Signal = {
    symbol: m.mt5, ws: m.ws, name: m.name, category: m.category, corr: m.corr, side,
    regime: side === "buy" ? "trend_up" : "trend_down",
    confidence, entry: round(price, m.digits),
    stopLoss: round(stopLoss, m.digits), takeProfit: round(takeProfit, m.digits),
    riskPct: p.riskPerTradePct, trailAtr: round(stopDist, m.digits),
    adds, partials,
    reason: `Trend ${side === "buy" ? "up" : "down"} · ADX ${adxVal.toFixed(0)} · ${brokeOut ? "confirmed breakout" : "pullback continuation"}`,
    digits: m.digits, generatedAt: now, ttlSec: 180,
  };
  return sig;
}

/** RANGE engine — z-score mean-reversion with a hard stop, cost-gated. Disabled
 *  on trend-only synthetics (Crash/Boom). */
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
  if (Math.abs(z) >= 3) return null; // too stretched to fade safely — stand aside

  const sd = Math.abs(price - bb.mid) / Math.max(Math.abs(z), 1e-9); // ≈ 1σ in price
  // Stop sits BEYOND the entry (away from the mean), floored by a fraction of ATR
  // so it never degenerates to a noise-width stop as |z|→3.
  const stopDist = Math.max(0.6 * a, (3 - Math.abs(z)) * sd);
  const spread = m.spreadEst ?? 0;
  if (spread > 0 && spread / stopDist > SPREAD_STOP_MAX) return null; // cost gate

  const stopLoss = side === "buy" ? price - stopDist : price + stopDist;
  const takeProfit = bb.mid; // revert to the mean
  const rrNet = (Math.abs(takeProfit - price) - spread) / (stopDist + spread);
  if (rrNet < 1.0) return null; // range trades are lower-RR; floor at 1 net of costs

  const partials = [{ price: round((price + bb.mid) / 2, m.digits), closePct: 50 }];
  const confidence = Math.round(clamp(52 + (Math.abs(z) - 2) * 20, 0, 88));

  const sig: Signal = {
    symbol: m.mt5, ws: m.ws, name: m.name, category: m.category, corr: m.corr, side,
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
 * Evaluate one symbol on CLOSED candles. Returns a Signal to act on, or a
 * NoSignal explaining why we're standing aside. `now` is injected (unix seconds)
 * for deterministic tests. `htfDir` is the higher-timeframe (H4) regime direction
 * when the engine has it — trend entries must agree with it.
 */
export function evaluate(
  candles: Candle[], market: MarketDef, profile: ProfileParams, now: number, htfDir?: Side | null,
): EngineOutput {
  if (candles.length < MIN_BARS) return noSignal(market, "no_trade", "warming up (not enough history)", now);
  if (inRolloverBlackout(market, now)) return noSignal(market, "no_trade", "rollover blackout (21–23 UTC) — spreads widen, stands aside", now);
  const { regime, adxVal, dir } = classify(candles, profile.adxGate);

  if (regime === "trend_up" || regime === "trend_down") {
    const side: Side = regime === "trend_up" ? "buy" : "sell";
    if (htfDir && htfDir !== side) return noSignal(market, regime, "trend disagrees with the H4 regime — standing aside", now);
    return trendSignal(candles, market, profile, side, adxVal, now) ?? noSignal(market, regime, "in trend, waiting for a confirmed entry", now);
  }
  if (regime === "range") {
    return rangeSignal(candles, market, profile, now) ?? noSignal(market, regime, "ranging, no cost-worthy fade available", now);
  }
  // The transitional regime is NEVER traded — the backtests showed it was the
  // single largest source of losses (low-quality signals at the thinnest edge).
  return noSignal(market, regime, regime === "transitional" ? "regime unclear — standing aside" : "no tradable regime", now);
}

/** Directional bias helper (for UI badges) — the EMA-stack slope. */
export function bias(candles: Candle[]): Side | null {
  if (candles.length < 55) return null;
  const s = slope(emaSeries(closes(candles), 21), 5);
  return s > 0 ? "buy" : s < 0 ? "sell" : null;
}

/** H4 regime direction from higher-timeframe candles (EMA21 vs EMA55). */
export function htfDirection(h4Candles: Candle[]): Side | null {
  if (h4Candles.length < 60) return null;
  const v = closes(h4Candles);
  const e21 = ema(v, 21), e55 = ema(v, 55);
  if (e21 > e55) return "buy";
  if (e21 < e55) return "sell";
  return null;
}
