import type { Strategy, StrategyCtx, TradeSpec } from "../types";

/**
 * Smart Even — ported 1:1 from the BotsLab `SmartEvenBot`.
 *
 * Trades DIGITEVEN/DIGITODD (no barrier) on R_50 only. It tracks the last-digit
 * history plus a running even/odd distribution and even/odd streaks, then fades
 * the dominant side. After a loss it flips into `waitingForPattern` mode, which
 * lowers the streak bar (>=2 instead of >=3) to re-enter sooner.
 *
 * The engine owns connection/stake/martingale/TP-SL — this class only decides
 * WHAT to trade next (or null to wait for a signal).
 */
export class SmartEvenStrategy implements Strategy {
  readonly markets = ["R_50"];
  readonly supportsMartingale = true;
  readonly defaultMartingale = 3.1;

  private readonly symbol = "R_50";
  private readonly trendWindow = 12;

  // Kept for exact fidelity with the source (unshift/pop in lockstep with digits);
  // the analysis itself only reads the distribution + streaks + history length.
  private priceHistory: number[] = [];
  private digitHistory: number[] = [];
  private evenOddDistribution = { even: 0, odd: 0 };
  private streakCounter = { even: 0, odd: 0 };
  private waitingForPattern = false;
  private currentMode: "even" | "odd" | null = null;

  reset(): void {
    this.priceHistory = [];
    this.digitHistory = [];
    this.evenOddDistribution = { even: 0, odd: 0 };
    this.streakCounter = { even: 0, odd: 0 };
    this.waitingForPattern = false;
    this.currentMode = null;
  }

  onTick(_symbol: string, quote: number, lastDigit: number): void {
    this.updateDistribution(lastDigit);
    this.priceHistory.unshift(quote);
    this.digitHistory.unshift(lastDigit);
    if (this.priceHistory.length > this.trendWindow) {
      this.priceHistory.pop();
      this.digitHistory.pop();
    }
  }

  private updateDistribution(digit: number): void {
    if (digit % 2 === 0) {
      this.evenOddDistribution.even += 1;
      this.streakCounter.even += 1;
      this.streakCounter.odd = 0;
    } else {
      this.evenOddDistribution.odd += 1;
      this.streakCounter.odd += 1;
      this.streakCounter.even = 0;
    }
  }

  private calculateProbability(): {
    even: number;
    odd: number;
    evenStreak: number;
    oddStreak: number;
  } | null {
    const total = this.evenOddDistribution.even + this.evenOddDistribution.odd;
    if (total === 0) return null;
    return {
      even: this.evenOddDistribution.even / total,
      odd: this.evenOddDistribution.odd / total,
      evenStreak: this.streakCounter.even,
      oddStreak: this.streakCounter.odd,
    };
  }

  /** Exact reproduction of the source `analyzePattern`. Returns the side to BET. */
  private analyzePattern(): "even" | "odd" | null {
    if (this.digitHistory.length < this.trendWindow) {
      return null;
    }
    const probs = this.calculateProbability();
    if (!probs) return null;

    if (this.waitingForPattern) {
      const threshold = 0.55;
      if (probs.even > threshold) return "odd";
      if (probs.odd > threshold) return "even";
      if (probs.evenStreak >= 2) return "odd";
      if (probs.oddStreak >= 2) return "even";
      return null;
    }

    if (probs.evenStreak >= 3) return "odd";
    if (probs.oddStreak >= 3) return "even";
    if (probs.even > 0.55) return "odd";
    if (probs.odd > 0.55) return "even";
    return null;
  }

  nextTrade(_ctx: StrategyCtx): TradeSpec | null {
    const mode = this.analyzePattern();
    if (!mode) return null; // no pattern signal — wait, engine re-polls

    this.currentMode = mode;
    const contractType = mode === "even" ? "DIGITEVEN" : "DIGITODD";
    return {
      market: this.symbol,
      contractType,
      duration: 1,
      targetLabel: contractType === "DIGITEVEN" ? "Even" : "Odd",
    };
  }

  onResult(win: boolean, _ctx: StrategyCtx): void {
    // Source: win resets to normal mode; loss arms `waitingForPattern` (fade sooner).
    if (win) {
      this.waitingForPattern = false;
    } else {
      this.waitingForPattern = true;
    }
  }
}
