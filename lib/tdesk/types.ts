/**
 * CLUNOID TRADING DESK — core types.
 *
 * The quant core (types, indicators, data, strategies, backtest, validation) is
 * pure TypeScript with NO framework imports and NO path aliases, so the exact
 * same code runs in three places with one source of truth:
 *   • the research runner (npx tsx lib/trading/research/run.ts) — multi-year
 *     walk-forward validation that SELECTS each pair's live configuration,
 *   • the production scanner (/api/tdesk/scan) — generates live signals with
 *     the validated configs only,
 *   • the terminal UI — renders the same evidence objects it was tested on.
 */

/** A tradeable market. Historically named `Pair` (the desk began FX-only);
 *  since 2026-07 it also covers metals, energies and equity-index futures. */
export type Pair =
  | "EURUSD" | "GBPUSD" | "USDJPY" | "USDCHF" | "AUDUSD" | "NZDUSD" | "USDCAD"
  | "EURGBP" | "EURJPY" | "GBPJPY" | "AUDJPY" | "AUDCAD"
  | "XAUUSD" | "XAGUSD" | "USOIL" | "NATGAS" | "SPX500" | "NAS100" | "US30";
/** The 19-market desk universe: seven USD majors + five liquid crosses +
 *  two metals + two energies + three equity indices (CME/NYMEX futures feeds).
 *  Ordering = watchlist order. */
export const PAIRS: Pair[] = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD",
  "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "AUDCAD",
  "XAUUSD", "XAGUSD", "USOIL", "NATGAS", "SPX500", "NAS100", "US30",
];

/** Markets fed by CME-group futures (Globex clock: Sun ~22:00 → Fri ~21:00 UTC
 *  with a daily maintenance halt — vs the FX Sun 21:00 → Fri 21:00 clock). */
export const FUTURES_MARKETS: ReadonlySet<Pair> = new Set<Pair>(["XAUUSD", "XAGUSD", "USOIL", "NATGAS", "SPX500", "NAS100", "US30"]);

/** 2h/4h are resampled server-side from the 1h feed (Yahoo has no native 2h/4h)
 *  by the SAME resample code in research and live — see data.resampleBars. */
export type Timeframe = "15m" | "30m" | "1h" | "2h" | "4h";

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
  /** Optional time-boxed exit: close at market after this many bars if neither
   *  stop nor target hit (session strategies whose edge is intraday only).
   *  Absent = the engine-wide 60-bar TTL. Backtest and live resolver honor it
   *  through the SAME expiry path, so the mirror invariant is untouched. */
  maxBars?: number;
  /** Optional chandelier trailing stop: stop ratchets to (extreme since entry
   *  − trailMult × trailAtr), never loosening. `trailAtr` is the SIGNAL-BAR ATR
   *  FROZEN at setup construction — the only design where the live resolver can
   *  recompute the exact trail the backtest saw (a live-recomputed ATR could
   *  never bit-match the backtest's recursion). R stays denominated in the
   *  ORIGINAL stop. Both fields or neither. */
  trailMult?: number;
  trailAtr?: number;
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
  /** Optional per-signal time-boxed exit (bars) — see Setup.maxBars. */
  maxBars?: number;
  /** Optional chandelier trail params — see Setup.trailMult/trailAtr. */
  trailMult?: number;
  trailAtr?: number;
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

/** Point size per market — the unit all spread/slippage figures below are
 *  denominated in. For FX this is the classic pip; for futures it's a
 *  market-natural point (gold $0.10, oil ¢1, indices 1 pt, gas $0.001). */
export const PIP: Record<Pair, number> = {
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,
  USDCHF: 0.0001,
  AUDUSD: 0.0001,
  NZDUSD: 0.0001,
  USDCAD: 0.0001,
  EURGBP: 0.0001,
  EURJPY: 0.01,
  GBPJPY: 0.01,
  AUDJPY: 0.01,
  AUDCAD: 0.0001,
  XAUUSD: 0.1,
  XAGUSD: 0.01,
  USOIL: 0.01,
  NATGAS: 0.001,
  SPX500: 1,
  NAS100: 1,
  US30: 1,
};

/** Conservative typical retail spreads (in PIP units above) used as the COST
 *  model in every backtest and in live R:R math — sourced from major-broker
 *  published averages; deliberately on the expensive side so validation
 *  under-promises. Crosses pay more than majors by construction; futures
 *  spreads verified against retail CFD ranges (gold $0.50, oil $0.05, ES 0.75pt). */
export const SPREAD_PIPS: Record<Pair, number> = {
  EURUSD: 0.9,
  GBPUSD: 1.3,
  USDJPY: 1.0,
  USDCHF: 1.4,
  AUDUSD: 1.1,
  NZDUSD: 1.6,
  USDCAD: 1.5,
  EURGBP: 1.5,
  EURJPY: 1.6,
  GBPJPY: 2.5,
  AUDJPY: 1.8,
  AUDCAD: 2.0,
  XAUUSD: 5,
  XAGUSD: 4,
  USOIL: 5,
  NATGAS: 6,
  SPX500: 0.75,
  NAS100: 2.5,
  US30: 4,
};

/** Extra slippage assumption per side (in PIP units) — expensive-side like the
 *  spread model; futures slip more points in fast tape than FX slips pips. */
export const SLIPPAGE_PIPS: Record<Pair, number> = {
  EURUSD: 0.3,
  GBPUSD: 0.3,
  USDJPY: 0.3,
  USDCHF: 0.3,
  AUDUSD: 0.3,
  NZDUSD: 0.3,
  USDCAD: 0.3,
  EURGBP: 0.3,
  EURJPY: 0.3,
  GBPJPY: 0.3,
  AUDJPY: 0.3,
  AUDCAD: 0.3,
  XAUUSD: 2,
  XAGUSD: 1,
  USOIL: 2,
  NATGAS: 2,
  SPX500: 0.25,
  NAS100: 0.5,
  US30: 1,
};

/** Display decimals per market (the canonical formatter — UI imports this). */
const DIGITS: Record<Pair, number> = {
  EURUSD: 5,
  GBPUSD: 5,
  USDJPY: 3,
  USDCHF: 5,
  AUDUSD: 5,
  NZDUSD: 5,
  USDCAD: 5,
  EURGBP: 5,
  EURJPY: 3,
  GBPJPY: 3,
  AUDJPY: 3,
  AUDCAD: 5,
  XAUUSD: 2,
  XAGUSD: 3,
  USOIL: 2,
  NATGAS: 3,
  SPX500: 2,
  NAS100: 2,
  US30: 0,
};
export const digitsFor = (pair: Pair): number => DIGITS[pair];
/** Unit label for point-denominated displays ("p" pips for FX, "pt" for futures). */
export const pointLabel = (pair: Pair): string => (FUTURES_MARKETS.has(pair) ? "pt" : "p");
export const fmtPrice = (pair: Pair, p: number): string => p.toFixed(digitsFor(pair));
