/**
 * Bot catalog — the ordered list of Deriv bots, mirroring BotsLab's display order.
 * Each entry carries the card metadata + a factory for its Strategy. The engine
 * (engine.ts) runs any of them identically; only the Strategy differs.
 */
import type { Strategy } from "./types";
import { SmartRecoveryDifferStrategy } from "./strategies/smartRecoveryDiffer";
import { AllMarketsDifferStrategy } from "./strategies/allMarketsDiffer";
import { RandomOver0Strategy } from "./strategies/randomOver0";
import { RandomUnder9Strategy } from "./strategies/randomUnder9";
import { SmartDifferProStrategy } from "./strategies/smartDifferPro";
import { MagicRandomStrategy } from "./strategies/magicRandom";
import { SmartVolatilityStrategy } from "./strategies/smartVolatility";
import { SmartEvenStrategy } from "./strategies/smartEven";
import { NoTouchStrategy } from "./strategies/noTouch";
import { AlienRiseFallStrategy } from "./strategies/alienRiseFall";
import { RiseFallProStrategy } from "./strategies/riseFallPro";

export type BotBadge = "Popular" | "Beginner" | "Fast" | "Stable";

export type BotMeta = {
  id: string;            // URL slug
  name: string;
  rating: number;
  chip: string;          // short strategy tag
  tagline: string;
  blurb: string;
  badge?: BotBadge;
  markets: string;       // display, e.g. "Volatility 10–100" or "Volatility 75"
  supportsMartingale: boolean;
  defaultMartingale: number;
  createStrategy: () => Strategy;
};

// Order = BotsLab BOT_DEFINITIONS order.
export const BOTS: BotMeta[] = [
  {
    id: "all-markets-differ", name: "All Markets Differ", rating: 4.9, chip: "Digit Differ", badge: "Popular",
    markets: "Volatility 10–100", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Random markets & digits, smart recovery",
    blurb: "Trades 1-tick Digit Differ across all Volatility indices, rotating markets and digits. Standard martingale recovery after a loss.",
    createStrategy: () => new AllMarketsDifferStrategy(),
  },
  {
    id: "random-over-0", name: "Random Markets Over 0", rating: 4.7, chip: "Digit Over", badge: "Beginner",
    markets: "Volatility 10–100", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Over 0 across random markets",
    blurb: "Trades Digit Over 0 (last digit greater than 0) on a rotating Volatility index each tick, with martingale recovery.",
    createStrategy: () => new RandomOver0Strategy(),
  },
  {
    id: "smart-recovery-differ", name: "Smart Recovery Differ", rating: 5.0, chip: "Differ + Recovery", badge: "Fast",
    markets: "Volatility 10–100", supportsMartingale: true, defaultMartingale: 3.1,
    tagline: "Smart digit differ with market-analysis recovery",
    blurb: "Digit Differ in normal mode; after a loss it analyses each market's last-digit bias and switches to Over-4 / Under-5 recovery until a win, then resets.",
    createStrategy: () => new SmartRecoveryDifferStrategy(),
  },
  {
    id: "random-under-9", name: "Random Markets Under 9", rating: 4.8, chip: "Digit Under", badge: "Stable",
    markets: "Volatility 10–100", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Under 9 across random markets",
    blurb: "Trades Digit Under 9 (last digit less than 9) on a rotating Volatility index each tick, with martingale recovery.",
    createStrategy: () => new RandomUnder9Strategy(),
  },
  {
    id: "smart-differ-pro", name: "Smart Differ Pro", rating: 4.9, chip: "Digit Differ",
    markets: "Volatility 10–100", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Multi-market digit differ",
    blurb: "A refined multi-market Digit Differ: rotates markets and digits with anti-repeat selection and martingale recovery.",
    createStrategy: () => new SmartDifferProStrategy(),
  },
  {
    id: "magic-random", name: "Magic Random Strategy", rating: 4.9, chip: "Multi-contract",
    markets: "Volatility 10–100", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Random Differ / Under / Over, win-gated stops",
    blurb: "Each trade randomly picks Differ, Under 9 or Over 0 with balanced digit usage. Adds win-gated safety stops (loss streaks / time) that only trigger after a win.",
    createStrategy: () => new MagicRandomStrategy(),
  },
  {
    id: "smart-volatility", name: "Smart Volatility", rating: 4.95, chip: "Rise/Fall · ATR",
    markets: "Volatility 75", supportsMartingale: false, defaultMartingale: 1,
    tagline: "ATR-driven CALL/PUT scalps",
    blurb: "Reads short-term volatility (ATR) on Volatility 75 and scalps CALL/PUT with volatility-shaped stake and duration. No martingale.",
    createStrategy: () => new SmartVolatilityStrategy(),
  },
  {
    id: "smart-even", name: "Smart Even", rating: 4.92, chip: "Even/Odd",
    markets: "Volatility 50", supportsMartingale: true, defaultMartingale: 3.1,
    tagline: "Anti-streak even/odd patterning",
    blurb: "Tracks even/odd streaks and distribution on Volatility 50 and fades strong streaks with Even/Odd trades, using martingale recovery.",
    createStrategy: () => new SmartEvenStrategy(),
  },
  {
    id: "no-touch-sentinel", name: "No Touch Sentinel", rating: 4.88, chip: "No Touch",
    markets: "Volatility 100", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Trend-sensing No Touch",
    blurb: "Scans Volatility 100 with moving averages, RSI and momentum for range conditions, then places a 5-tick No Touch at ±0.63 with martingale recovery.",
    createStrategy: () => new NoTouchStrategy(),
  },
  {
    id: "alien-rise-fall", name: "Alien Rise/Fall", rating: 4.94, chip: "Rise/Fall",
    markets: "Volatility 10", supportsMartingale: true, defaultMartingale: 3.1,
    tagline: "Rapid trend re-entry",
    blurb: "Uses RSI and trend strength on Volatility 10 for 5-tick CALL/PUT, tightening re-entry after a loss. Martingale recovery.",
    createStrategy: () => new AlienRiseFallStrategy(),
  },
  {
    id: "rise-fall-pro", name: "Rise/Fall Pro", rating: 4.9, chip: "Rise/Fall",
    markets: "Volatility 10", supportsMartingale: true, defaultMartingale: 3.1,
    tagline: "Momentum-confirmed Rise/Fall",
    blurb: "Combines multi-window momentum, RSI, MACD and price patterns on Volatility 10 for confirmed 5-tick CALL/PUT with martingale recovery.",
    createStrategy: () => new RiseFallProStrategy(),
  },
];

export const getBot = (id: string): BotMeta | undefined => BOTS.find((b) => b.id === id);
