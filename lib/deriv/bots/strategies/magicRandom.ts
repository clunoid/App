import type { Strategy, StrategyCtx, TradeSpec } from "../types";
import { ALL_MARKETS } from "../engine";

/**
 * MAGIC RANDOM — every trade independently picks one of three high-probability
 * digit contracts at random:
 *   DIFF  → DIGITDIFF on a digit chosen by getNextDigit (spread evenly across
 *           0-9 by always picking among the least-traded digits so far)
 *   UNDER → DIGITUNDER barrier "9" (loses only on a 9)
 *   OVER  → DIGITOVER  barrier "0" (loses only on a 0)
 * Market rotates each trade, never repeating the previous one.
 *
 * WIN-GATED STOPS (postTradeStop, on top of the engine's TP/SL): once any of
 *   • 2 consecutive losses, • 2 losses within the last 5 results, • ≥1h running
 * is seen, a stop is ARMED, but the bot only actually stops after the NEXT win
 * (Deriv "stop on next win"). The engine owns stake/martingale/TP-SL/connection.
 */
export class MagicRandomStrategy implements Strategy {
  readonly markets = ALL_MARKETS;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 16;

  private lastMarket: string | null = null;
  private digitAppearances: Record<number, number> = {};
  private pendingStopReason: string | null = null;

  reset(): void {
    this.lastMarket = null;
    this.digitAppearances = {};
    this.pendingStopReason = null;
  }

  // Pure random bot — it does not analyse incoming ticks.
  onTick(_symbol: string, _quote: number, _lastDigit: number): void {}

  nextTrade(): TradeSpec {
    const market = this.getNextMarket();
    const tradeType = this.getRandomTradeType();

    if (tradeType === "DIFF") {
      const digit = this.getNextDigit();
      return {
        market,
        contractType: "DIGITDIFF",
        barrier: digit.toString(),
        duration: 1,
        targetLabel: `Differ ${digit}`,
      };
    }
    if (tradeType === "UNDER") {
      return {
        market,
        contractType: "DIGITUNDER",
        barrier: "9",
        duration: 1,
        targetLabel: "Under 9",
      };
    }
    // OVER
    return {
      market,
      contractType: "DIGITOVER",
      barrier: "0",
      duration: 1,
      targetLabel: "Over 0",
    };
  }

  onResult(_win: boolean, _ctx: StrategyCtx): void {
    // Stop bookkeeping is handled in postTradeStop off the ctx snapshot.
  }

  /**
   * Extra, win-gated stop conditions (mirrors the source shouldStop). The three
   * conditions ARM a stop; it only fires once the most recent result is a win.
   * Order matters: later matches overwrite earlier ones, exactly as the source.
   */
  postTradeStop(ctx: StrategyCtx): string | null {
    const results = ctx.results;
    if (results.length === 0) return null;

    let reason: string | null = null;

    // 2 consecutive losses
    if (ctx.consecutiveLosses >= 2) {
      reason = "Two consecutive losses detected. Bot stopped.";
    }

    // 2 losses within the last 5 results
    if (results.length >= 5) {
      const losses = results.slice(-5).filter((w) => !w).length;
      if (losses >= 2) {
        reason = "Two losses in last 5 trades. Bot stopped.";
      }
    }

    // Running for at least 1 hour
    if (ctx.runningSeconds >= 3600) {
      reason = "Bot has been running for more than 1 hour. Bot stopped.";
    }

    // Arm the stop when a condition is met (persists across further losses).
    if (reason) this.pendingStopReason = reason;

    // Only stop once we've actually landed a win (Deriv "stop on next win").
    const lastWasWin = results[results.length - 1];
    if (this.pendingStopReason && lastWasWin) {
      const fired = this.pendingStopReason;
      this.pendingStopReason = null;
      return fired;
    }
    return null;
  }

  private getNextMarket(): string {
    const options = this.markets.filter((m) => m !== this.lastMarket);
    if (options.length === 0) {
      // Only reachable if there is a single market — don't update lastMarket.
      return this.markets[Math.floor(Math.random() * this.markets.length)];
    }
    const market = options[Math.floor(Math.random() * options.length)];
    this.lastMarket = market;
    return market;
  }

  private getRandomTradeType(): "DIFF" | "UNDER" | "OVER" {
    const types: Array<"DIFF" | "UNDER" | "OVER"> = ["DIFF", "UNDER", "OVER"];
    return types[Math.floor(Math.random() * types.length)];
  }

  private getNextDigit(): number {
    // Ensure every digit 0-9 has a counter.
    for (let i = 0; i < 10; i++) {
      if (!this.digitAppearances[i]) this.digitAppearances[i] = 0;
    }

    // Pick randomly among the digits with the minimum appearance count.
    const minAppearance = Math.min(...Object.values(this.digitAppearances));
    const leastAppearingDigits = Object.keys(this.digitAppearances)
      .filter((d) => this.digitAppearances[Number(d)] === minAppearance)
      .map(Number);

    const selectedDigit =
      leastAppearingDigits[Math.floor(Math.random() * leastAppearingDigits.length)];

    // Increment its count so trades spread evenly across all ten digits.
    this.digitAppearances[selectedDigit] =
      (this.digitAppearances[selectedDigit] || 0) + 1;

    return selectedDigit;
  }
}