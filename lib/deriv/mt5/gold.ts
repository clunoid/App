/**
 * Gold bot constants — kept beside the registry so the page never hard-codes
 * numbers that must agree with the EA. These MIRROR ClunoidGoldMT5.mq5: if a
 * risk cap changes there, change it here too.
 */

export type GoldProfile = {
  key: "conservative" | "moderate" | "aggressive";
  label: string;
  riskPerTradePct: number;
  maxOpenRiskPct: number;
  maxAdds: number;
  blurb: string;
};

export const GOLD_PROFILES: GoldProfile[] = [
  {
    key: "aggressive",
    label: "Aggressive",
    riskPerTradePct: 1.0,
    maxOpenRiskPct: 5.0,
    maxAdds: 2,
    blurb: "The default. Full 1% per trade and adds to a winner up to twice while the trend holds.",
  },
  {
    key: "moderate",
    label: "Moderate",
    riskPerTradePct: 0.6,
    maxOpenRiskPct: 3.0,
    maxAdds: 1,
    blurb: "Same reading of the market, smaller stake. One add per trend at most.",
  },
  {
    key: "conservative",
    label: "Conservative",
    riskPerTradePct: 0.35,
    maxOpenRiskPct: 1.5,
    maxAdds: 0,
    blurb: "Same setups again, smallest stake, and never adds to a position.",
  },
];

/**
 * What the strategy actually did in testing. These are HISTORICAL results on
 * real Deriv gold prices, not a forecast — quoted here so the bot's claims can
 * be checked rather than taken on trust.
 */
export const GOLD_TEST = {
  dataset: "Real Deriv XAUUSD, 1 year (5,778 H1 bars, Jul 2025 → Jul 2026)",
  spreadNote: "Dealing costs charged on every fill, including a doubled-spread stress run",
  strategy: [
    { profile: "Aggressive", trades: 82, winRate: 45.1, profitFactor: 1.61, avgRR: 2.12, maxDD: 24.3 },
    { profile: "Moderate", trades: 60, winRate: 45.0, profitFactor: 1.55, avgRR: 2.14, maxDD: 13.3 },
  ],
  terminal: {
    label: "MetaTrader 5 Strategy Tester — Deriv XAUUSD, Jan–Jul 2026, $10,000, Aggressive",
    trades: 57,
    takeProfits: 19,
    partials: 20,
    returnPct: 4.6,
  },
  /** Below this, the broker's minimum gold lot forces more risk than the caps allow. */
  comfortableBalanceUsd: 5000,
};
