/**
 * DERIV MT5 — market registry.
 *
 * Live-verified against Deriv's WebSocket `active_symbols` (2026-07-16): symbols,
 * pip sizes and sessions are real. `ws` = Deriv WS symbol (data source); `mt5` =
 * the symbol the EA trades in the terminal.
 *
 * We ship FOREX first (the user's step 1). Synthetics + other categories are
 * registered so the market picker can show them, and light up as we extend the
 * engine to each category.
 */
import type { MarketDef, MarketCategory } from "./types";

const digitsFromPip = (pip: number): number => Math.max(0, Math.round(-Math.log10(pip)));

const def = (
  ws: string,
  mt5: string,
  name: string,
  category: MarketCategory,
  pip: number,
  session: MarketDef["session"],
  corr: string,
  spreadEst = 0,
  trendOnly = false,
): MarketDef => ({ ws, mt5, name, category, pip, digits: digitsFromPip(pip), session, corr, spreadEst, trendOnly });

/* ── FOREX (24/5) — post-backtest basket ─────────────────────────────────────
   Trimmed to the pairs where spread is a small fraction of a normal stop: the
   3-year backtests showed the expensive minors (GBP/NZD-class, 3-4.5 pips) were
   consistent losers under EVERY configuration — the spread tax alone sank them.
   `spreadEst` = typical Deriv spread in PRICE units (calibrated from live
   bid/ask sampling); the engine's cost gates reject any signal whose stop can't
   comfortably pay it. Correlation clusters group same-currency exposure so one
   USD bet never counts as three. */
export const FOREX: MarketDef[] = [
  // Majors
  def("frxEURUSD", "EURUSD", "EUR/USD", "forex", 0.00001, "24/5", "USD"),
  def("frxGBPUSD", "GBPUSD", "GBP/USD", "forex", 0.00001, "24/5", "USD"),
  def("frxAUDUSD", "AUDUSD", "AUD/USD", "forex", 0.00001, "24/5", "AUD-USD"),
  def("frxUSDCAD", "USDCAD", "USD/CAD", "forex", 0.00001, "24/5", "USD-CAD"),
  def("frxUSDCHF", "USDCHF", "USD/CHF", "forex", 0.00001, "24/5", "USD-CHF"),
  def("frxUSDJPY", "USDJPY", "USD/JPY", "forex", 0.001, "24/5", "JPY"),
  def("frxEURJPY", "EURJPY", "EUR/JPY", "forex", 0.001, "24/5", "JPY"),
  def("frxGBPJPY", "GBPJPY", "GBP/JPY", "forex", 0.001, "24/5", "JPY"),
  def("frxAUDJPY", "AUDJPY", "AUD/JPY", "forex", 0.001, "24/5", "JPY"),
  def("frxEURGBP", "EURGBP", "EUR/GBP", "forex", 0.00001, "24/5", "EUR-GBP"),
  def("frxEURAUD", "EURAUD", "EUR/AUD", "forex", 0.00001, "24/5", "AUD"),
  def("frxEURCAD", "EURCAD", "EUR/CAD", "forex", 0.00001, "24/5", "CAD"),
  def("frxEURCHF", "EURCHF", "EUR/CHF", "forex", 0.00001, "24/5", "CHF"),
  def("frxGBPAUD", "GBPAUD", "GBP/AUD", "forex", 0.00001, "24/5", "AUD"),
  // Minors
  def("frxAUDCAD", "AUDCAD", "AUD/CAD", "forex", 0.00001, "24/5", "AUD"),
  def("frxAUDCHF", "AUDCHF", "AUD/CHF", "forex", 0.00001, "24/5", "CHF"),
  def("frxAUDNZD", "AUDNZD", "AUD/NZD", "forex", 0.00001, "24/5", "AUD-NZD"),
  def("frxEURNZD", "EURNZD", "EUR/NZD", "forex", 0.00001, "24/5", "NZD"),
  def("frxGBPCAD", "GBPCAD", "GBP/CAD", "forex", 0.00001, "24/5", "CAD"),
  def("frxGBPCHF", "GBPCHF", "GBP/CHF", "forex", 0.00001, "24/5", "CHF"),
  def("frxGBPNZD", "GBPNZD", "GBP/NZD", "forex", 0.00001, "24/5", "NZD"),
  def("frxNZDUSD", "NZDUSD", "NZD/USD", "forex", 0.00001, "24/5", "USD-NZD"),
  def("frxNZDJPY", "NZDJPY", "NZD/JPY", "forex", 0.001, "24/5", "JPY"),
];

/* ── SYNTHETICS (24/7) — next up; registered now for the picker ────────────── */
export const VOLATILITY: MarketDef[] = [
  def("R_10", "Volatility 10 Index", "Volatility 10", "volatility", 0.001, "24/7", "vol-10"),
  def("R_25", "Volatility 25 Index", "Volatility 25", "volatility", 0.001, "24/7", "vol-25"),
  def("R_50", "Volatility 50 Index", "Volatility 50", "volatility", 0.0001, "24/7", "vol-50"),
  def("R_75", "Volatility 75 Index", "Volatility 75", "volatility", 0.0001, "24/7", "vol-75"),
  def("R_100", "Volatility 100 Index", "Volatility 100", "volatility", 0.01, "24/7", "vol-100"),
  def("1HZ10V", "Volatility 10 (1s) Index", "Volatility 10 (1s)", "volatility", 0.01, "24/7", "vol-10"),
  def("1HZ25V", "Volatility 25 (1s) Index", "Volatility 25 (1s)", "volatility", 0.01, "24/7", "vol-25"),
  def("1HZ50V", "Volatility 50 (1s) Index", "Volatility 50 (1s)", "volatility", 0.01, "24/7", "vol-50"),
  def("1HZ75V", "Volatility 75 (1s) Index", "Volatility 75 (1s)", "volatility", 0.01, "24/7", "vol-75"),
  def("1HZ100V", "Volatility 100 (1s) Index", "Volatility 100 (1s)", "volatility", 0.01, "24/7", "vol-100"),
];

// Crash/Boom are ASYMMETRIC — trend-only, never fade the spike direction.
export const CRASH_BOOM: MarketDef[] = [
  def("BOOM500", "Boom 500 Index", "Boom 500", "crash_boom", 0.001, "24/7", "boom", 0, true),
  def("BOOM1000", "Boom 1000 Index", "Boom 1000", "crash_boom", 0.001, "24/7", "boom", 0, true),
  def("CRASH500", "Crash 500 Index", "Crash 500", "crash_boom", 0.001, "24/7", "crash", 0, true),
  def("CRASH1000", "Crash 1000 Index", "Crash 1000", "crash_boom", 0.001, "24/7", "crash", 0, true),
];

export const STEP: MarketDef[] = [
  def("stpRNG", "Step Index", "Step Index 100", "step", 0.1, "24/7", "step"),
];

export const METALS: MarketDef[] = [
  def("frxXAUUSD", "XAUUSD", "Gold/USD", "metals", 0.01, "24/5", "metal-gold"),
  def("frxXAGUSD", "XAGUSD", "Silver/USD", "metals", 0.0001, "24/5", "metal-silver"),
];

export const CRYPTO: MarketDef[] = [
  def("cryBTCUSD", "BTCUSD", "BTC/USD", "crypto", 0.001, "24/7", "crypto-btc"),
  def("cryETHUSD", "ETHUSD", "ETH/USD", "crypto", 0.00001, "24/7", "crypto-eth"),
];

/** Everything registered (forex is the only one the engine trades in step 1). */
export const ALL_MARKETS: MarketDef[] = [
  ...FOREX,
  ...VOLATILITY,
  ...CRASH_BOOM,
  ...STEP,
  ...METALS,
  ...CRYPTO,
];

export const CATEGORY_LABELS: Record<MarketCategory, string> = {
  forex: "Forex",
  volatility: "Volatility Indices",
  crash_boom: "Crash / Boom",
  jump: "Jump Indices",
  step: "Step Index",
  range_break: "Range Break",
  indices: "Stock Indices",
  metals: "Metals",
  crypto: "Crypto",
  basket: "Baskets",
};

/** Categories the engine trades TODAY (rest are "coming online"). */
export const LIVE_CATEGORIES: MarketCategory[] = ["forex"];

export const marketByWs = (ws: string): MarketDef | undefined => ALL_MARKETS.find((m) => m.ws === ws);
export const marketsByCategory = (c: MarketCategory): MarketDef[] => ALL_MARKETS.filter((m) => m.category === c);
