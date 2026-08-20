"use client";

/**
 * AUTONOMOUS TRADING — sizing, targets, the run schedule and the controller.
 *
 * The top half is pure: maths and state transitions with no I/O, so it can be
 * reasoned about and tested on its own. The controller at the bottom is the only
 * part that touches the browser, the Deriv API or the engine.
 *
 * Browser-resident by design. The bots trade over a WebSocket opened with the
 * user own Deriv token, and that token deliberately never leaves this browser —
 * nothing is sent to a Clunoid server. So the automation runs whenever a Clunoid
 * tab is open, including minimised, in a background tab or with the screen off,
 * and stops when the browser is closed.
 *
 * SIZING. The stake is not a flat percentage. Smart Recovery Differ recovers with a
 * martingale, so the stake is sized so a losing ladder of `lossBuffer` trades still
 * fits inside `balanceUtilization` of the balance. The cost of an n-step ladder at
 * multiplier m is the geometric sum s·(mⁿ−1)/(m−1), so the largest safe opening
 * stake is  balance · utilization / lossSum(n, m). Mirrors the published stake
 * coach (magicbotslab guide.js) so the numbers a user sees elsewhere match ours.
 *
 * CAUTION — the Deriv floor can override the safe size. Below roughly $296 the
 * formula asks for less than Deriv's $0.35 minimum, so the floor wins and the
 * ladder no longer fits the balance (at $100 a 6-loss ladder costs $147.75, more
 * than the account). `ladderCost` and `bufferFits` expose this so callers can
 * report it honestly rather than implying a safety margin that is not there.
 */

/** One tunable set per bot, so other bots can adopt this later without a rewrite. */
export type AutoTuning = {
  /** Deriv's hard minimum stake. */
  minStake: number;
  /** Balance at or above which the automation may arm. */
  minBalance: number;
  /** Balance we tell users gives a comfortable ride. */
  recommendedBalance: number;
  /** Consecutive losses the opening stake must be able to fund. */
  lossBuffer: number;
  /** Share of the balance the ladder may consume. */
  balanceUtilization: number;
  /** Profit target for one run, as a share of the balance it started from. */
  profitTargetPct: number;
  /** Quiet period measured from the last trade of the previous run. */
  cooldownMs: number;
};

/** Smart Recovery Differ — the only bot cleared for autonomous trading today. */
export const SMART_RECOVERY_TUNING: AutoTuning = {
  minStake: 0.35,
  minBalance: 100,
  recommendedBalance: 1000,
  lossBuffer: 6,
  balanceUtilization: 0.5,
  profitTargetPct: 0.1,
  cooldownMs: 90 * 60 * 1000, // 1h30m
};

export const AUTONOMOUS_BOT_ID = "smart-recovery-differ";

const round2 = (v: number) => Math.round(v * 100) / 100;
const floor2 = (v: number) => Math.floor(v * 100) / 100;

/** Cost of an n-step martingale ladder per $1 of opening stake: (mⁿ−1)/(m−1). */
export function lossSumMultiplier(losses: number, multiplier: number): number {
  const m = Number(multiplier);
  const n = Math.max(1, Math.floor(Number(losses) || 1));
  if (!Number.isFinite(m) || m <= 1) return n; // flat staking: n trades of 1 unit
  return (Math.pow(m, n) - 1) / (m - 1);
}

/**
 * Largest opening stake whose `lossBuffer`-step ladder still fits inside
 * `balanceUtilization` of the balance, floored at Deriv's minimum.
 */
export function suggestStake(balance: number, martingale: number, tuning: AutoTuning): number {
  const bal = Number(balance);
  if (!Number.isFinite(bal) || bal <= 0) return tuning.minStake;
  const raw = (bal * tuning.balanceUtilization) / lossSumMultiplier(tuning.lossBuffer, martingale);
  return Math.max(tuning.minStake, floor2(raw));
}

/** What a full losing ladder actually costs at this stake. */
export function ladderCost(stake: number, martingale: number, tuning: AutoTuning): number {
  return round2(stake * lossSumMultiplier(tuning.lossBuffer, martingale));
}

/** True when the ladder genuinely fits the utilisation budget (false near the floor). */
export function bufferFits(balance: number, martingale: number, tuning: AutoTuning): boolean {
  const stake = suggestStake(balance, martingale, tuning);
  return ladderCost(stake, martingale, tuning) <= balance * tuning.balanceUtilization + 1e-9;
}

/** Lowest balance at which the suggested stake is not clamped by the Deriv floor. */
export function safeBalanceFloor(martingale: number, tuning: AutoTuning): number {
  return round2((tuning.minStake * lossSumMultiplier(tuning.lossBuffer, martingale)) / tuning.balanceUtilization);
}

/** Profit that ends a run: a share of the balance the run started from. */
export function profitTarget(balance: number, tuning: AutoTuning): number {
  const bal = Number(balance);
  if (!Number.isFinite(bal) || bal <= 0) return 0;
  return round2(bal * tuning.profitTargetPct);
}

/** Balance is sufficient to arm the automation. */
export function isEligible(balance: number, tuning: AutoTuning): boolean {
  return Number.isFinite(balance) && Number(balance) >= tuning.minBalance;
}

/**
 * The engine config for one autonomous run.
 *
 * Stake and take-profit are derived from the balance the run starts with; stop-loss
 * and the martingale multiplier are the bot's own defaults, deliberately untouched.
 */
export function buildAutoConfig(
  balance: number,
  defaults: { initialStake: number; takeProfit: number; stopLoss: number; martingaleMultiplier: number },
  martingale: number,
  tuning: AutoTuning,
): { initialStake: number; takeProfit: number; stopLoss: number; martingaleMultiplier: number } {
  return {
    initialStake: suggestStake(balance, martingale, tuning),
    takeProfit: profitTarget(balance, tuning),
    stopLoss: defaults.stopLoss,             // unchanged, by design
    martingaleMultiplier: martingale,        // unchanged, by design
  };
}

// ── run schedule ────────────────────────────────────────────────────────────

export type AutoPhase = "off" | "idle" | "running" | "cooldown";

/** When the next run may begin: a fixed quiet period after the previous last trade. */
export function nextRunAt(lastTradeAt: number, tuning: AutoTuning): number {
  return lastTradeAt + tuning.cooldownMs;
}

/** Whether a run may start now. Compares absolute timestamps, so it survives
 *  restarts, sleep and throttled timers — nothing depends on a timer firing. */
export function isDue(phase: AutoPhase, nextRunAtMs: number | null, now: number): boolean {
  if (phase === "off" || phase === "running") return false;
  if (nextRunAtMs == null) return true;
  return now >= nextRunAtMs;
}

/** Milliseconds until the next run, floored at zero. */
export function msUntilDue(nextRunAtMs: number | null, now: number): number {
  if (nextRunAtMs == null) return 0;
  return Math.max(0, nextRunAtMs - now);
}

/** Everything the UI needs to explain a pending or active run in one call. */
export function describeRun(balance: number, martingale: number, tuning: AutoTuning) {
  const stake = suggestStake(balance, martingale, tuning);
  return {
    eligible: isEligible(balance, tuning),
    stake,
    target: profitTarget(balance, tuning),
    ladderCost: ladderCost(stake, martingale, tuning),
    bufferFits: bufferFits(balance, martingale, tuning),
    safeFloor: safeBalanceFloor(martingale, tuning),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// CONTROLLER — decides when a run happens and drives it.
//
// A module singleton, mounted once for the whole app, so it keeps trading while
// the user moves around the site. Everything needed to survive a reload, a sleep
// or a dropped connection is an absolute timestamp in localStorage: no decision
// depends on a timer having fired on schedule, so a throttled background tab
// only delays a check, it never loses one.
// ════════════════════════════════════════════════════════════════════════════

import { loadDerivAccess } from "../oauth";
import { fetchDerivPortfolioREST } from "../api";
import { BOT_DEFAULTS } from "./config";
import { DerivBot } from "./engine";
import { getBot } from "./registry";
import type { BotStats, BotUI, TradeRow } from "./types";
import type { ConnectedAccount } from "@/lib/trading/accounts";

const STORE_KEY = "clunoid_auto_v1";
const TICK_MS = 20_000;   // heartbeat; throttling in a hidden tab is harmless
const RETRY_MS = 60_000;  // a run cut short by the network resumes soon, not in 90m
type StatusKind = "info" | "success" | "warning" | "error";

/** Everything that must outlive a reload. Timestamps are absolute (epoch ms). */
type Persisted = {
  enabled: boolean;
  greeted: boolean;
  phase: AutoPhase;
  nextRunAt: number | null;
  lastTradeAt: number | null;
  /** Trade the Demo account instead of the real one — for verifying the cycle. */
  demo: boolean;
  /** The real-account schedule, parked while demo is on so testing cannot
   *  shorten (or extend) the quiet period that applies to real money. */
  savedNextRunAt: number | null;
};

const BLANK: Persisted = {
  enabled: false, greeted: false, phase: "off", nextRunAt: null, lastTradeAt: null,
  demo: false, savedNextRunAt: null,
};

export type AutoSnapshot = {
  enabled: boolean;
  phase: AutoPhase;
  botId: string;
  balance: number | null;
  currency: string;
  stake: number;
  target: number;
  nextRunAt: number | null;
  lastTradeAt: number | null;
  online: boolean;
  demo: boolean;
  justActivated: boolean;
  stats: BotStats | null;
  trades: TradeRow[];
  status: { msg: string; kind: StatusKind } | null;
  error: string | null;
};

class AutonomousController {
  private p: Persisted = { ...BLANK };
  private listeners = new Set<(s: AutoSnapshot) => void>();
  private bot: DerivBot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private booted = false;
  /** True while the user is driving a bot by hand — the automation stands down. */
  private manual = false;
  private ticking = false;
  private finishing = false;
  private balance: number | null = null;
  private currency = "";
  private account: ConnectedAccount | null = null;
  private stats: BotStats | null = null;
  private trades: TradeRow[] = [];
  private status: { msg: string; kind: StatusKind } | null = null;
  private error: string | null = null;
  private justActivated = false;

  private get tuning() { return SMART_RECOVERY_TUNING; }
  private get meta() { return getBot(AUTONOMOUS_BOT_ID); }

  /** Idempotent: safe from every mount, including StrictMode double-mounts. */
  boot(): void {
    if (this.booted || typeof window === "undefined") return;
    this.booted = true;
    this.load();
    // A run recorded as running cannot have survived a reload — the socket died
    // with the old page. Drop to idle so the next tick starts a fresh one.
    if (this.p.phase === "running") { this.p.phase = "idle"; this.save(); }
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisible);
    this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
    void this.tick();
  }

  private onOnline = () => { this.error = null; this.emit(); void this.tick(); };
  private onOffline = () => { this.emit(); };
  private onVisible = () => { if (document.visibilityState === "visible") void this.tick(); };

  private load(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) this.p = { ...BLANK, ...(JSON.parse(raw) as Partial<Persisted>) };
    } catch { this.p = { ...BLANK }; }
  }

  private save(): void {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.p)); } catch { /* storage off — memory only */ }
  }

  subscribe(fn: (s: AutoSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => { this.listeners.delete(fn); };
  }

  snapshot(): AutoSnapshot {
    const mart = this.meta?.defaultMartingale ?? BOT_DEFAULTS.martingaleMultiplier;
    const bal = this.balance ?? 0;
    return {
      enabled: this.p.enabled,
      phase: this.p.phase,
      botId: AUTONOMOUS_BOT_ID,
      balance: this.balance,
      currency: this.currency,
      stake: suggestStake(bal, mart, this.tuning),
      target: profitTarget(bal, this.tuning),
      nextRunAt: this.p.nextRunAt,
      lastTradeAt: this.p.lastTradeAt,
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      demo: this.p.demo,
      justActivated: this.justActivated,
      stats: this.stats,
      trades: this.trades,
      status: this.status,
      error: this.error,
    };
  }

  private emit(): void {
    const s = this.snapshot();
    for (const fn of this.listeners) { try { fn(s); } catch { /* a bad listener must not stop a run */ } }
  }

  /** Called by the UI once it has shown the activation confirmation. */
  acknowledgeActivation(): void { this.justActivated = false; this.p.greeted = true; this.save(); this.emit(); }

  /** The user pressed Start on a bot page: stand down until they are done. */
  claimManual(): void {
    this.manual = true;
    if (this.p.phase === "running") this.haltRun("Automation paused — you took over.", "info");
    this.p.phase = "idle"; this.save(); this.emit();
  }

  /** Their manual run ended: the automation may schedule itself again. */
  releaseManual(): void {
    this.manual = false;
    this.emit();
    void this.tick();
  }

  /**
   * Point the automation at the Demo or the real account.
   *
   * For verifying the whole cycle — sizing, configuration, trading, the quiet
   * period — with fake money, on an account that behaves exactly like the real
   * one. Turning demo on clears the schedule so a run starts on the next tick
   * instead of waiting out a quiet period; the real schedule is parked and put
   * back on the way out, so testing can never bring a real run forward.
   *
   * Only meaningful while nothing is running: the bot page disables the account
   * toggle during a run, so an account can never change mid-trade.
   */
  setDemo(on: boolean): void {
    if (this.p.demo === on) return;
    if (on) {
      this.p.savedNextRunAt = this.p.nextRunAt;
      this.p.nextRunAt = null;              // due immediately, so testing is quick
    } else {
      this.p.nextRunAt = this.p.savedNextRunAt;
      this.p.savedNextRunAt = null;
    }
    this.p.demo = on;
    // Re-arm from scratch: eligibility is judged on the account now selected.
    this.p.enabled = false;
    if (this.p.phase !== "off") this.p.phase = "idle";
    this.balance = null; this.account = null;
    this.save(); this.emit();
    void this.tick();
  }

  /** Stop the current automated run and hold off briefly. */
  stopNow(reason = "Automation stopped."): void {
    this.haltRun(reason, "info");
    this.p.phase = "cooldown";
    this.p.nextRunAt = Date.now() + RETRY_MS;
    this.save(); this.emit();
  }

  private haltRun(msg: string, kind: StatusKind): void {
    const b = this.bot; this.bot = null;
    if (b) { try { b.stop(msg, kind); } catch { /* already gone */ } }
    this.status = { msg, kind };
  }

  private async tick(): Promise<void> {
    if (this.ticking || typeof window === "undefined") return;
    this.ticking = true;
    try {
      const token = loadDerivAccess();
      if (!token) {                      // disconnected: park, keep the settings
        if (this.p.phase !== "off") { this.p.phase = "off"; this.save(); }
        this.balance = null; this.emit(); return;
      }
      if (this.p.phase === "running" || this.manual) return;
      if (!navigator.onLine) return;     // the online listener re-ticks for us

      // Refresh only when a decision depends on it: when arming, and immediately
      // before a run. Every run therefore starts from a live balance.
      const due = isDue(this.p.phase, this.p.nextRunAt, Date.now());
      if (!this.p.enabled || due) await this.refreshBalance(token);

      if (!this.p.enabled) {
        // Arms on connect, and equally the moment a balance first reaches the
        // minimum — the user never has to reconnect to get here.
        if (this.balance != null && isEligible(this.balance, this.tuning)) {
          this.p.enabled = true;
          this.p.phase = "idle";
          this.p.nextRunAt = null;
          if (!this.p.greeted) this.justActivated = true;
          this.save(); this.emit();
        } else { this.emit(); return; }
      }

      if (!isDue(this.p.phase, this.p.nextRunAt, Date.now())) { this.emit(); return; }
      if (this.balance == null || !isEligible(this.balance, this.tuning)) {
        this.p.phase = "idle";
        this.p.nextRunAt = Date.now() + RETRY_MS;   // recheck later, stay armed
        this.save(); this.emit(); return;
      }
      this.startRun(token);
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Automation could not run.";
      this.p.nextRunAt = Date.now() + RETRY_MS;     // never wedge: always retry
      this.save(); this.emit();
    } finally { this.ticking = false; }
  }

  /** Live balance + the options account the automation trades on (real, or Demo
   *  while testing). The account id is what makes the trade demo or real, so a
   *  demo run exercises exactly the same path as a real one. */
  private async refreshBalance(token: string): Promise<void> {
    try {
      const p = await fetchDerivPortfolioREST(token);
      const want = this.p.demo;
      const acct = p.accounts.find((a) => a.kind === "options" && a.isVirtual === want) || null;
      this.account = acct;
      this.balance = acct?.balance ?? null;
      this.currency = acct?.currency || "";
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Could not read your Deriv balance.";
      // Keep the last known balance; the run gate re-checks eligibility anyway.
    }
  }

  private startRun(token: string): void {
    const meta = this.meta;
    const acct = this.account;
    if (!meta || !acct || this.balance == null) {
      this.p.nextRunAt = Date.now() + RETRY_MS; this.save(); return;
    }

    // Fresh run: no carried-over trades, stats or status.
    this.trades = []; this.stats = null; this.error = null; this.finishing = false;
    const cfg = buildAutoConfig(this.balance, BOT_DEFAULTS, meta.defaultMartingale, this.tuning);

    const ui: BotUI = {
      onStatus: (msg, kind) => { this.status = { msg, kind }; this.emit(); },
      onStats: (s) => { this.stats = s; this.emit(); },
      onTrade: (t) => {
        this.trades = [t, ...this.trades].slice(0, 100);
        this.p.lastTradeAt = t.at;      // the quiet period is measured from here
        this.save(); this.emit();
      },
      onBalance: (balance, currency) => { this.balance = balance; this.currency = currency; this.emit(); },
      onFinish: (kind) => {
        // Target or stop reached: the real end of a run. Wait out the quiet
        // period from the last trade, then size the next run afresh.
        this.finishing = true;
        this.p.phase = "cooldown";
        this.p.nextRunAt = nextRunAt(this.p.lastTradeAt ?? Date.now(), this.tuning);
        this.save(); this.emit();
        void this.afterRun(kind);
      },
      onRunning: (running) => {
        if (running) return;
        this.bot = null;
        if (this.finishing) return;     // onFinish already scheduled the next run
        if (this.manual) { this.p.phase = "idle"; this.save(); this.emit(); return; }
        // Ended without reaching a target — dropped connection, expired session,
        // or the engine gave up. Resume shortly rather than waiting a full cycle.
        this.p.phase = "cooldown";
        this.p.nextRunAt = Date.now() + RETRY_MS;
        this.save(); this.emit();
      },
    };

    try {
      const bot = new DerivBot(ui, { accessToken: token, accountId: acct.loginid, currency: acct.currency }, meta.createStrategy());
      this.bot = bot;
      this.p.phase = "running"; this.save(); this.emit();
      bot.start(cfg);
    } catch (e) {
      this.bot = null;
      this.error = e instanceof Error ? e.message : "Could not start the automation.";
      this.p.phase = "cooldown"; this.p.nextRunAt = Date.now() + RETRY_MS;
      this.save(); this.emit();
    }
  }

  /** Re-read the balance after a run so the next one is sized from the new figure. */
  private async afterRun(_kind: "take-profit" | "stop-loss"): Promise<void> {
    const token = loadDerivAccess();
    if (token) await this.refreshBalance(token);
    this.emit();
  }
}

let singleton: AutonomousController | null = null;

/** The one controller for the app. Created lazily so it never runs during SSR. */
export function autonomous(): AutonomousController {
  if (!singleton) singleton = new AutonomousController();
  return singleton;
}
