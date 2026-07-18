import type { Strategy, StrategyCtx, TradeSpec } from "../types";
import { ALL_MARKETS } from "../engine";

// Random Markets Under 9
// Ported from BotsLab "allMarketsUnder" bot.
// Fires DIGITUNDER with barrier "9" on ALL_MARKETS, rotating the market each
// trade by picking a random market that is NOT the one just used (avoids
// immediate repeats). Fixed 1-tick duration. No indicators / no digit analysis.
export class RandomUnder9Strategy implements Strategy {
  readonly markets = ALL_MARKETS;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 16;

  private lastMarket: string | null = null;

  reset() {
    this.lastMarket = null;
  }

  onTick(_symbol: string, _quote: number, _lastDigit: number) {
    // No tick analysis — this strategy trades on rotation alone.
  }

  nextTrade(_ctx: StrategyCtx): TradeSpec {
    const market = this.getNextMarket();
    return {
      market,
      contractType: "DIGITUNDER",
      barrier: "9",
      duration: 1,
      targetLabel: "Under 9",
    };
  }

  onResult(_win: boolean, _ctx: StrategyCtx) {
    // No state to update on result (stake/martingale owned by the engine).
  }

  // Same market rotation as the source: pick a random market that isn't the
  // last one used; fall back to any market if that leaves no options.
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
