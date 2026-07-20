/**
 * Stock-index bot constants — kept beside the registry so the page never
 * hard-codes numbers that must agree with the EA. These MIRROR
 * ClunoidIndicesMT5.mq5: if a risk cap or the session window changes there,
 * change it here too.
 */

export type IndexProfile = {
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

export const INDEX_PROFILES: IndexProfile[] = [
  {
    key: "aggressive",
    label: "Aggressive",
    riskPerTradePct: 1.0,
    maxOpenRiskPct: 5.0,
    maxAdds: 2,
    ret: 25.9,
    maxDD: 5.2,
    profitFactor: 2.11,
    blurb: "The default. Full 1% per trade, and adds to a winner up to twice while the trend holds.",
  },
  {
    key: "moderate",
    label: "Moderate",
    riskPerTradePct: 0.6,
    maxOpenRiskPct: 3.0,
    maxAdds: 1,
    ret: 14.4,
    maxDD: 2.5,
    profitFactor: 2.18,
    blurb: "Same reading of the market, smaller stake. One add per trend at most.",
  },
  {
    key: "conservative",
    label: "Conservative",
    riskPerTradePct: 0.35,
    maxOpenRiskPct: 1.5,
    maxAdds: 0,
    ret: 6.4,
    maxDD: 1.1,
    profitFactor: 2.21,
    blurb: "Same setups again, smallest stake, and never adds to a position.",
  },
];

/**
 * Every index with usable history, put through the identical strategy and the
 * identical 72-setting grid. What decided the shipped pair was not the headline
 * number but how WIDE the winning region was — a result that survives almost
 * anywhere in the parameter space is a property of the market; one that survives
 * at a single setting is usually a property of the search.
 */
export const INDEX_SHOOTOUT = [
  { name: "Swiss 20", robust: "27 / 34", profitFactor: 2.63, verdict: "ships", ok: true },
  { name: "Wall Street 30", robust: "31 / 42", profitFactor: 1.79, verdict: "ships", ok: true },
  { name: "UK 100", robust: "11 / 58", profitFactor: 1.37, verdict: "thin", ok: false },
  { name: "Australia 200", robust: "4 / 48", profitFactor: 1.92, verdict: "thin", ok: false },
  { name: "Germany 40", robust: "4 / 48", profitFactor: 1.54, verdict: "thin", ok: false },
  { name: "US 500", robust: "1 / 46", profitFactor: 1.39, verdict: "thin", ok: false },
  { name: "Euro 50", robust: "1 / 32", profitFactor: 1.15, verdict: "thin", ok: false },
  { name: "Netherlands 25", robust: "0 / 46", profitFactor: 1.21, verdict: "fails", ok: false },
  { name: "US Tech 100", robust: "0 / 40", profitFactor: 1.25, verdict: "fails", ok: false },
  { name: "Japan 225", robust: "0 / 54", profitFactor: 0.86, verdict: "fails", ok: false },
  { name: "France 40", robust: "0 / 48", profitFactor: 0.79, verdict: "fails", ok: false },
];

export const INDEX_TEST = {
  dataset: "Real Deriv data for 11 stock indices, 1 year (Jul 2025 → Jul 2026)",
  shipped: ["Swiss 20", "Wall Street 30"],
  sharedConfigs: { robust: 41, tested: 48 },
  trades: 53,
  winRate: 65.9,
  halves: { first: 2.24, second: 1.99 },
  perIndex: [
    { name: "Swiss 20", profitFactor: 1.92, ret: 12.2, trades: 30 },
    { name: "Wall Street 30", profitFactor: 1.6, ret: 13.5, trades: 42 },
  ],
  stress: [
    { label: "As quoted", profitFactor: 2.11 },
    { label: "Double cost", profitFactor: 1.94 },
    { label: "Quadruple cost", profitFactor: 1.64 },
  ],
  /** Measured live on Deriv: a typical stop at the 0.10 minimum lot. */
  typicalStopCostUsd: 19.33,
  session: "07:00–16:59 GMT",
};

/**
 * The bot we tested and deliberately did NOT build. Recorded here because the
 * finding is worth as much as a shipped product: it tells you where not to put
 * your money.
 */
export const SYNTHETICS_VERDICT = {
  tested: 28,
  combinations: 936,
  profitableShare: 28,
  families: "13 Volatility indices, plus all Crash, Boom and Jump indices",
  signatures: [
    { label: "volatility clustering", synthetic: "≈ 0", real: "0.27 on Bitcoin" },
    { label: "moves beyond 4 sigma", synthetic: "0.00–0.01%", real: "0.86% on Bitcoin" },
    { label: "momentum carry-over", synthetic: "≈ 0", real: "≈ 0" },
    { label: "correlation to each other", synthetic: "0.009", real: "0.86 BTC/ETH" },
  ],
};
