import type { Strategy, StrategyCtx, TradeSpec } from "../types";
import { ALL_MARKETS } from "../engine";

/**
 * All Markets Differ — DIGITDIFF across every volatility market.
 *
 * Port of the BotsLab "All Markets Differ" bot. Pure random selection with
 * anti-repeat guards; no indicator analysis and no recovery mode.
 *   - Market: random from ALL_MARKETS, avoiding an immediate repeat of the last market.
 *   - Digit:  random 0-9; if it equals the previous digit, use (digit+3)%10.
 *   - Trade:  DIGITDIFF, barrier = String(digit), duration 1 tick.
 *
 * Stake, martingale, TP/SL, connection and one-trade gating are all engine-owned.
 */
export class AllMarketsDifferStrategy implements Strategy {
  readonly markets = ALL_MARKETS;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 16;

  private lastMarket: string | null = null;
  private lastDigit: number | null = null;

  reset() {
    this.lastMarket = null;
    this.lastDigit = null;
  }

  // No tick analysis — market/digit selection is purely random.
  onTick(_symbol: string, _quote: number, _lastDigit: number) {}

  nextTrade(_ctx: StrategyCtx): TradeSpec {
    const market = this.nextMarket();
    const digit = this.nextDigit();
    return {
      market,
      contractType: "DIGITDIFF",
      barrier: String(digit),
      duration: 1,
      targetLabel: `Differ ${digit}`,
    };
  }

  // No recovery mode — nothing to adjust on a result.
  onResult(_win: boolean, _ctx: StrategyCtx) {}

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
    if (digit === this.lastDigit) {
      digit = (digit + 3) % 10;
    }
    this.lastDigit = digit;
    return digit;
  }
}
