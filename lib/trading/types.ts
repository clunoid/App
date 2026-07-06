/**
 * CLUNOID TRADING DESK — core types.
 *
 * The quant core (types, indicators, data, strategies, backtest, validation) is
 * pure TypeScript with NO framework imports and NO path aliases, so the exact
 * same code runs in three places with one source of truth:
 *   • the research runner (npx tsx lib/trading/research/run.ts) — multi-year
 *     walk-forward validation that SELECTS each pair's live configuration,
 *   • the production scanner (/api/trading/scan) — generates live signals with
 *     the validated configs only,
 *   • the terminal UI — renders the same evidence objects it was tested on.
 */

export type Pair = "EURUSD" | "GBPUSD" | "USDJPY" | "AUDUSD" | "USDCAD";
export const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"];

export type Timeframe = "15m" | "30m" | "1h";

/** One OHLCV bar. `t` = bar OPEN time, epoch ms UTC. Volume is tick volume where
 *  the provider supplies it (FX has no true volume) and 0 otherwise. */
export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Direction = "long" | "short";

/** A concrete, actionable setup produced by a strategy on a closed bar. */
export type Setup = {
  pair: Pair;
  timeframe: Timeframe;
  direction: Direction;
  /** Entry is the NEXT bar's open in backtests; live, the current market price. */
  entry: number;
  stop: number;
  /** One or more targets, nearest first (e.g. 1R scale-out, then the measured move). */
  targets: number[];
  strategy: string;
  /** Machine-readable factors that fired — becomes the UI evidence list. */
  factors: string[];
  /** Bar index the setup fired on (backtest bookkeeping). */
  barIndex: number;
};

/** A finished (or open) trade in the backtester's ledger. */
export type SimTrade = {
  pair: Pair;
  direction: Direction;
  strategy: string;
  entryTime: number;
  exitTime: number;
  entry: number;
  stop: number;
  target: number;
  exit: number;
  /** Result in R multiples, costs included (-1 = full stop, +2 = 2R winner…). */
  r: number;
  outcome: "tp" | "sl" | "expiry";
  bars: number;
};

/** Aggregate performance of a trade set. All R-based (account-size agnostic). */
export type Metrics = {
  trades: number;
  wins: number;
  winRate: number;
  profitFactor: number;
  expectancyR: number;
  totalR: number;
  maxDrawdownR: number;
  maxLossStreak: number;
  avgBarsHeld: number;
  /** Per-trade Sharpe-like ratio: mean(R) / std(R) · sqrt(trades/years-ish is not
   *  meaningful per-trade, so this is reported as a shape statistic only). */
  sharpeLike: number;
  byMonth: Record<string, number>; // "2025-03" → net R
  byYear: Record<string, number>;
  equityCurve: number[]; // cumulative R after each trade
};

export type MonteCarlo = {
  runs: number;
  /** Distribution of max drawdown across shuffled trade orderings (R). */
  ddP50: number;
  ddP95: number;
  /** Probability the full sequence ends profitable. */
  pProfit: number;
  /** 5th-percentile final equity (R). */
  finalP5: number;
};

/** One walk-forward window's out-of-sample result. */
export type WalkWindow = {
  trainStart: string;
  testStart: string;
  testEnd: string;
  chosenParams: Record<string, number>;
  oos: { trades: number; totalR: number; profitFactor: number };
};

/** The full validation dossier for one pair×strategy candidate. */
export type ValidationReport = {
  pair: Pair;
  strategy: string;
  timeframe: Timeframe;
  params: Record<string, number>;
  /** OOS = concatenated out-of-sample trades from every walk-forward window. */
  oosMetrics: Metrics;
  /** In-sample (full-history, final params) — reported for transparency ONLY;
   *  selection gates use OOS + robustness, never this. */
  inSampleMetrics: Metrics;
  walkForward: WalkWindow[];
  monteCarlo: MonteCarlo;
  /** Fraction of parameter-grid neighbors of the chosen params that stay
   *  profitable over the full series (in-sample plateau/ridge check — anti-overfit). */
  neighborhoodProfitable: number;
  /** Net R by volatility regime tercile (low/mid/high ATR%) — regime analysis. */
  regimeR: { low: number; mid: number; high: number };
  dataStart: string;
  dataEnd: string;
  passed: boolean;
  gateNotes: string[];
};

/** What the scanner runs per pair after research: the champion (and optional
 *  runner-up) that PASSED all robustness gates. Absence = "monitor only". */
export type PairPlaybook = {
  pair: Pair;
  champions: { strategy: string; timeframe: Timeframe; params: Record<string, number>; oosProfitFactor: number; oosTrades: number }[];
  spreadPips: number;
  generatedAt: string;
};

/** A live signal as persisted + shown in the terminal. */
export type LiveSignal = {
  id?: string;
  pair: Pair;
  timeframe: Timeframe;
  direction: Direction;
  entry: number;
  stop: number;
  targets: number[];
  rr: number;
  confidence: number; // 0..100
  strategy: string;
  factors: string[];
  structure: string; // market-structure summary line
  volRegime: "low" | "normal" | "high" | "extreme";
  session: string;
  newsRisk: { level: "clear" | "caution" | "blackout"; events: { title: string; currency: string; at: string; impact: string }[] };
  aiNarrative?: string; // Sonnet explanation (annotation only — never decides)
  warnings: string[];
  status: "open" | "tp" | "sl" | "expired" | "suppressed";
  /** Open time (ISO) of the signal bar — the anchor for outcome resolution. */
  barTime?: string;
  createdAt?: string;
  resolvedAt?: string | null;
  resultR?: number | null;
};

export type EconomicEvent = {
  title: string;
  currency: string; // "USD", "EUR"…
  impact: "High" | "Medium" | "Low" | string;
  at: number; // epoch ms
  forecast?: string;
  previous?: string;
};

/** Pip size per pair (JPY pairs quote 2dp). */
export const PIP: Record<Pair, number> = {
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,
  AUDUSD: 0.0001,
  USDCAD: 0.0001,
};

/** Conservative typical retail spreads (pips) used as the COST model in every
 *  backtest and in live R:R math — sourced from major-broker published averages;
 *  deliberately on the expensive side so validation under-promises. */
export const SPREAD_PIPS: Record<Pair, number> = {
  EURUSD: 0.9,
  GBPUSD: 1.3,
  USDJPY: 1.0,
  AUDUSD: 1.1,
  USDCAD: 1.5,
};

/** Extra slippage assumption per side (pips). */
export const SLIPPAGE_PIPS = 0.3;

export const digitsFor = (pair: Pair): number => (pair === "USDJPY" ? 3 : 5);
export const fmtPrice = (pair: Pair, p: number): string => p.toFixed(digitsFor(pair));
