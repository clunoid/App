import type { Strategy, TradeSpec } from "../types";

/**
 * NO TOUCH SENTINEL — watches R_100 for a tight, range-bound / spiking regime and
 * fires a NOTOUCH contract (barrier ±0.63, 5 ticks) away from the short-term trend.
 * It scores a "rangeStrength" from MA compression, RSI extremes, trend, momentum and
 * volatility; only trades when at least 4 of those conditions agree.
 *
 * Indicator math is reproduced EXACTLY from the source bot: priceHistory is kept
 * newest-first (index 0 = most recent tick), capped at 15 samples.
 */
export class NoTouchStrategy implements Strategy {
  readonly markets = ["R_100"] as const;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 16;

  private readonly symbol = "R_100";
  private readonly trendWindow = 15;
  private priceHistory: number[] = [];

  reset(): void {
    this.priceHistory = [];
  }

  onTick(symbol: string, quote: number, _lastDigit: number): void {
    if (symbol !== this.symbol) return;
    // newest-first: unshift the latest price, cap the window at trendWindow.
    this.priceHistory.unshift(quote);
    if (this.priceHistory.length > this.trendWindow) {
      this.priceHistory.pop();
    }
  }

  nextTrade(): TradeSpec | null {
    return this.analyzeMarket();
  }

  onResult(): void {
    // Engine owns stake/martingale/TP-SL; nothing to track here.
  }

  private analyzeMarket(): TradeSpec | null {
    if (this.priceHistory.length < this.trendWindow) {
      return null;
    }

    const prices = this.priceHistory.slice(0, this.trendWindow);
    const shortMA = this.calculateMA(prices, 5);
    const mediumMA = this.calculateMA(prices, 10);
    const longMA = this.calculateMA(prices, 15);
    const rsi = this.calculateRSI(prices);
    const volatility = this.calculateVolatility(prices.slice(0, 5));
    const trend = this.calculateTrend(prices);
    const momentum = this.calculateMomentum(prices);

    if (shortMA == null || mediumMA == null || longMA == null || rsi == null) {
      return null;
    }

    let rangeStrength = 0;
    if (Math.abs(shortMA - mediumMA) < 0.1) rangeStrength += 1;
    if (Math.abs(mediumMA - longMA) < 0.1) rangeStrength += 1;
    if (rsi <= 30 || rsi >= 70) rangeStrength += 1;
    if (Math.abs(trend) >= 2) rangeStrength += 1;
    if (Math.abs(momentum) > 0.02) rangeStrength += 1;
    if (volatility > 0.002) rangeStrength += 1;

    if (rangeStrength < 4) {
      return null;
    }

    const barrier = trend > 0 ? "+0.63" : "-0.63";
    return {
      market: this.symbol,
      contractType: "NOTOUCH",
      barrier,
      duration: 5,
      targetLabel: `No Touch ${barrier}`,
    };
  }

  private calculateMA(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    return prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  }

  private calculateRSI(prices: number[], period = 5): number | null {
    if (prices.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = 0; i < period; i += 1) {
      const diff = prices[i] - prices[i + 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateVolatility(prices: number[]): number {
    if (!prices.length) return 0;
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + (price - mean) ** 2, 0) / prices.length;
    return Math.sqrt(variance);
  }

  private calculateTrend(prices: number[]): number {
    if (prices.length < 3) return 0;
    let trend = 0;
    for (let i = 0; i < 2; i += 1) {
      if (prices[i] > prices[i + 1]) trend += 1;
      else if (prices[i] < prices[i + 1]) trend -= 1;
    }
    return trend;
  }

  private calculateMomentum(prices: number[], period = 5): number {
    if (prices.length < period) return 0;
    return (prices[0] - prices[period - 1]) / prices[period - 1];
  }
}
