/**
 * AUTONOMOUS TRADING — sizing, targets and the run schedule.
 *
 * Pure maths and pure state transitions: no I/O, no browser APIs, no node APIs,
 * no imports from the client engine. That is deliberate — the same module is used
 * by the browser UI (to show what the automation will do) and by the server runner
 * (to actually do it), so the two can never disagree about a stake or a target.
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
