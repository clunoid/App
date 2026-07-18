import type { Strategy, TradeSpec } from "../types";
import { ALL_MARKETS } from "../engine";

/**
 * SMART DIFFER PRO — randomized DIGITDIFF across all volatility markets.
 * Each trade rotates to a DIFFERENT market than the previous one (never repeats the
 * immediately-preceding market) and picks a random barrier digit 0-9; if the random
 * digit equals the last one used it is nudged by (d + 3) % 10 to force variety.
 * Fixed 1-tick DIGITDIFF; martingale/stake/TP-SL are owned by the engine.
 */
export class SmartDifferProStrategy implements Strategy {
  readonly markets = ALL_MARKETS;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 16;

  private lastMarket: string | null = null;
  private lastDigit: number | null = null;

  reset(): void {
    this.lastMarket = null;
    this.lastDigit = null;
  }

  onTick(): void {
    // No indicator analysis — Smart Differ Pro trades on random market/digit rotation only.
  }

  nextTrade(): TradeSpec {
    const market = this.nextMarket();
    const digit = this.nextDigit();
    return { market, contractType: "DIGITDIFF", barrier: String(digit), duration: 1, targetLabel: `Differ ${digit}` };
  }

  onResult(): void {
    // No per-result state — the engine owns stake, martingale and take-profit / stop-loss.
  }

  private nextMarket(): string {
    const options = this.markets.filter((m) => m !== this.lastMarket);
    if (options.length === 0) {
      return this.markets[Math.floor(Math.random() * this.markets.length)];
    }
    const market = options[Math.floor(Math.random() * options.length)];
    this.lastMarket = market;
    return market;
  }

  private nextDigit(): number {
    let digit = Math.floor(Math.random() * 10);
    if (digit === this.lastDigit) digit = (digit + 3) % 10;
    this.lastDigit = digit;
    return digit;
  }
}
