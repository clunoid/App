"use client";

/**
 * SIMULATED DERIV BOT — same Strategy + BotUI contract as engine.ts, but synthetic
 * ticks and probabilistic settlements instead of a live WebSocket.
 */
import { DERIV_PIP_DECIMALS, BOT_DEFAULTS } from "./config";
import {
  calculateSimProfit,
  getContractDurationMs,
  getNextTradeDelayMs,
  simContractKey,
  simulateTradeOutcome,
} from "./simBase";
import type { Strategy, StrategyCtx, TradeSpec, BotUI, BotStats, BotConfig } from "./types";

const round2 = (v: number) => Math.round(v * 100) / 100;
const POLL_MS = 500;
const TICK_MS = 220;

/** Seed quotes per volatility index — jittered on each tick. */
const QUOTE_SEED: Record<string, number> = { R_10: 5012.345, R_25: 2891.234, R_50: 123.4567, R_75: 51234.56, R_100: 891.23 };

let ACTIVE_SIM: { stop: (msg?: string, kind?: "info" | "success" | "warning" | "error") => void } | null = null;

export class SimulatedDerivBot {
  private ui: BotUI;
  private strategy: Strategy;
  private markets: string[];
  private quotes = new Map<string, number>();

  private config: BotConfig = {
    initialStake: BOT_DEFAULTS.initialStake,
    takeProfit: BOT_DEFAULTS.takeProfit,
    stopLoss: BOT_DEFAULTS.stopLoss,
    martingaleMultiplier: BOT_DEFAULTS.martingaleMultiplier,
  };

  private currentStake: number = BOT_DEFAULTS.initialStake;
  private tradeStake: number = BOT_DEFAULTS.initialStake;
  private tradeInProgress = false;
  private currentMarket = "";
  private currentTarget = "";
  private pendingSpec: TradeSpec | null = null;

  private totalProfit = 0;
  private totalTrades = 0;
  private wins = 0;
  private consecutiveLosses = 0;
  private results: boolean[] = [];
  private balance = 0;
  private currency = "USD";
  private startTime = 0;

  private isRunning = false;
  private stopRequested = false;
  private stopMessage: { msg: string; kind: "info" | "success" | "warning" | "error" } | null = null;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ui: BotUI, strategy: Strategy, startingBalance: number, currency = "USD") {
    this.ui = ui;
    this.strategy = strategy;
    this.markets = [...strategy.markets];
    this.balance = startingBalance;
    this.currency = currency;
    for (const m of this.markets) this.quotes.set(m, QUOTE_SEED[m] ?? 100 + Math.random() * 900);
  }

  setBalance(amount: number): void {
    this.balance = round2(amount);
    this.ui.onBalance(this.balance, this.currency);
    this.pushStats();
  }

  start(config: BotConfig): void {
    if (this.isRunning) { this.ui.onStatus("Bot is already running.", "warning"); return; }

    this.config = { ...this.config, ...config };
    this.currentStake = this.config.initialStake;
    this.tradeStake = this.config.initialStake;
    this.totalProfit = 0; this.totalTrades = 0; this.wins = 0; this.consecutiveLosses = 0; this.results = [];
    this.tradeInProgress = false; this.currentMarket = ""; this.currentTarget = ""; this.pendingSpec = null;
    this.strategy.reset();

    if (ACTIVE_SIM && ACTIVE_SIM !== this) { try { ACTIVE_SIM.stop("Stopped — another bot was started.", "info"); } catch { /* ignore */ } }
    ACTIVE_SIM = this;

    this.isRunning = true; this.stopRequested = false;
    this.startTime = Date.now();
    this.ui.onRunning(true);
    this.ui.onBalance(this.balance, this.currency);
    this.ui.onStatus("Simulation running…", "success");
    this.startTickLoop();
    this.startStatsTimer();
    this.scheduleAttempt(400);
  }

  stop(msg = "Bot stopped", kind: "info" | "success" | "warning" | "error" = "info"): void {
    this.stopRequested = true;
    this.stopMessage = { msg, kind };
    this.finishStop();
  }

  private ctx(): StrategyCtx {
    return {
      consecutiveLosses: this.consecutiveLosses,
      totalTrades: this.totalTrades,
      results: this.results,
      runningSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }

  private startTickLoop(): void {
    this.stopTickLoop();
    this.tickTimer = setInterval(() => {
      if (!this.isRunning || this.stopRequested) return;
      for (const m of this.markets) {
        const prev = this.quotes.get(m) ?? QUOTE_SEED[m] ?? 100;
        const step = (Math.random() - 0.5) * (m === "R_50" || m === "R_75" ? 0.8 : 4.2);
        const next = Math.max(0.01, prev + step);
        this.quotes.set(m, next);
        const decimals = DERIV_PIP_DECIMALS[m] ?? 2;
        const lastDigit = parseInt(next.toFixed(decimals).slice(-1), 10);
        this.strategy.onTick(m, next, Number.isNaN(lastDigit) ? 0 : lastDigit);
      }
    }, TICK_MS);
  }

  private stopTickLoop(): void {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
  }

  private scheduleAttempt(delay: number): void {
    if (!this.isRunning || this.stopRequested) return;
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    this.attemptTimer = setTimeout(() => this.attemptTrade(), delay);
  }

  private attemptTrade(): void {
    if (!this.isRunning || this.stopRequested || this.tradeInProgress) return;

    const spec = this.strategy.nextTrade(this.ctx());
    if (!spec) { this.scheduleAttempt(POLL_MS); return; }

    this.tradeStake = round2(this.currentStake * (spec.stakeFactor ?? 1));
    if (this.balance < this.tradeStake) {
      this.ui.onStatus("Balance too low for this stake — edit your sim balance and Apply.", "warning");
      this.scheduleAttempt(POLL_MS);
      return;
    }

    this.tradeInProgress = true;
    this.pendingSpec = spec;
    this.currentMarket = spec.market;
    this.currentTarget = spec.targetLabel;
    this.pushStats();

    this.settleTimer = setTimeout(() => this.settleTrade(spec), getContractDurationMs(spec.duration));
  }

  private settleTrade(spec: TradeSpec): void {
    if (!this.isRunning || this.stopRequested) return;

    const key = simContractKey(spec);
    const win = simulateTradeOutcome(key, this.consecutiveLosses, this.results);
    const profit = calculateSimProfit(this.tradeStake, key, win);

    this.balance = round2(this.balance + profit);
    this.totalProfit = round2(this.totalProfit + profit);
    this.totalTrades += 1;
    this.results.push(win);
    if (this.results.length > 20) this.results.shift();

    if (win) {
      this.wins += 1;
      this.consecutiveLosses = 0;
      this.currentStake = this.config.initialStake;
    } else {
      this.consecutiveLosses += 1;
      if (this.strategy.supportsMartingale) {
        this.currentStake = round2(this.currentStake * (this.config.martingaleMultiplier || 1));
      }
    }
    this.strategy.onResult(win, this.ctx());

    this.ui.onTrade({ win, profit, stake: this.tradeStake, market: this.currentMarket, target: this.currentTarget, at: Date.now() });
    this.ui.onBalance(this.balance, this.currency);
    this.pushStats();

    this.tradeInProgress = false;
    this.pendingSpec = null;

    if (this.shouldStop()) return;
    this.scheduleAttempt(getNextTradeDelayMs(spec.duration));
  }

  private shouldStop(): boolean {
    if (this.config.takeProfit > 0 && this.totalProfit >= this.config.takeProfit) {
      this.ui.onFinish?.("take-profit", this.snapshot());
      this.stop(`🎯 Take-profit hit: +${this.totalProfit.toFixed(2)} ${this.currency}. Bot stopped.`, "success");
      return true;
    }
    if (this.config.stopLoss > 0 && this.totalProfit <= -Math.abs(this.config.stopLoss)) {
      this.ui.onFinish?.("stop-loss", this.snapshot());
      this.stop(`🛑 Stop-loss hit: ${this.totalProfit.toFixed(2)} ${this.currency}. Bot stopped.`, "error");
      return true;
    }
    const extra = this.strategy.postTradeStop?.(this.ctx());
    if (extra) { this.stop(extra, "warning"); return true; }
    return false;
  }

  private startStatsTimer(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = setInterval(() => { if (this.isRunning) this.pushStats(); }, 1000);
  }

  private pushStats(): void { this.ui.onStats(this.snapshot()); }

  private snapshot(): BotStats {
    return {
      balance: this.balance,
      currency: this.currency,
      totalProfit: this.totalProfit,
      totalTrades: this.totalTrades,
      wins: this.wins,
      winRate: this.totalTrades ? (this.wins / this.totalTrades) * 100 : 0,
      currentStake: this.tradeInProgress ? this.tradeStake : this.currentStake,
      consecutiveLosses: this.consecutiveLosses,
      market: this.currentMarket || "—",
      target: this.currentTarget || "—",
      runningSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }

  private finishStop(): void {
    this.isRunning = false;
    this.tradeInProgress = false;
    this.stopTickLoop();
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    if (this.attemptTimer) { clearTimeout(this.attemptTimer); this.attemptTimer = null; }
    if (this.settleTimer) { clearTimeout(this.settleTimer); this.settleTimer = null; }
    if (ACTIVE_SIM === this) ACTIVE_SIM = null;
    this.ui.onRunning(false);
    if (this.stopMessage) this.ui.onStatus(this.stopMessage.msg, this.stopMessage.kind);
  }
}
