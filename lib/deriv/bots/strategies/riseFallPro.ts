import type { Strategy, StrategyCtx, TradeSpec } from "../types";

type MacdResult = { macd: number; signal: number; histogram: number };

/**
 * Rise/Fall Pro — ported from the BotsLab riseFall.js bot.
 * Multi-factor momentum engine on R_10: short/medium/long momentum (3,7,14),
 * RSI(14), MACD(12,26,9), volatility, and double-top/bottom pattern.
 * Builds a strength score and only trades CALL/PUT (duration 5, no barrier)
 * when |strength| clears the volatility-scaled threshold.
 */
export class RiseFallProStrategy implements Strategy {
  readonly markets = ["R_10"] as const;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 3.1;

  private readonly symbol = "R_10";
  private readonly trendWindow = 15;

  // Newest price at index 0 (matches the source's unshift ordering).
  private priceHistory: number[] = [];
  private lastSignalStrength = 0;

  reset(): void {
    this.priceHistory = [];
    this.lastSignalStrength = 0;
  }

  onTick(symbol: string, quote: number, _lastDigit: number): void {
    if (symbol !== this.symbol) return;
    this.priceHistory.unshift(quote);
    if (this.priceHistory.length > Math.max(this.trendWindow, 26)) {
      this.priceHistory.pop();
    }
  }

  nextTrade(_ctx: StrategyCtx): TradeSpec | null {
    const direction = this.analyzeMarket();
    if (!direction) return null;

    const contractType = direction === "rise" ? "CALL" : "PUT";
    return {
      market: this.symbol,
      contractType,
      duration: 5,
      targetLabel: contractType,
    };
  }

  onResult(_win: boolean, _ctx: StrategyCtx): void {
    // Engine owns stake/martingale/TP-SL; nothing to track here.
  }

  private analyzeMarket(): "rise" | "fall" | null {
    if (this.priceHistory.length < this.trendWindow) {
      return null;
    }

    const prices = this.priceHistory;
    const shortMomentum = prices[0] - (prices[3] || prices[0]);
    const mediumMomentum = prices[0] - (prices[7] || prices[0]);
    const longMomentum = prices[0] - (prices[14] || prices[0]);
    const rsi = this.calculateRSI(prices);
    const macd = this.calculateMACD(prices);
    const volatility = this.calculateVolatility(prices);
    const pattern = this.detectPattern(prices);

    let signal: "rise" | "fall" | null = null;
    let strength = 0;

    if (pattern) {
      signal = pattern;
      strength += 2;
    }

    if (shortMomentum > 0 && mediumMomentum > 0 && longMomentum > 0) {
      signal = "rise";
      strength += 1;
    } else if (shortMomentum < 0 && mediumMomentum < 0 && longMomentum < 0) {
      signal = "fall";
      strength += 1;
    }

    if (rsi < 30) strength += signal === "rise" ? 1 : -1;
    else if (rsi > 70) strength += signal === "fall" ? 1 : -1;

    if (macd.histogram > 0 && macd.macd > 0) strength += signal === "rise" ? 1 : -1;
    else if (macd.histogram < 0 && macd.macd < 0) strength += signal === "fall" ? 1 : -1;

    const requiredStrength = volatility > 0.001 ? 3 : 2;
    if (Math.abs(strength) < requiredStrength) {
      return null;
    }

    this.lastSignalStrength = strength;
    return signal;
  }

  private detectPattern(prices: number[]): "rise" | "fall" | null {
    if (prices.length < 5) return null;
    const diffs: number[] = [];
    for (let i = 1; i < 5; i += 1) {
      diffs.push(prices[i - 1] - prices[i]);
    }
    const doubleTop = diffs[0] < 0 && diffs[1] > 0 && diffs[2] < 0 && diffs[3] > 0;
    const doubleBottom = diffs[0] > 0 && diffs[1] < 0 && diffs[2] > 0 && diffs[3] < 0;
    if (doubleTop) return "fall";
    if (doubleBottom) return "rise";
    return null;
  }

  private calculateRSI(prices: number[], period = 14): number {
    if (prices.length < period + 1) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i += 1) {
      const diff = prices[i - 1] - prices[i];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateEMA(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = prices[prices.length - 1];
    for (let i = prices.length - 2; i >= 0; i -= 1) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  private calculateMACD(prices: number[]): MacdResult {
    const fastEMA = this.calculateEMA(prices, 12);
    const slowEMA = this.calculateEMA(prices, 26);
    if (!fastEMA || !slowEMA) return { macd: 0, signal: 0, histogram: 0 };
    const macd = fastEMA - slowEMA;
    const signalLine = this.calculateEMA([...prices, macd], 9) || 0;
    return { macd, signal: signalLine, histogram: macd - signalLine };
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i += 1) {
      returns.push((prices[i - 1] - prices[i]) / prices[i]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
  }
}
