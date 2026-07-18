/**
 * Shared types for the Deriv bots — one generic engine (engine.ts) drives every
 * bot; each bot is a self-contained Strategy that only decides WHAT to trade next.
 * The engine owns the connection, one-trade-at-a-time execution, martingale, TP/SL,
 * reconnection/reconciliation and stats — exactly like our first bot.
 */

/** One trade the strategy wants the engine to place. */
export type TradeSpec = {
  market: string;        // Deriv underlying_symbol, e.g. "R_100"
  contractType: string;  // DIGITDIFF | DIGITOVER | DIGITUNDER | DIGITEVEN | DIGITODD | CALL | PUT | NOTOUCH
  barrier?: string;      // digit "0".."9" for DIGIT*, "+0.63"/"-0.63" for NOTOUCH, omitted otherwise
  duration: number;      // in ticks
  stakeFactor?: number;  // multiply the base stake for THIS trade only (default 1) — e.g. Smart Volatility
  targetLabel: string;   // human display, e.g. "Differ 5", "Over 0", "CALL", "Even", "No Touch +0.63"
};

/** Read-only snapshot the engine hands the strategy each decision. */
export type StrategyCtx = {
  consecutiveLosses: number;
  totalTrades: number;
  results: boolean[];    // recent win(true)/loss(false), oldest→newest
  runningSeconds: number;
};

/**
 * A bot's brain. The engine calls onTick as prices arrive, nextTrade when it's
 * ready to place the next trade (return null to wait for a signal), and onResult
 * after each settlement. Everything else (stake, martingale, TP/SL) is the engine's.
 */
export interface Strategy {
  readonly markets: readonly string[]; // symbols to subscribe ticks for
  readonly supportsMartingale: boolean;
  readonly defaultMartingale: number;
  reset(): void;
  onTick(symbol: string, quote: number, lastDigit: number): void;
  nextTrade(ctx: StrategyCtx): TradeSpec | null;
  onResult(win: boolean, ctx: StrategyCtx): void;
  /** Optional extra stop condition checked after TP/SL — return a reason to stop. */
  postTradeStop?(ctx: StrategyCtx): string | null;
}

// ── UI callbacks + view models (shared by every bot's runner) ────────────────

export type TradeRow = {
  win: boolean;
  profit: number;
  stake: number;
  market: string;
  target: string;
  at: number;
};

export type BotStats = {
  balance: number;
  currency: string;
  totalProfit: number;
  totalTrades: number;
  wins: number;
  winRate: number;
  currentStake: number;
  consecutiveLosses: number;
  market: string;
  target: string;
  runningSeconds: number;
};

export type BotUI = {
  onStatus: (msg: string, kind: "info" | "success" | "warning" | "error") => void;
  onStats: (s: BotStats) => void;
  onTrade: (t: TradeRow) => void;
  onRunning: (running: boolean) => void;
  onBalance: (balance: number, currency: string) => void;
  /** Fired when the bot stops because take-profit or stop-loss was reached — the UI
   *  shows a result popup. `summary` is the final stats snapshot. */
  onFinish?: (kind: "take-profit" | "stop-loss", summary: BotStats) => void;
};

/** Which Deriv account the bot trades on (the Demo/Real choice). */
export type BotAccount = { accessToken: string; accountId: string; currency: string };

export type BotConfig = {
  initialStake: number;
  takeProfit: number;
  stopLoss: number;
  martingaleMultiplier: number;
};
