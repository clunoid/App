import type { Strategy, TradeSpec } from "../types";
import { ALL_MARKETS } from "../engine";

type MarketAnalysis = { digits: number[]; over4: number; under5: number; total: number };

/**
 * SMART RECOVERY DIFFER — normal mode DIGITDIFF (random market + digit); on a loss it
 * switches to RECOVERY mode: analyse each market's recent last-digit distribution and
 * trade Over-4 / Under-5 on the most-biased market until a win, then reset.
 */
export class SmartRecoveryDifferStrategy implements Strategy {
  readonly markets = ALL_MARKETS;
  readonly supportsMartingale = true;
  readonly defaultMartingale = 3.1;

  private analysis: Record<string, MarketAnalysis> = {};
  private lastMarket: string | null = null;
  private lastDigit: number | null = null;
  private recoveryMode = false;
  private recoveryMarket: string | null = null;
  private recoveryType: "OVER" | "UNDER" | null = null;

  reset(): void {
    this.analysis = {};
    this.lastMarket = null;
    this.lastDigit = null;
    this.recoveryMode = false;
    this.recoveryMarket = null;
    this.recoveryType = null;
  }

  onTick(symbol: string, _quote: number, lastDigit: number): void {
    let a = this.analysis[symbol];
    if (!a) a = this.analysis[symbol] = { digits: [], over4: 0, under5: 0, total: 0 };
    a.digits.push(lastDigit);
    a.total++;
    if (a.digits.length > 50) {
      const dropped = a.digits.shift() as number;
      if (dropped > 4) a.over4--;
      if (dropped < 5) a.under5--;
      a.total--;
    }
    if (lastDigit > 4) a.over4++;
    if (lastDigit < 5) a.under5++;
  }

  nextTrade(): TradeSpec {
    if (this.recoveryMode) {
      if (!this.recoveryMarket || !this.recoveryType) {
        const r = this.analyze();
        this.recoveryMarket = r.market; this.recoveryType = r.type;
      }
      if (this.recoveryType === "OVER") return { market: this.recoveryMarket, contractType: "DIGITOVER", barrier: "4", duration: 1, targetLabel: "Over 4" };
      return { market: this.recoveryMarket, contractType: "DIGITUNDER", barrier: "5", duration: 1, targetLabel: "Under 5" };
    }
    const market = this.nextMarket();
    const digit = this.nextDigit();
    return { market, contractType: "DIGITDIFF", barrier: String(digit), duration: 1, targetLabel: `Differ ${digit}` };
  }

  onResult(win: boolean): void {
    if (win) {
      this.recoveryMode = false; this.recoveryMarket = null; this.recoveryType = null;
    } else if (!this.recoveryMode) {
      this.recoveryMode = true;
      const r = this.analyze();
      this.recoveryMarket = r.market; this.recoveryType = r.type;
    }
  }

  private analyze(): { market: string; type: "OVER" | "UNDER" } {
    let best: string | null = null, type: "OVER" | "UNDER" | null = null, score = 0;
    for (const m of this.markets) {
      const a = this.analysis[m];
      if (!a || a.total < 10) continue;
      const o = a.over4 / a.total, u = a.under5 / a.total;
      if (o > 0.6 && o > score) { score = o; best = m; type = "OVER"; }
      if (u > 0.6 && u > score) { score = u; best = m; type = "UNDER"; }
    }
    if (!best) {
      let max = 0;
      for (const m of this.markets) { const a = this.analysis[m]; if (a && a.total > max) { max = a.total; best = m; type = "OVER"; } }
    }
    if (!best) { best = this.markets[Math.floor(Math.random() * this.markets.length)]; type = "OVER"; }
    return { market: best, type: type || "OVER" };
  }

  private nextMarket(): string {
    if (!this.lastMarket) this.lastMarket = this.markets[Math.floor(Math.random() * this.markets.length)];
    return this.lastMarket;
  }

  private nextDigit(): number {
    let digit = Math.floor(Math.random() * 10);
    if (digit === this.lastDigit) digit = (digit + 3) % 10;
    this.lastDigit = digit;
    return digit;
  }
}
