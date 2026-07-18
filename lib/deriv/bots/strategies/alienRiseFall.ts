import type { Strategy, StrategyCtx, TradeSpec } from "../types";

type Trend = { direction: "rise" | "fall" | null; consistency: number };

/**
 * ALIEN RISE/FALL — momentum bot on R_10 only. Each tick it builds a 10-price
 * window and reads RSI(7) + a short-trend "consistency" score. A confirmed trend
 * (consistency > 0.6) trades that direction; otherwise RSI extremes trigger a
 * mean-reversion entry (RSI < 30 → CALL, RSI > 70 → PUT). Every trade is a
 * CALL/PUT for 5 ticks (no barrier).
 *
 * After a LOSS it enters `waitingForTrend`: re-entry is throttled until the trend
 * is strong (consistency > 0.7) for 2 consecutive ticks. A WIN clears the throttle.
 *
 * The confirmation counting is tick-driven (as in the source's handleTick loop),
 * so the decision runs in onTick and caches a pending direction that nextTrade
 * emits — gated exactly like the source's `!hasOpenContract && !pendingProposal`.
 */
export class AlienRiseFallStrategy implements Strategy {
  readonly markets = ["R_10"] as const;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 3.1;

  private readonly symbol = "R_10";
  private readonly trendWindow = 10;
  private readonly rsiPeriod = 7;

  // newest price at index 0 (source uses priceHistory.unshift)
  private priceHistory: number[] = [];
  private waitingForTrend = false;
  private trendConfirmationCount = 0;

  // signal produced by the latest analysed tick, consumed by nextTrade
  private pendingDirection: "rise" | "fall" | null = null;
  // mirrors the source's hasOpenContract guard (a trade is in flight)
  private inTrade = false;

  reset(): void {
    this.priceHistory = [];
    this.waitingForTrend = false;
    this.trendConfirmationCount = 0;
    this.pendingDirection = null;
    this.inTrade = false;
  }

  onTick(symbol: string, quote: number, _lastDigit: number): void {
    if (symbol !== this.symbol) return;

    this.priceHistory.unshift(quote);
    if (this.priceHistory.length > Math.max(this.trendWindow, this.rsiPeriod + 1)) {
      this.priceHistory.pop();
    }

    // Only analyse when idle (no trade in flight, no signal pending) and enough
    // history is present — mirrors handleTick's guard + priceHistory.length check.
    if (!this.inTrade && this.pendingDirection === null && this.priceHistory.length >= this.trendWindow) {
      this.pendingDirection = this.analyzeMarket();
    }
  }

  nextTrade(_ctx: StrategyCtx): TradeSpec | null {
    if (!this.pendingDirection) return null;
    const direction = this.pendingDirection;
    this.pendingDirection = null;
    this.inTrade = true;
    const contractType = direction === "rise" ? "CALL" : "PUT";
    return { market: this.symbol, contractType, duration: 5, targetLabel: contractType };
  }

  onResult(win: boolean, _ctx: StrategyCtx): void {
    this.inTrade = false;
    if (win) {
      this.waitingForTrend = false;
    } else {
      this.waitingForTrend = true;
      this.trendConfirmationCount = 0;
    }
  }

  private analyzeMarket(): "rise" | "fall" | null {
    if (this.priceHistory.length < this.trendWindow) {
      return null;
    }

    const prices = this.priceHistory.slice(0, this.trendWindow);
    const rsi = this.calculateRSI(prices);
    const trend = this.calculateTrendStrength(prices);

    if (this.waitingForTrend) {
      if (trend.consistency > 0.7) {
        this.trendConfirmationCount += 1;
        if (this.trendConfirmationCount >= 2) {
          this.waitingForTrend = false;
          this.trendConfirmationCount = 0;
          return trend.direction;
        }
      } else {
        this.trendConfirmationCount = 0;
      }
      return null;
    }

    if (trend.consistency > 0.6) {
      return trend.direction;
    }

    if (rsi < 30) return "rise";
    if (rsi > 70) return "fall";
    return null;
  }

  private calculateRSI(prices: number[]): number {
    if (prices.length < this.rsiPeriod + 1) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= this.rsiPeriod; i += 1) {
      const diff = prices[i - 1] - prices[i];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / this.rsiPeriod;
    const avgLoss = losses / this.rsiPeriod;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateTrendStrength(prices: number[]): Trend {
    if (prices.length < 3) return { direction: null, consistency: 0 };
    const shortTrend = prices[0] - prices[2];
    const direction: "rise" | "fall" = shortTrend > 0 ? "rise" : "fall";
    let consistentMoves = 0;
    for (let i = 1; i < prices.length; i += 1) {
      if (
        (shortTrend > 0 && prices[i - 1] > prices[i]) ||
        (shortTrend < 0 && prices[i - 1] < prices[i])
      ) {
        consistentMoves += 1;
      }
    }
    const consistency = consistentMoves / (prices.length - 1);
    return { direction, consistency };
  }
}
