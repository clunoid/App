/**
 * Synthetic-index bot constants — kept beside the registry so the page never
 * hard-codes numbers that must agree with the EA. These MIRROR
 * ClunoidVolatilityMT5.mq5.
 */

export type VolProfile = {
  key: "conservative" | "moderate" | "aggressive";
  label: string;
  riskPerTradePct: number;
  ret: number;
  maxDD: number;
  profitFactor: number;
  blurb: string;
};

export const VOL_PROFILES: VolProfile[] = [
  {
    key: "aggressive",
    label: "Aggressive",
    riskPerTradePct: 1.0,
    ret: 108.1,
    maxDD: 15.9,
    profitFactor: 1.65,
    blurb: "The default. Full 1% of the balance risked on each break.",
  },
  {
    key: "moderate",
    label: "Moderate",
    riskPerTradePct: 0.6,
    ret: 56.3,
    maxDD: 9.8,
    profitFactor: 1.69,
    blurb: "The same breaks, a smaller stake, and noticeably calmer equity.",
  },
  {
    key: "conservative",
    label: "Conservative",
    riskPerTradePct: 0.35,
    ret: 30.1,
    maxDD: 5.8,
    profitFactor: 1.72,
    blurb: "The same breaks again, smallest stake, shallowest drawdown.",
  },
];

/**
 * The search. Almost every synthetic Deriv offers is a generated random walk;
 * one is not. This is the number that separated them: the efficiency ratio,
 * which measures how much ground a market covers versus how far it travels to
 * get there. A pure random walk scores 0.256.
 */
export const VOL_SEARCH = {
  scanned: "13 Volatility indices, every Crash, Boom and Jump index, the Step indices, Range Break and Daily Reset",
  combinations: 936,
  profitableShare: 28,
  randomWalkRef: 0.256,
  efficiency: [
    { name: "Range Break 200", value: 0.292, vsRw: 14.3, note: "travels — the one we trade", ok: true },
    { name: "Range Break 100", value: 0.254, vsRw: -0.7, note: "indistinguishable from chance", ok: false },
    { name: "Volatility 10–100", value: 0.208, vsRw: -18.6, note: "zigzags more than chance", ok: false },
    { name: "Crash / Boom", value: 0.205, vsRw: -19.9, note: "zigzags more than chance", ok: false },
    { name: "Jump indices", value: 0.204, vsRw: -20.3, note: "zigzags more than chance", ok: false },
    { name: "Step indices", value: 0.196, vsRw: -25.2, note: "zigzags more than chance", ok: false },
  ],
};

/** Range-breakout results, every candidate scored on both halves of the year. */
export const VOL_SHOOTOUT = [
  { name: "Range Break 200", robust: "36 / 144", profitFactor: 1.65, verdict: "ships", ok: true },
  { name: "Range Break 100", robust: "4 / 108", profitFactor: 1.27, verdict: "thin", ok: false },
  { name: "Step Index 100", robust: "0 / 108", profitFactor: 1.0, verdict: "fails", ok: false },
  { name: "Step Index 200", robust: "0 / 108", profitFactor: 1.07, verdict: "fails", ok: false },
  { name: "Step Index 300", robust: "0 / 108", profitFactor: 0.93, verdict: "fails", ok: false },
  { name: "Step Index 400", robust: "0 / 108", profitFactor: 0.95, verdict: "fails", ok: false },
  { name: "Step Index 500", robust: "0 / 108", profitFactor: 1.16, verdict: "fails", ok: false },
];

export const VOL_TEST = {
  dataset: "Real Deriv Range Break 200 data, 1 year (8,761 H1 bars, Jul 2025 → Jul 2026)",
  trades: 176,
  winRate: 40.9,
  halves: { first: 1.67, second: 1.64 },
  /** Backtested at 0.02%; the live feed measured 0.0029%, so the test was ~7x pessimistic. */
  assumedSpread: 0.02,
  liveSpread: 0.0029,
  stress: [
    { label: "As tested (7× real spread)", profitFactor: 1.65 },
    { label: "14× real spread", profitFactor: 1.46 },
    { label: "28× real spread", profitFactor: 1.11 },
  ],
  minLot: 0.01,
};
