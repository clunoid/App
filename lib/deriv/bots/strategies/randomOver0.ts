import type { Strategy, StrategyCtx, TradeSpec } from "../types";
import { ALL_MARKETS } from "../engine";

/**
 * Random Markets Over 0
 * -----------------------------------------------------------------------------
 * Ported from the BotsLab "All Markets Over" bot.
 *
 * Logic: fire a DIGITOVER contract with barrier "0" on a randomly-selected
 * market, rotating so the same market is never picked twice in a row
 * (matches the source getNextMarket()). Fixed 1-tick duration. There is no
 * digit/indicator analysis — the barrier is always "0" and every poll trades.
 *
 * Stake, martingale, take-profit and stop-loss are all owned by the engine.
 */
export class RandomOver0Strategy implements Strategy {
  readonly markets = ALL_MARKETS;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 16;

  private lastMarket: string | null = null;

  reset() {
    this.lastMarket = null;
  }

  onTick(_symbol: string, _quote: number, _lastDigit: number) {
    // No analysis required — this bot trades on every idle poll.
  }

  nextTrade(_ctx: StrategyCtx): TradeSpec {
    const market = this.getNextMarket();
    return {
      market,
      contractType: "DIGITOVER",
      barrier: "0",
      duration: 1,
      targetLabel: "Over 0",
    };
  }

  onResult(_win: boolean, _ctx: StrategyCtx) {
    // Engine handles stake reset / martingale; nothing to track here.
  }

  private getNextMarket(): string {
    const options = this.markets.filter((m) => m !== this.lastMarket);
    if (options.length === 0) {
      return this.markets[Math.floor(Math.random() * this.markets.length)];
    }
    const market = options[Math.floor(Math.random() * options.length)];
    this.lastMarket = market;
    return market;
  }
}
