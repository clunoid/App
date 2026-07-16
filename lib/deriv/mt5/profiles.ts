/**
 * DERIV MT5 — the three risk profiles.
 *
 * ONE engine, three parameter sets. Conservative takes fewer, higher-quality
 * trades and never pyramids; Aggressive adds into strength and trades more
 * regimes. Everything is % of the account's CURRENT balance, so the same profile
 * behaves correctly on a $50 account and a $50,000 one.
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
  tradeTransitional: boolean; // trade the in-between regime (reduced size)?
  maxPyramidAdds: number; // trend scale-in adds (0 = none)
  rangeAdds: number; // range-engine adds
  atrTrailMult: number; // trailing-stop distance in ATRs
  minRR: number; // minimum reward:risk to take a trade
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
    partials: [{ atR: 1, closePct: 50 }], // bank half at 1R, trail the rest
  },
  moderate: {
    key: "moderate",
    label: "Moderate",
    blurb: "Balanced. Trades the clean trends and ranges, scales in up to twice on strength.",
    riskPerTradePct: 0.75,
    maxOpenRiskPct: 2.5,
    maxDailyLossPct: 3,
    adxGate: 25,
    tradeTransitional: false,
    maxPyramidAdds: 2,
    rangeAdds: 0,
    atrTrailMult: 2.5,
    minRR: 1.75,
    corrClusterCap: 1.5,
    partials: [
      { atR: 1, closePct: 33 },
      { atR: 2, closePct: 33 },
    ],
  },
  aggressive: {
    key: "aggressive",
    label: "Aggressive",
    blurb: "Presses winners hard — pyramids into strong trends, trades more setups, bigger runners.",
    riskPerTradePct: 1.5,
    maxOpenRiskPct: 5,
    maxDailyLossPct: 5,
    adxGate: 21,
    tradeTransitional: true,
    maxPyramidAdds: 4,
    rangeAdds: 1,
    atrTrailMult: 2.0,
    minRR: 1.2,
    corrClusterCap: 2,
    partials: [{ atR: 1.5, closePct: 25 }], // keep a big runner
  },
};

export const PROFILE_LIST: ProfileParams[] = [PROFILES.conservative, PROFILES.moderate, PROFILES.aggressive];
