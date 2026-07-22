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

export type BotBadge = "Recommended" | "Popular" | "Beginner" | "Fast" | "Stable";

export type BotMeta = {
  id: string;            // URL slug
  name: string;
  rating: number;
  chip: string;          // short strategy tag
  tagline: string;
  blurb: string;
  badges?: BotBadge[];
  markets: string;       // display, e.g. "Volatility 10–100" or "Volatility 75"
  supportsMartingale: boolean;
  defaultMartingale: number;
  createStrategy: () => Strategy;
};

export const BOTS: BotMeta[] = [
  {
    id: "smart-recovery-differ", name: "Smart Recovery Differ", rating: 5.0, chip: "Flagship", badges: ["Recommended", "Popular"],
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 3.1,
    tagline: "Our most trusted all-rounder",
    blurb: "The bot our traders reach for first. A refined, fully-automated engine that reads the market in real time and presses its advantage when the odds line up — built to keep performing through every condition.",
    createStrategy: () => new SmartRecoveryDifferStrategy(),
  },
  {
    id: "all-markets-differ", name: "All Markets Differ", rating: 4.9, chip: "Easy start", badges: ["Beginner"],
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Set it and let it work",
    blurb: "A dependable, hands-free workhorse that stays busy around the clock across the whole market. Simple to start, hard to rattle — the perfect first bot.",
    createStrategy: () => new AllMarketsDifferStrategy(),
  },
  {
    id: "random-over-0", name: "Random Markets Over 0", rating: 4.7, chip: "Turbo", badges: ["Fast"],
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Fast, relentless, always on",
    blurb: "Built for speed — it fires rapidly and never sits still, turning constant market motion into a steady flow of opportunities. Pure momentum, fully automated.",
    createStrategy: () => new RandomOver0Strategy(),
  },
  {
    id: "random-under-9", name: "Random Markets Under 9", rating: 4.8, chip: "Steady", badges: ["Stable"],
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Consistency you can leave running",
    blurb: "A calm, high-consistency performer that keeps its footing and grinds patiently. Low drama, dependable, and happy to run for hours untouched.",
    createStrategy: () => new RandomUnder9Strategy(),
  },
  {
    id: "smart-differ-pro", name: "Smart Differ Pro", rating: 4.9, chip: "Pro",
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Professional-grade precision",
    blurb: "A sharpened, professional-grade engine that picks its moments with discipline. Refined for traders who want a real edge with less of the noise.",
    createStrategy: () => new SmartDifferProStrategy(),
  },
  {
    id: "magic-random", name: "Magic Random Strategy", rating: 4.9, chip: "Versatile",
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Many angles, one smart engine",
    blurb: "A versatile powerhouse that works several angles at once and knows exactly when to protect a good run. Adaptive, unpredictable, and fully automated.",
    createStrategy: () => new MagicRandomStrategy(),
  },
  {
    id: "smart-volatility", name: "Smart Volatility", rating: 4.95, chip: "Precision",
    markets: "Volatility indices", supportsMartingale: false, defaultMartingale: 1,
    tagline: "Reads the market, strikes with precision",
    blurb: "One of our highest-rated engines — it senses shifting market energy and strikes with measured, precise timing. Sharp, selective, and confident.",
    createStrategy: () => new SmartVolatilityStrategy(),
  },
  {
    id: "smart-even", name: "Smart Even", rating: 4.92, chip: "Perceptive",
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 3.1,
    tagline: "Sees what others miss",
    blurb: "A perceptive engine that reads the market's rhythm and acts before the moment fades. Quietly clever, steady, and always watching.",
    createStrategy: () => new SmartEvenStrategy(),
  },
  {
    id: "no-touch-sentinel", name: "No Touch Sentinel", rating: 4.88, chip: "Sentinel",
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 16,
    tagline: "Patient, watchful, decisive",
    blurb: "A watchful sentinel that waits for the right conditions and commits only when they align. Patient by design, decisive when it counts.",
    createStrategy: () => new NoTouchStrategy(),
  },
  {
    id: "alien-rise-fall", name: "Alien Rise/Fall", rating: 4.94, chip: "Agile",
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 3.1,
    tagline: "Quick to read, quicker to act",
    blurb: "An agile, reactive engine that reads the market in a heartbeat and adjusts on the fly. Fast, adaptive, and built to bounce back.",
    createStrategy: () => new AlienRiseFallStrategy(),
  },
  {
    id: "rise-fall-pro", name: "Rise/Fall Pro", rating: 4.9, chip: "Elite",
    markets: "Volatility indices", supportsMartingale: true, defaultMartingale: 3.1,
    tagline: "Moves only on real conviction",
    blurb: "An elite, high-conviction engine that holds fire until the moment is truly right — quality over quantity, discipline over noise. Powerful and precise.",
    createStrategy: () => new RiseFallProStrategy(),
  },
];

export const getBot = (id: string): BotMeta | undefined => BOTS.find((b) => b.id === id);
