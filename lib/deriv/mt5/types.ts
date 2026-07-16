/**
 * DERIV MT5 AUTOMATION — shared types.
 *
 * Everything about the Deriv MT5 bots lives under lib/deriv/mt5, components/
 * deriv/mt5, app/trading/deriv/mt5 and app/api/deriv/mt5 — self-contained so the
 * rest of the app is untouched.
 *
 * Data flow (Model A — user-hosted EA, custody-free):
 *   Clunoid cloud  = the BRAIN. Reads Deriv's public market feed, runs the
 *                    strategy engine, emits SIGNALS via /api/deriv/mt5/signals.
 *   User's MT5 EA  = the HANDS. Polls that signal API and executes on the user's
 *                    own terminal (SL/TP, partial closes, pyramiding). Clunoid
 *                    never holds a password.
 */

/** A single OHLC candle (times are unix seconds, UTC). */
export type Candle = { t: number; o: number; h: number; l: number; c: number };

export type MarketCategory =
  | "forex"
  | "volatility"
  | "crash_boom"
  | "jump"
  | "step"
  | "range_break"
  | "indices"
  | "metals"
  | "crypto"
  | "basket";

/** When a market trades. Forex/metals/indices ~24/5; Deriv synthetics 24/7. */
export type Session = "24/5" | "24/7";

/** A tradable instrument. `ws` is Deriv's WebSocket symbol (for pulling data);
 *  `mt5` is the symbol the EA trades in the MT5 terminal. */
export type MarketDef = {
  ws: string; // e.g. "frxEURUSD" / "R_75"
  mt5: string; // e.g. "EURUSD" / "Volatility 75 Index"
  name: string; // "EUR/USD"
  category: MarketCategory;
  pip: number; // smallest price increment (Deriv `pip`)
  digits: number; // price decimal places (derived from pip)
  session: Session;
  /** Correlation cluster — instruments in the same cluster count as one bet. */
  corr: string;
  /** Synthetics that must never be mean-reversion faded (Crash/Boom). */
  trendOnly?: boolean;
};

export type RiskProfile = "conservative" | "moderate" | "aggressive";

/** Market regime the classifier assigns each bar. */
export type Regime = "trend_up" | "trend_down" | "range" | "transitional" | "no_trade";

export type Side = "buy" | "sell";

/** A scale-in level: add when price pulls back to `atEma` and re-breaks. */
export type AddLevel = { price: number; sizePct: number };

/** A partial-profit target: close `closePct` of the position at `price`. */
export type Partial = { price: number; closePct: number };

/**
 * One strategy signal for a symbol+profile. The EA consumes this verbatim.
 * Prices are absolute; `riskPct` is % of current balance to risk on the initial
 * entry (the EA converts it to a lot size using the symbol's contract spec).
 */
export type Signal = {
  symbol: string; // MT5 symbol the EA trades
  ws: string; // WS symbol the signal was computed from
  name: string;
  category: MarketCategory;
  side: Side;
  regime: Regime;
  confidence: number; // 0..100
  entry: number; // reference price at signal time
  stopLoss: number;
  takeProfit: number;
  riskPct: number; // % of balance to risk on the entry
  trailAtr: number; // ATR distance for the trailing stop (price units)
  adds: AddLevel[]; // pyramiding levels (empty for conservative)
  partials: Partial[]; // partial-profit ladder
  reason: string; // human-readable why
  digits: number; // price precision for the EA
  generatedAt: number; // unix seconds
  ttlSec: number; // how long this signal is valid
};

/** "Flat / stand aside" outcome for a symbol (no tradable regime right now). */
export type NoSignal = {
  symbol: string;
  ws: string;
  name: string;
  category: MarketCategory;
  regime: Regime;
  reason: string;
  generatedAt: number;
};

export type EngineOutput = Signal | NoSignal;

export const isSignal = (o: EngineOutput): o is Signal => (o as Signal).side !== undefined;
