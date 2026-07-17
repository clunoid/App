/**
 * DERIV MT5 — the three risk profiles (v2, post-backtest overhaul).
 *
 * ONE engine, three parameter sets. These values are the output of the 3-year /
 * 23-pair backtest campaign (lib/deriv/mt5/backtest): the original defaults lost
 * heavily, and every change here removes a measured loss driver:
 *  - "transitional" regime trading OFF everywhere (it was ~73% of aggressive's
 *    trades and the single largest bleeder),
 *  - minRR raised and applied NET of spread (aggressive's old 1.2 gross needed a
 *    ~61% win rate after costs — unpayable),
 *  - partials start at 1.5R (banking half at 1R silently raised the breakeven
 *    win rate above what the entry RR justified),
 *  - pyramid adds are WINNER-side only (above entry at +1R steps; the old
 *    below-entry adds bought into deteriorating trades).
 *
 * Everything is % of the account's CURRENT balance, so the same profile behaves
 * correctly on a $50 account and a $50,000 one.
 */
import type { RiskProfile } from "./types";

export type ProfileParams = {
  key: RiskProfile;
  label: string;
  blurb: string;
  riskPerTradePct: number; // risk on the initial entry (% of balance)
  maxOpenRiskPct: number; // total simultaneous open risk cap
  maxDailyLossPct: number; // day-start-equity loss cap (halts new entries)
  adxGate: number; // min ADX to call a trend
  tradeTransitional: boolean; // trade the in-between regime? (OFF — proven bleeder)
  maxPyramidAdds: number; // winner-side scale-in adds (0 = none)
  rangeAdds: number; // range-engine adds
  atrTrailMult: number; // trailing-stop distance in ATRs
  minRR: number; // minimum reward:risk NET of spread
  corrClusterCap: number; // max simultaneous exposure per correlation cluster
  partials: { atR: number; closePct: number }[]; // partial ladder (R multiples)
};

export const PROFILES: Record<RiskProfile, ProfileParams> = {
  conservative: {
    key: "conservative",
    label: "Conservative",
    blurb: "Fewer, high-conviction trades. No adding to positions. Tight risk, wide stops.",
    riskPerTradePct: 0.4,
    maxOpenRiskPct: 1,
    maxDailyLossPct: 2,
    adxGate: 30,
    tradeTransitional: false,
    maxPyramidAdds: 0,
    rangeAdds: 0,
    atrTrailMult: 3.0,
    minRR: 2.0,
    corrClusterCap: 1,
    partials: [{ atR: 1.5, closePct: 50 }],
  },
  moderate: {
    key: "moderate",
    label: "Moderate",
    blurb: "Balanced. Trades the clean trends and ranges, scales into strength once.",
    riskPerTradePct: 0.75,
    maxOpenRiskPct: 2.5,
    maxDailyLossPct: 3,
    adxGate: 25,
    tradeTransitional: false,
    maxPyramidAdds: 1,
    rangeAdds: 0,
    atrTrailMult: 2.5,
    minRR: 1.8,
    corrClusterCap: 1.5,
    partials: [
      { atR: 1.5, closePct: 33 },
      { atR: 2.5, closePct: 33 },
    ],
  },
  aggressive: {
    key: "aggressive",
    label: "Aggressive",
    blurb: "Presses winners — adds into strength at +1R steps, bigger runners, more open risk.",
    riskPerTradePct: 1.5,
    maxOpenRiskPct: 5,
    maxDailyLossPct: 5,
    adxGate: 22,
    tradeTransitional: false,
    maxPyramidAdds: 2,
    rangeAdds: 0,
    atrTrailMult: 2.0,
    minRR: 1.6,
    corrClusterCap: 2,
    partials: [{ atR: 2, closePct: 25 }], // keep a big runner
  },
};

export const PROFILE_LIST: ProfileParams[] = [PROFILES.conservative, PROFILES.moderate, PROFILES.aggressive];
