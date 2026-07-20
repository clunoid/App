/**
 * Forex bot constants — kept beside the registry so the page never hard-codes
 * numbers that must agree with the EA. These MIRROR ClunoidForexMT5.mq5: if a
 * risk cap or the session window changes there, change it here too.
 */

export type ForexProfile = {
  key: "conservative" | "moderate" | "aggressive";
  label: string;
  riskPerTradePct: number;
  maxOpenRiskPct: number;
  maxAdds: number;
  ret: number;
  maxDD: number;
  profitFactor: number;
  blurb: string;
};

export const FOREX_PROFILES: ForexProfile[] = [
  {
    key: "aggressive",
    label: "Aggressive",
    riskPerTradePct: 1.0,
    maxOpenRiskPct: 5.0,
    maxAdds: 2,
    ret: 9.9,
    maxDD: 2.5,
    profitFactor: 2.09,
    blurb: "The default. Full 1% per trade, and adds to a winner up to twice while the trend holds.",
  },
  {
    key: "moderate",
    label: "Moderate",
    riskPerTradePct: 0.6,
    maxOpenRiskPct: 3.0,
    maxAdds: 1,
    ret: 5.9,
    maxDD: 1.5,
    profitFactor: 2.1,
    blurb: "Same reading of the market, smaller stake. One add per trend at most.",
  },
  {
    key: "conservative",
    label: "Conservative",
    riskPerTradePct: 0.35,
    maxOpenRiskPct: 1.5,
    maxAdds: 0,
    ret: 3.8,
    maxDD: 0.9,
    profitFactor: 2.4,
    blurb: "Same setups again, smallest stake, and never adds to a position.",
  },
];

/**
 * Every major, tested the same way: identical strategy, identical 128-config
 * grid, each candidate scored on BOTH halves of the year separately. This table
 * is the reason the bot trades USD/JPY and not "the majors".
 */
export const FOREX_SHOOTOUT = [
  { pair: "USD/JPY", profitFactor: 2.09, ret: 9.9, halves: "2.37 / 2.00", verdict: "ships", ok: true },
  { pair: "USD/CHF", profitFactor: 1.43, ret: 2.9, halves: "1.51 / 1.35", verdict: "positive, thin", ok: true },
  { pair: "USD/CAD", profitFactor: 1.21, ret: 1.7, halves: "1.09 / 1.31", verdict: "positive, thin", ok: true },
  { pair: "AUD/USD", profitFactor: 0.98, ret: -0.2, halves: "1.30 / 0.60", verdict: "fails", ok: false },
  { pair: "EUR/USD", profitFactor: 0.95, ret: -0.5, halves: "1.32 / 0.70", verdict: "fails", ok: false },
  { pair: "GBP/USD", profitFactor: 0.73, ret: -2.7, halves: "2.22 / 0.28", verdict: "fails", ok: false },
  { pair: "NZD/USD", profitFactor: 0.33, ret: -10.1, halves: "0.62 / 0.00", verdict: "fails", ok: false },
];

/** The single most important measurement behind the design. */
export const FOREX_SESSION_EVIDENCE = {
  window: "12:00–16:59 GMT",
  inSession: { robust: 14, tested: 14, medianPF: 1.92 },
  allHours: { robust: 0, tested: 48, medianPF: 0.83 },
};

export const FOREX_TEST = {
  dataset: "Real Deriv data for all seven majors, 1 year (6,061 H1 bars per pair, Jul 2025 → Jul 2026)",
  costNote: "Per-pair spreads plus daily carry, then re-run at double and quadruple cost",
  stress: [
    { label: "As quoted", profitFactor: 2.09, ret: 9.9 },
    { label: "Double cost", profitFactor: 1.85, ret: 8.3 },
    { label: "Quadruple cost", profitFactor: 1.46, ret: 5.1 },
  ],
  trades: 22,
  winRate: 68.6,
  /** Deriv's real minimum: a typical USDJPY stop at 0.01 lots costs about this. */
  typicalStopCostUsd: 0.96,
};
