/**
 * Forex bot risk profiles — mirrors ClunoidForexMT5.mq5.
 * Kept beside the registry so the page never hard-codes a risk figure that must
 * agree with the EA — if a cap changes there, change it here too.
 */

export type ForexProfile = {
  key: "conservative" | "moderate" | "aggressive";
  label: string;
  riskPerTradePct: number;
  blurb: string;
};

export const FOREX_PROFILES: ForexProfile[] = [
  {
    key: "aggressive",
    label: "Aggressive",
    riskPerTradePct: 1,
    blurb: "The default. Trades every qualifying setup at full size.",
  },
  {
    key: "moderate",
    label: "Moderate",
    riskPerTradePct: 0.6,
    blurb: "The same setups at a smaller size, for a calmer account.",
  },
  {
    key: "conservative",
    label: "Conservative",
    riskPerTradePct: 0.35,
    blurb: "The same setups again at the smallest size.",
  },
];
