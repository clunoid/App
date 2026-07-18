"use client";

/**
 * DERIV BOT ENGINE — the shared runtime behind every bot.
 *
 * Owns EVERYTHING except the strategy: the new-API connection (OTP → account-scoped
 * WebSocket on api.derivws.com, reusing the command-center OAuth token + 33PP…),
 * exactly-one-trade-at-a-time execution, martingale, take-profit/stop-loss,
 * reconnection with mid-buy reconciliation, the watchdog, and live stats. Each bot
 * only implements a Strategy (types.ts) that decides WHAT to trade next — so all
 * bots work identically to our first one, differing only in their brain.
 */
import { DERIV_VOLATILITY_MARKETS, DERIV_PIP_DECIMALS, BOT_DEFAULTS } from "./config";
import { fetchTradeSocketUrl } from "./session";
import type { Strategy, StrategyCtx, TradeSpec, BotUI, BotStats, BotAccount, BotConfig } from "./types";

const round2 = (v: number) => Math.round(v * 100) / 100;
const POLL_MS = 500;         // re-check for a signal when the strategy is waiting
const POST_TRADE_MS = 900;   // pace between settled trades

/** Only ONE bot may run at a time across the whole app. Starting a bot stops any other. */
let ACTIVE_BOT: { stop: (msg?: string, kind?: "info" | "success" | "warning" | "error") => void } | null = null;

export class DerivBot {
  private ui: BotUI;
  private accessToken: string;
  private accountId: string;
  private strategy: Strategy;
  private markets: string[];

  private ws: WebSocket | null = null;
  private isRunning = false;
  private stopRequested = false;
  private isReconnecting = false;

  private config: BotConfig = {
    initialStake: BOT_DEFAULTS.initialStake,
    takeProfit: BOT_DEFAULTS.takeProfit,
    stopLoss: BOT_DEFAULTS.stopLoss,
    martingaleMultiplier: BOT_DEFAULTS.martingaleMultiplier,
  };

  private currentStake: number = BOT_DEFAULTS.initialStake; // martingale base
  private tradeStake: number = BOT_DEFAULTS.initialStake;   // actual stake of the last/current trade
  private activeContractId: number | null = null;
  private tradeInProgress = false;
  private awaitingProposal = false;
  private buyInFlight = false;
  private currentMarket = "";
  private currentTarget = "";

  private totalProfit = 0;
  private totalTrades = 0;
  private wins = 0;
  private consecutiveLosses = 0;
  private results: boolean[] = [];
  private balance = 0;
  private currency = "USD";
  private startTime = 0;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;
  private tradeStartedAt = 0;
  private stopMessage: { msg: string; kind: "info" | "success" | "warning" | "error" } | null = null;

  constructor(ui: BotUI, account: BotAccount, strategy: Strategy) {
    this.ui = ui;
    this.accessToken = account.accessToken;
    this.accountId = account.accountId;
    this.currency = account.currency || "USD";
    this.strategy = strategy;
    this.markets = [...strategy.markets];
  }

  start(config: BotConfig): void {
    if (this.isRunning) { this.ui.onStatus("Bot is already running.", "warning"); return; }
    if (!this.accessToken || !this.accountId) { this.ui.onStatus("Connect your Deriv account first.", "error"); return; }

    this.config = { ...this.config, ...config };
    this.currentStake = this.config.initialStake;
    this.tradeStake = this.config.initialStake;
    this.totalProfit = 0; this.totalTrades = 0; this.wins = 0; this.consecutiveLosses = 0; this.results = [];
    this.activeContractId = null; this.tradeInProgress = false; this.awaitingProposal = false; this.buyInFlight = false;
    this.currentMarket = ""; this.currentTarget = "";
    this.reconnectAttempts = 0;
    this.strategy.reset();

    // One bot at a time — stop any other running bot before we take over.
    if (ACTIVE_BOT && ACTIVE_BOT !== this) { try { ACTIVE_BOT.stop("Stopped — another bot was started.", "info"); } catch { /* ignore */ } }
    ACTIVE_BOT = this;

    this.isRunning = true; this.stopRequested = false;
    this.startTime = Date.now();
    this.ui.onRunning(true);
    this.ui.onStatus("Opening your Deriv trading session…", "info");
    this.startStatsTimer();
    void this.connect();
  }

  stop(msg = "Bot stopped", kind: "info" | "success" | "warning" | "error" = "info"): void {
    this.stopRequested = true;
    this.stopMessage = { msg, kind };
    if (this.attemptTimer) { clearTimeout(this.attemptTimer); this.attemptTimer = null; }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      try { this.ws.close(); } catch { /* ignore */ }
    } else {
      this.finishStop();
    }
  }

  private async connect(): Promise<void> {
    if (this.stopRequested) return;
    let url: string;
    try {
      url = await fetchTradeSocketUrl(this.accessToken, this.accountId);
    } catch (e) {
      this.attemptReconnect(e instanceof Error ? e.message : "Couldn't open the trading session.");
      return;
    }
    if (this.stopRequested) return;

    let ws: WebSocket;
    try { ws = new WebSocket(url); }
    catch { this.attemptReconnect("Couldn't open the trading connection."); return; }
    this.ws = ws;

    ws.onopen = () => {
      const resuming = this.isReconnecting;
      this.reconnectAttempts = 0; this.isReconnecting = false;
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      this.ui.onStatus(resuming ? "Reconnected. Resuming…" : "Connected. Running…", "success");
      this.send({ balance: 1, subscribe: 1 });
      for (const m of this.markets) this.send({ ticks: m, subscribe: 1 });
      // Mid-trade reconnect reconciliation (identical to our first bot).
      if (this.activeContractId) {
        this.send({ proposal_open_contract: 1, contract_id: this.activeContractId, subscribe: 1 });
      } else if (this.buyInFlight) {
        this.send({ proposal_open_contract: 1, subscribe: 1 });
        this.armWatchdog();
      } else {
        this.tradeInProgress = false; this.awaitingProposal = false;
      }
      this.startPing();
      if (!this.tradeInProgress) this.scheduleAttempt(0);
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data as string);
    ws.onerror = () => { if (!this.stopRequested && !this.isReconnecting) this.attemptReconnect("Connection error. Reconnecting…"); };
    ws.onclose = () => {
      this.stopPing();
      if (this.stopRequested) this.finishStop();
      else if (!this.isReconnecting) this.attemptReconnect("Connection lost. Reconnecting…");
    };
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private ctx(): StrategyCtx {
    return {
      consecutiveLosses: this.consecutiveLosses,
      totalTrades: this.totalTrades,
      results: this.results,
      runningSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }

  private handleMessage(raw: string): void {
    if (!this.isRunning && !this.isReconnecting) return;
    let d: Record<string, unknown>;
    try { d = JSON.parse(raw); } catch { return; }

    if (d.error) {
      const err = d.error as { code?: string; message?: string };
      const inTradeMsg = d.msg_type === "proposal" || d.msg_type === "buy";
      if (err.code === "InvalidToken" || err.code === "AuthorizationRequired" || err.code === "InvalidOTP" || err.code === "OTPExpired") {
        this.ui.onStatus("Session refreshing…", "warning");
        this.attemptReconnect("Refreshing the trading session…");
        return;
      }
      if (err.code === "RateLimit" || err.code === "TooManyRequests") {
        this.ui.onStatus("Rate limited — pausing briefly…", "warning");
        if (inTradeMsg) this.freeTrade();
        this.scheduleAttempt(5000);
        return;
      }
      this.ui.onStatus(err.message || "Deriv returned an error.", "error");
      if (inTradeMsg) { this.freeTrade(); this.scheduleAttempt(1500); }
      return;
    }

    switch (d.msg_type) {
      case "balance": {
        const b = d.balance as { balance?: number; currency?: string } | undefined;
        if (b && typeof b.balance !== "undefined") { this.balance = Number(b.balance); this.currency = b.currency || this.currency; this.ui.onBalance(this.balance, this.currency); }
        break;
      }
      case "proposal": {
        const p = d.proposal as { id?: string; ask_price?: number } | undefined;
        if (this.isRunning && this.awaitingProposal && p?.id) {
          this.awaitingProposal = false;
          this.buyInFlight = true;
          this.send({ buy: p.id, price: p.ask_price });
        }
        break;
      }
      case "buy": {
        const b = d.buy as { contract_id?: number; balance_after?: number } | undefined;
        if (b?.contract_id) {
          this.activeContractId = b.contract_id;
          this.buyInFlight = false;
          this.send({ proposal_open_contract: 1, contract_id: b.contract_id, subscribe: 1 });
        }
        if (b && typeof b.balance_after !== "undefined") { this.balance = Number(b.balance_after); this.ui.onBalance(this.balance, this.currency); }
        break;
      }
      case "proposal_open_contract":
        this.handleContract(d.proposal_open_contract as Record<string, unknown>);
        break;
      case "tick":
        this.recordTick(d.tick as { symbol?: string; quote?: number; pip_size?: number } | undefined);
        break;
      default:
        break;
    }
  }

  private recordTick(tick?: { symbol?: string; quote?: number; pip_size?: number }): void {
    if (!tick?.symbol || typeof tick.quote === "undefined") return;
    const quote = Number(tick.quote);
    const decimals = typeof tick.pip_size === "number" ? tick.pip_size : (DERIV_PIP_DECIMALS[tick.symbol] ?? 2);
    const lastDigit = parseInt(quote.toFixed(decimals).slice(-1), 10);
    this.strategy.onTick(tick.symbol, quote, Number.isNaN(lastDigit) ? 0 : lastDigit);
  }

  private scheduleAttempt(delay: number): void {
    if (!this.isRunning || this.stopRequested) return;
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    this.attemptTimer = setTimeout(() => this.attemptTrade(), delay);
  }

  private attemptTrade(): void {
    if (!this.isRunning || this.stopRequested || this.tradeInProgress) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { if (!this.isReconnecting) this.attemptReconnect("Reconnecting…"); return; }

    const spec = this.strategy.nextTrade(this.ctx());
    if (!spec) { this.scheduleAttempt(POLL_MS); return; } // no signal yet — keep polling

    this.tradeStake = round2(this.currentStake * (spec.stakeFactor ?? 1));
    this.tradeInProgress = true;
    this.awaitingProposal = true;
    this.tradeStartedAt = Date.now();
    this.currentMarket = spec.market;
    this.currentTarget = spec.targetLabel;
    this.armWatchdog();

    const msg: Record<string, unknown> = {
      proposal: 1,
      amount: this.tradeStake, // NUMBER (schema is type:number)
      basis: "stake",
      contract_type: spec.contractType,
      currency: this.currency || "USD",
      duration: spec.duration,
      duration_unit: "t",
      underlying_symbol: spec.market,
    };
    if (spec.barrier !== undefined) msg.barrier = spec.barrier;
    this.send(msg);
  }

  private handleContract(c: Record<string, unknown>): void {
    if (!c || typeof c.contract_id === "undefined") return;
    const cid = Number(c.contract_id);
    // Adopt an orphaned buy after a mid-buy reconnect (match market + stake).
    if (this.activeContractId === null && this.buyInFlight) {
      const sym = String(c.underlying_symbol || "");
      const bp = Number(c.buy_price);
      if (sym === this.currentMarket && Math.abs(bp - this.tradeStake) < 0.01) {
        this.activeContractId = cid;
        this.buyInFlight = false;
      }
    }
    if (this.activeContractId === null || cid !== this.activeContractId) return;
    if (!c.is_sold) return;

    const profit = Number(c.profit) || 0;
    const stake = Number(c.buy_price) || this.tradeStake;
    const isWin = profit > 0;

    this.totalProfit = round2(this.totalProfit + profit);
    this.totalTrades += 1;
    this.results.push(isWin);
    if (this.results.length > 20) this.results.shift();
    this.freeTrade();

    if (isWin) {
      this.wins += 1;
      this.consecutiveLosses = 0;
      this.currentStake = this.config.initialStake;
    } else {
      this.consecutiveLosses += 1;
      if (this.strategy.supportsMartingale) {
        this.currentStake = round2(this.currentStake * (this.config.martingaleMultiplier || 1));
      }
    }
    this.strategy.onResult(isWin, this.ctx());

    this.ui.onTrade({ win: isWin, profit, stake, market: this.currentMarket, target: this.currentTarget, at: Date.now() });
    this.pushStats();

    if (this.shouldStop()) return;
    this.scheduleAttempt(POST_TRADE_MS);
  }

  private shouldStop(): boolean {
    // Stop ONLY on realised P/L — take-profit or stop-loss (never on stake size).
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

  private freeTrade(): void {
    this.tradeInProgress = false;
    this.awaitingProposal = false;
    this.buyInFlight = false;
    this.activeContractId = null;
    if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
  }

  private armWatchdog(): void {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      if (!(this.isRunning && this.tradeInProgress && Date.now() - this.tradeStartedAt > 25000)) return;
      this.ui.onStatus("Trade update stalled — re-syncing…", "warning");
      if (this.activeContractId) this.send({ proposal_open_contract: 1, contract_id: this.activeContractId, subscribe: 1 });
      else this.send({ proposal_open_contract: 1, subscribe: 1 });
      this.watchdogTimer = setTimeout(() => {
        if (this.isRunning && this.tradeInProgress) { this.freeTrade(); this.scheduleAttempt(1500); }
      }, 4000);
    }, 30000);
  }

  private attemptReconnect(message: string): void {
    if (this.stopRequested || this.isReconnecting) return;
    this.isReconnecting = true;
    this.reconnectAttempts += 1;
    this.stopPing();
    if (this.reconnectAttempts > 10) { this.ui.onStatus("Couldn't reconnect. Please restart the bot.", "error"); this.stop("Connection failed.", "error"); return; }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    this.ui.onStatus(`${message} (attempt ${this.reconnectAttempts}/10)`, "warning");
    if (this.ws) { try { this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null; this.ws.close(); } catch { /* ignore */ } }
    this.reconnectTimer = setTimeout(() => { if (!this.stopRequested) void this.connect(); }, delay);
  }

  private startPing(): void { this.stopPing(); this.pingTimer = setInterval(() => this.send({ ping: 1 }), 20000); }
  private stopPing(): void { if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; } }

  private startStatsTimer(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = setInterval(() => { if (this.isRunning) this.pushStats(); }, 1000);
  }
  private pushStats(): void { this.ui.onStats(this.snapshot()); }

  private snapshot(): BotStats {
    return {
      balance: this.balance, currency: this.currency,
      totalProfit: this.totalProfit, totalTrades: this.totalTrades, wins: this.wins,
      winRate: this.totalTrades ? (this.wins / this.totalTrades) * 100 : 0,
      currentStake: this.tradeStake, consecutiveLosses: this.consecutiveLosses,
      market: this.currentMarket || "—", target: this.currentTarget || "—",
      runningSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }

  private finishStop(): void {
    this.isRunning = false; this.tradeInProgress = false; this.awaitingProposal = false; this.buyInFlight = false; this.activeContractId = null;
    this.stopPing();
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
    if (this.attemptTimer) { clearTimeout(this.attemptTimer); this.attemptTimer = null; }
    if (this.ws) { try { this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null; this.ws.close(); } catch { /* ignore */ } this.ws = null; }
    if (ACTIVE_BOT === this) ACTIVE_BOT = null;
    this.ui.onRunning(false);
    if (this.stopMessage) this.ui.onStatus(this.stopMessage.msg, this.stopMessage.kind);
  }
}

/** Convenience for digit strategies that trade all Volatility indices. */
export const ALL_MARKETS = [...DERIV_VOLATILITY_MARKETS];
