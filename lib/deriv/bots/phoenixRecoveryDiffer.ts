"use client";

/**
 * PHOENIX RECOVERY DIFFER — Clunoid's first browser-side Deriv bot.
 *
 * Strategy (Deriv Volatility indices R_10…R_100, 1-tick digit contracts):
 *  - NORMAL mode: DIGITDIFF on one market with a rotating barrier digit (wins
 *    ~90%, small payout).
 *  - On a LOSS: escalate the stake by the martingale multiplier AND switch to
 *    RECOVERY mode — analyse every market's recent last-digit distribution and
 *    trade DIGITOVER-4 / DIGITUNDER-5 (≈50% win, ≈92% payout) on the market with
 *    the strongest bias, so a single win claws back the accumulated losses. Exit
 *    recovery on the first win and reset the stake.
 *
 * Runs entirely client-side over the Deriv WebSocket: authorize → subscribe
 * ticks/balance/contracts → proposal → buy → proposal_open_contract → settle →
 * next. Exactly one contract is open at a time (tradeInProgress + activeContractId).
 *
 * Hardened vs the reference implementation: an explicit ping heartbeat, a trade
 * watchdog that clears a stuck in-progress flag if a settlement never arrives,
 * the in-progress flag is cleared on EVERY error path (not just token/rate-limit),
 * and the stop-loss is pre-checked BEFORE each martingale escalation so a runaway
 * stake can't blow far past the configured stop.
 */
import { DERIV_BOT_WS_URL, DERIV_VOLATILITY_MARKETS, BOT_DEFAULTS, type BotConfig } from "./config";

export type TradeRow = {
  win: boolean;
  profit: number;
  stake: number;
  market: string;
  target: string; // "Differ 7" | "Over 4" | "Under 5"
  recovery: boolean;
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
  recoveryMode: boolean;
  market: string;
  target: string;
  runningSeconds: number;
};

/** The bot pushes updates to the UI through these callbacks. */
export type BotUI = {
  onStatus: (msg: string, kind: "info" | "success" | "warning" | "error") => void;
  onStats: (s: BotStats) => void;
  onTrade: (t: TradeRow) => void;
  onRunning: (running: boolean) => void;
  onBalance: (balance: number, currency: string) => void;
};

type MarketAnalysis = { digits: number[]; over4: number; under5: number; total: number };

const round2 = (v: number) => Math.round(v * 100) / 100;

export class PhoenixRecoveryDiffer {
  private ui: BotUI;
  private token: string;
  private markets = [...DERIV_VOLATILITY_MARKETS];

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

  private currentStake: number = BOT_DEFAULTS.initialStake;
  private activeContractId: number | null = null;
  private tradeInProgress = false;
  private lastMarket: string | null = null;
  private lastDigit: number | null = null;
  private currentMarket = "";
  private currentTarget = "";

  private totalProfit = 0;
  private totalTrades = 0;
  private wins = 0;
  private consecutiveLosses = 0;
  private balance = 0;
  private currency = "USD";
  private startTime = 0;

  private recoveryMode = false;
  private recoveryMarket: string | null = null;
  private recoveryTradeType: "OVER" | "UNDER" | null = null;
  private analysis: Record<string, MarketAnalysis> = {};
  private tickSubs: Record<string, boolean> = {};

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private tradeStartedAt = 0;

  constructor(ui: BotUI, token: string) {
    this.ui = ui;
    this.token = token;
  }

  /** Start the bot with a validated config. */
  start(config: BotConfig): void {
    if (this.isRunning) { this.ui.onStatus("Bot is already running.", "warning"); return; }
    if (!this.token) { this.ui.onStatus("Connect your Deriv account first.", "error"); return; }

    this.config = { ...this.config, ...config };
    this.currentStake = this.config.initialStake;
    this.totalProfit = 0; this.totalTrades = 0; this.wins = 0; this.consecutiveLosses = 0;
    this.lastMarket = null; this.lastDigit = null;
    this.activeContractId = null; this.tradeInProgress = false;
    this.recoveryMode = false; this.recoveryMarket = null; this.recoveryTradeType = null;
    this.analysis = {}; this.tickSubs = {};
    this.reconnectAttempts = 0;

    this.isRunning = true; this.stopRequested = false;
    this.startTime = Date.now();
    this.ui.onRunning(true);
    this.ui.onStatus("Authorizing with Deriv…", "info");
    this.startStatsTimer();
    this.connect();
  }

  stop(msg = "Bot stopped", kind: "info" | "success" | "warning" | "error" = "info"): void {
    this.stopRequested = true;
    this.stopMessage = { msg, kind };
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      try { this.ws.close(); } catch { /* ignore */ }
    } else {
      this.finishStop();
    }
  }
  private stopMessage: { msg: string; kind: "info" | "success" | "warning" | "error" } | null = null;

  private connect(): void {
    if (this.stopRequested) return;
    let ws: WebSocket;
    try { ws = new WebSocket(DERIV_BOT_WS_URL); }
    catch { this.attemptReconnect("Couldn't open the trading connection."); return; }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0; this.isReconnecting = false;
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      this.send({ authorize: this.token });
      this.startPing();
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

  private handleMessage(raw: string): void {
    if (!this.isRunning && !this.isReconnecting) return;
    let d: Record<string, unknown>;
    try { d = JSON.parse(raw); } catch { return; }

    if (d.error) {
      const err = d.error as { code?: string; message?: string };
      // A failed proposal/buy must free the entry gate, or the bot wedges.
      const inTradeMsg = d.msg_type === "proposal" || d.msg_type === "buy";
      if (err.code === "InvalidToken" || err.code === "AuthorizationRequired") {
        this.ui.onStatus("Authorization expired. Reconnecting…", "warning");
        this.attemptReconnect("Re-authenticating…");
        return;
      }
      if (err.code === "RateLimit" || err.code === "TooManyRequests") {
        this.ui.onStatus("Rate limited — pausing briefly…", "warning");
        if (inTradeMsg) this.freeTrade();
        setTimeout(() => { if (this.isRunning && !this.stopRequested && !this.tradeInProgress) this.queueNextTrade(); }, 5000);
        return;
      }
      this.ui.onStatus(err.message || "Deriv returned an error.", "error");
      if (inTradeMsg) { this.freeTrade(); this.scheduleNext(1500); } // recover from a rejected trade
      return;
    }

    switch (d.msg_type) {
      case "authorize": {
        const a = d.authorize as { balance?: number; currency?: string } | undefined;
        if (!a) return;
        this.balance = Number(a.balance) || 0;
        this.currency = a.currency || "USD";
        this.ui.onBalance(this.balance, this.currency);
        this.ui.onStatus(this.isReconnecting ? "Reconnected. Resuming…" : "Connected. Running Phoenix Recovery Differ…", "success");
        this.isReconnecting = false;
        this.send({ balance: 1, subscribe: 1 });
        this.send({ proposal_open_contract: 1, subscribe: 1 });
        this.subscribeAllTicks();
        if (!this.tradeInProgress) this.queueNextTrade();
        break;
      }
      case "balance": {
        const b = d.balance as { balance?: number; currency?: string } | undefined;
        if (b && typeof b.balance !== "undefined") { this.balance = Number(b.balance); this.currency = b.currency || this.currency; this.ui.onBalance(this.balance, this.currency); }
        break;
      }
      case "proposal": {
        const p = d.proposal as { id?: string; ask_price?: number } | undefined;
        if (this.isRunning && p?.id) this.send({ buy: p.id, price: p.ask_price });
        break;
      }
      case "buy": {
        const b = d.buy as { contract_id?: number } | undefined;
        if (b?.contract_id) this.activeContractId = b.contract_id;
        break;
      }
      case "proposal_open_contract":
        this.handleContract(d.proposal_open_contract as Record<string, unknown>);
        break;
      case "tick":
        this.recordTick(d.tick as { symbol?: string; quote?: number } | undefined);
        break;
      default:
        break;
    }
  }

  private subscribeAllTicks(): void {
    for (const m of this.markets) {
      if (!this.tickSubs[m]) { this.send({ ticks: m, subscribe: 1 }); this.tickSubs[m] = true; }
    }
  }

  private recordTick(tick?: { symbol?: string; quote?: number }): void {
    if (!tick?.symbol || typeof tick.quote === "undefined") return;
    const market = tick.symbol;
    const digit = parseInt(String(tick.quote).slice(-1), 10);
    if (Number.isNaN(digit)) return;
    let a = this.analysis[market];
    if (!a) { a = this.analysis[market] = { digits: [], over4: 0, under5: 0, total: 0 }; }
    a.digits.push(digit);
    a.total++;
    if (a.digits.length > 50) {
      // window the counters too (fix: the reference kept lifetime counters)
      const dropped = a.digits.shift() as number;
      if (dropped > 4) a.over4--;
      if (dropped < 5) a.under5--;
      a.total--;
    }
    if (digit > 4) a.over4++;
    if (digit < 5) a.under5++;
  }

  /** Pick the best market + OVER/UNDER for recovery from windowed digit stats. */
  private analyzeForRecovery(): { market: string; tradeType: "OVER" | "UNDER" } {
    let bestMarket: string | null = null, bestType: "OVER" | "UNDER" | null = null, bestScore = 0;
    for (const m of this.markets) {
      const a = this.analysis[m];
      if (!a || a.total < 10) continue;
      const over4p = a.over4 / a.total, under5p = a.under5 / a.total;
      if (over4p > 0.6 && over4p > bestScore) { bestScore = over4p; bestMarket = m; bestType = "OVER"; }
      if (under5p > 0.6 && under5p > bestScore) { bestScore = under5p; bestMarket = m; bestType = "UNDER"; }
    }
    if (!bestMarket) {
      // fallback: market with the most data, default OVER
      let maxTicks = 0;
      for (const m of this.markets) {
        const a = this.analysis[m];
        if (a && a.total > maxTicks) { maxTicks = a.total; bestMarket = m; bestType = "OVER"; }
      }
    }
    if (!bestMarket) { bestMarket = this.markets[Math.floor(Math.random() * this.markets.length)]; bestType = "OVER"; }
    return { market: bestMarket, tradeType: bestType || "OVER" };
  }

  private queueNextTrade(): void {
    if (!this.isRunning || this.tradeInProgress) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { if (!this.isReconnecting) this.attemptReconnect("Reconnecting…"); return; }

    let market: string, contractType: string, barrier: string, target: string;
    if (this.recoveryMode) {
      if (!this.recoveryMarket || !this.recoveryTradeType) {
        const r = this.analyzeForRecovery();
        this.recoveryMarket = r.market; this.recoveryTradeType = r.tradeType;
      }
      market = this.recoveryMarket;
      if (this.recoveryTradeType === "OVER") { contractType = "DIGITOVER"; barrier = "4"; target = "Over 4"; }
      else { contractType = "DIGITUNDER"; barrier = "5"; target = "Under 5"; }
    } else {
      market = this.nextMarket();
      const digit = this.nextDigit();
      contractType = "DIGITDIFF"; barrier = String(digit); target = `Differ ${digit}`;
    }

    this.tradeInProgress = true;
    this.tradeStartedAt = Date.now();
    this.currentMarket = market; this.currentTarget = target;
    this.armWatchdog();

    this.send({
      proposal: 1,
      amount: round2(this.currentStake).toFixed(2),
      basis: "stake",
      contract_type: contractType,
      currency: this.currency || "USD",
      duration: 1,
      duration_unit: "t",
      symbol: market,
      barrier,
    });
  }

  private nextMarket(): string {
    if (!this.lastMarket) this.lastMarket = this.markets[Math.floor(Math.random() * this.markets.length)];
    return this.lastMarket;
  }
  private nextDigit(): number {
    let digit = Math.floor(Math.random() * 10);
    if (digit === this.lastDigit) digit = (digit + 3) % 10;
    this.lastDigit = digit;
    return digit;
  }

  private handleContract(c: Record<string, unknown>): void {
    if (!c || typeof c.contract_id === "undefined") return;
    if (this.activeContractId && c.contract_id !== this.activeContractId) return; // not ours
    if (!c.is_sold) return;

    const profit = Number(c.profit) || 0;
    const stake = Number(c.buy_price) || this.currentStake;
    const isWin = profit > 0;

    this.totalProfit = round2(this.totalProfit + profit);
    this.totalTrades += 1;
    this.freeTrade();

    if (isWin) {
      this.wins += 1;
      this.consecutiveLosses = 0;
      this.currentStake = this.config.initialStake;
      if (this.recoveryMode) {
        this.recoveryMode = false; this.recoveryMarket = null; this.recoveryTradeType = null;
        this.ui.onStatus("Recovery successful — back to normal mode.", "success");
      }
    } else {
      this.consecutiveLosses += 1;
      // pre-check the stop-loss BEFORE escalating, so a runaway martingale can't
      // blow far past the configured stop on the very next trade.
      const nextStake = round2(this.currentStake * (this.config.martingaleMultiplier || 3.1));
      this.currentStake = nextStake;
      if (!this.recoveryMode) {
        this.recoveryMode = true;
        this.ui.onStatus("Loss — analysing markets for recovery…", "warning");
        const r = this.analyzeForRecovery();
        this.recoveryMarket = r.market; this.recoveryTradeType = r.tradeType;
      }
    }

    this.ui.onTrade({ win: isWin, profit, stake, market: this.currentMarket, target: this.currentTarget, recovery: this.recoveryMode, at: Date.now() });
    this.pushStats();

    if (this.shouldStop()) return;
    this.scheduleNext(900);
  }

  private shouldStop(): boolean {
    if (this.config.takeProfit > 0 && this.totalProfit >= this.config.takeProfit) {
      this.stop(`🎯 Take-profit hit: +${this.totalProfit.toFixed(2)} ${this.currency}. Bot stopped.`, "success");
      return true;
    }
    if (this.config.stopLoss > 0 && this.totalProfit <= -Math.abs(this.config.stopLoss)) {
      this.stop(`🛑 Stop-loss hit: ${this.totalProfit.toFixed(2)} ${this.currency}. Bot stopped.`, "error");
      return true;
    }
    // Also stop if the next martingale stake would exceed the remaining stop-loss room
    // or the account balance — prevents a single trade blowing past the stop.
    const room = this.config.stopLoss > 0 ? this.config.stopLoss + this.totalProfit : Infinity;
    if (this.recoveryMode && (this.currentStake > room || this.currentStake > this.balance)) {
      this.stop("Next recovery stake would exceed your stop-loss/balance. Bot stopped safely.", "warning");
      return true;
    }
    return false;
  }

  private scheduleNext(delay: number): void {
    if (!this.isRunning || this.stopRequested) return;
    setTimeout(() => { if (this.isRunning && !this.tradeInProgress) this.queueNextTrade(); }, delay);
  }

  private freeTrade(): void {
    this.tradeInProgress = false;
    this.activeContractId = null;
    if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
  }

  /** If a settlement never arrives (dropped stream), free the gate so the bot
   *  doesn't wedge forever, then re-poll the open contract. */
  private armWatchdog(): void {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      if (this.isRunning && this.tradeInProgress && Date.now() - this.tradeStartedAt > 25000) {
        this.ui.onStatus("Trade update stalled — re-syncing…", "warning");
        this.send({ proposal_open_contract: 1, subscribe: 1 });
        this.freeTrade();
        this.scheduleNext(1500);
      }
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
    this.reconnectTimer = setTimeout(() => { if (!this.stopRequested) this.connect(); }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ ping: 1 }), 20000);
  }
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
      currentStake: this.currentStake, consecutiveLosses: this.consecutiveLosses,
      recoveryMode: this.recoveryMode, market: this.currentMarket || "—", target: this.currentTarget || "—",
      runningSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }

  private finishStop(): void {
    this.isRunning = false; this.tradeInProgress = false; this.activeContractId = null;
    this.stopPing();
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
    this.ui.onRunning(false);
    if (this.stopMessage) this.ui.onStatus(this.stopMessage.msg, this.stopMessage.kind);
  }
}
