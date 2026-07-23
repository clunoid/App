/**
 * Simulation utilities — mirrors MagicBotsLab sim/bots/simBase.js payout and timing
 * so browser sim trades feel like the live bots without a Deriv connection.
 */
import type { TradeSpec } from "./types";

const PAYOUTS: Record<string, number> = {
  DIGITDIFF: 0.06,
  DIGITOVER_0: 0.06,
  DIGITUNDER_9: 0.06,
  DIGITOVER_4: 0.95,
  DIGITUNDER_5: 0.95,
  DIGITEVEN: 0.96,
  DIGITODD: 0.96,
  CALL: 0.75,
  PUT: 0.75,
  NOTOUCH: 1.5,
};

const WIN_PROBS: Record<string, number> = {
  DIGITDIFF: 0.9,
  DIGITOVER_0: 0.9,
  DIGITUNDER_9: 0.9,
  DIGITOVER_4: 0.6,
  DIGITUNDER_5: 0.6,
  DIGITEVEN: 0.5,
  DIGITODD: 0.5,
  CALL: 0.5,
  PUT: 0.5,
  NOTOUCH: 0.3,
};

export function simContractKey(spec: TradeSpec): string {
  if (spec.contractType === "DIGITOVER" && spec.barrier === "0") return "DIGITOVER_0";
  if (spec.contractType === "DIGITOVER" && spec.barrier === "4") return "DIGITOVER_4";
  if (spec.contractType === "DIGITUNDER" && spec.barrier === "9") return "DIGITUNDER_9";
  if (spec.contractType === "DIGITUNDER" && spec.barrier === "5") return "DIGITUNDER_5";
  return spec.contractType;
}

export function isDigitSimKey(key: string): boolean {
  return key.startsWith("DIGIT");
}

export function calculateSimProfit(stake: number, key: string, win: boolean): number {
  if (!win) return -stake;
  return Math.round(stake * (PAYOUTS[key] ?? 0) * 100) / 100;
}

export function simulateTradeOutcome(
  key: string,
  consecutiveLosses: number,
  recentResults: boolean[],
): boolean {
  const last10 = recentResults.slice(-10);
  const lossesIn10 = last10.filter((w) => !w).length;
  if (isDigitSimKey(key) && consecutiveLosses >= 2) return true;
  if (lossesIn10 >= 3) return true;
  const winProb = WIN_PROBS[key] ?? 0.5;
  return Math.random() < winProb;
}

export function getContractDurationMs(ticks: number): number {
  if (ticks === 1) return 2500 + Math.random() * 2000;
  if (ticks === 2) return 4000 + Math.random() * 3000;
  return 8000 + Math.random() * 6000;
}

export function getNextTradeDelayMs(ticks: number): number {
  if (ticks === 1) return 800 + Math.random() * 500;
  if (ticks === 2) return 1000 + Math.random() * 700;
  return 1500 + Math.random() * 1000;
}
