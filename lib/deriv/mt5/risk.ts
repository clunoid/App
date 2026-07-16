/**
 * DERIV MT5 — risk governor.
 *
 * Division of labour (Model A): the CLOUD decides risk in %-of-balance terms
 * (which trades, what % to risk, respecting correlation + total-open-risk caps).
 * The EA converts % → exact lots using the terminal's real contract specs
 * (tick value / volume step) — those aren't in Deriv's public feed, and the EA
 * has them precisely. So this file is symbol-spec-agnostic on purpose.
 */
import type { MarketDef, Side, Signal } from "./types";
import type { ProfileParams } from "./profiles";

/** Reward:risk of a bracket (absolute prices). */
export function rewardRisk(side: Side, entry: number, sl: number, tp: number): number {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  return risk <= 0 ? 0 : reward / risk;
}

/**
 * Approximate money risked, for DISPLAY only ("on $1,000 this risks ~$X").
 * The EA computes the real figure from its tick value; here we just surface the
 * profile's risk% so the user sees the scale. Never used for order sizing.
 */
export function riskMoney(balance: number, riskPct: number): number {
  return (balance * riskPct) / 100;
}

/**
 * Correlation- and budget-aware selection. Given candidate signals ranked by the
 * engine, keep the strongest per correlation cluster and stop once the summed
 * initial risk would exceed the profile's total-open-risk cap. This is what makes
 * "long EURUSD + GBPUSD + AUDUSD" count as one USD bet, not three.
 */
export function selectByRisk(
  candidates: { sig: Signal; market: MarketDef }[],
  profile: ProfileParams,
): Signal[] {
  const ranked = [...candidates].sort((a, b) => b.sig.confidence - a.sig.confidence);
  const clusterExposure = new Map<string, number>();
  let openRisk = 0;
  const chosen: Signal[] = [];

  for (const { sig, market } of ranked) {
    if (openRisk + sig.riskPct > profile.maxOpenRiskPct + 1e-9) continue;
    const used = clusterExposure.get(market.corr) ?? 0;
    if (used + sig.riskPct > profile.corrClusterCap + 1e-9) continue;
    chosen.push(sig);
    clusterExposure.set(market.corr, used + sig.riskPct);
    openRisk += sig.riskPct;
  }
  return chosen;
}

/**
 * Whether new entries are allowed given today's realised+floating P/L. The EA
 * reports day P/L as a % of day-start equity; once it breaches the profile cap we
 * stand aside (existing positions keep their own stops).
 */
export function dailyLossHit(dayPnlPct: number, profile: ProfileParams): boolean {
  return dayPnlPct <= -Math.abs(profile.maxDailyLossPct);
}
