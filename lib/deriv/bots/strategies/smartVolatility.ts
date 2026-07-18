import type { Strategy, StrategyCtx, TradeSpec } from "../types";

/**
 * SMART VOLATILITY — trades rise/fall (CALL/PUT) on R_75 off an ATR(5) volatility read.
 *
 * Ported verbatim from the BotsLab `SmartVolatilityBot` decision core. Keeps a rolling
 * priceHistory (newest unshifted to the front, capped at 10). Once 10 quotes are in and
 * at least 2000ms have passed since the last trade, it reads volatility:
 *   • sharp move  (change > ATR*1.2)      → CALL if price rose, else PUT
 *   • elevated vol (ATR > 0.0015)         → CALL if latest > avg of last 3, else PUT
 *   • otherwise                            → wait (null)
 * Higher vol shrinks the stake (0.8x) and keeps 1-tick duration; low vol grows the stake
 * (1.2x) and stretches to 2 ticks. supportsMartingale is FALSE for this bot.
 *
 * The engine owns connection/stake/martingale/TP-SL; this class only decides WHAT to trade.
 */
export class SmartVolatilityStrategy implements Strategy {
  readonly markets = ["R_75"] as const;
  readonly supportsMartingale = false;
  readonly defaultMartingale = 3.1;

  private readonly symbol = "R_75";
  private readonly volatilityWindow = 10;
  private readonly atrPeriod = 5;
  private readonly volatilityThreshold = 0.0015;

  private priceHistory: number[] = [];
  private lastVolatility: number | null = null;
  private lastTradeTime = 0;

  reset(): void {
    this.priceHistory = [];
    this.lastVolatility = null;
    this.lastTradeTime = 0;
  }

  onTick(_symbol: string, quote: number, _lastDigit: number): void {
    this.priceHistory.unshift(quote);
    if (this.priceHistory.length > this.volatilityWindow) {
      this.priceHistory.pop();
    }
  }

  nextTrade(_ctx: StrategyCtx): TradeSpec | null {
    if (this.priceHistory.length < this.volatilityWindow) return null;

    const now = Date.now();
    if (now - this.lastTradeTime < 2000) return null;

    const signal = this.analyzeVolatility();
    if (!signal) return null;

    const stakeFactor = this.stakeFactor(this.lastVolatility);
    const duration = this.duration(this.lastVolatility);

    this.lastTradeTime = now;
    return { market: this.symbol, contractType: signal, duration, stakeFactor, targetLabel: signal };
  }

  onResult(_win: boolean, _ctx: StrategyCtx): void {
    // Stateless outcome — martingale/stake/TP-SL are engine-owned; nothing to update.
  }

  // ── analysis (reproduced exactly from the BotsLab source) ────────────────────
  private analyzeVolatility(): "CALL" | "PUT" | null {
    if (this.priceHistory.length < this.atrPeriod) {
      return null;
    }

    const atr = this.calculateATR();
    if (!atr) return null;
    this.lastVolatility = atr;

    const latest = this.priceHistory[0];
    const previous = this.priceHistory[1];
    const change = Math.abs(latest - previous);

    if (change > atr * 1.2) {
      return latest > previous ? "CALL" : "PUT";
    }

    if (atr > this.volatilityThreshold) {
      const avg = this.priceHistory.slice(0, 3).reduce((sum, value) => sum + value, 0) / 3;
      return latest > avg ? "CALL" : "PUT";
    }

    return null;
  }

  private calculateATR(): number | null {
    if (this.priceHistory.length < this.atrPeriod) return null;
    let atr = 0;
    for (let i = 1; i < this.atrPeriod; i += 1) {
      const high = Math.max(this.priceHistory[i], this.priceHistory[i - 1]);
      const low = Math.min(this.priceHistory[i], this.priceHistory[i - 1]);
      atr += high - low;
    }
    return atr / this.atrPeriod;
  }

  private stakeFactor(volatility: number | null): number {
    if (!volatility) return 1;
    if (volatility > this.volatilityThreshold * 1.5) return 0.8;
    if (volatility < this.volatilityThreshold * 0.5) return 1.2;
    return 1;
  }

  private duration(volatility: number | null): number {
    if (!volatility) return 1;
    if (volatility > this.volatilityThreshold * 1.5) return 1;
    if (volatility < this.volatilityThreshold * 0.5) return 2;
    return 1;
  }
}