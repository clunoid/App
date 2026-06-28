import { BarChart3, Gamepad2, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for Clunoid's "features" — the things that live
 * alongside Isaac's search (Games, Stat Battle, and whatever we add next).
 *
 * Both the home sticky-notes and the search disambiguation read from here, so
 * adding a feature is one entry: give it a matcher + where it opens, and it
 * automatically gets a card AND the "open it, or just search?" prompt.
 */

export type FeatureId = "games" | "stats";
export type Accent = "clay" | "spark";

export type FeatureDef = {
  id: FeatureId;
  /** Short product name, e.g. "Games", "Stat Battle". */
  label: string;
  /** One-line description for the sticky note. */
  note: string;
  /** Brand accent used for the card + chooser. */
  accent: Accent;
  Icon: LucideIcon;
  /** Where the sticky note / header button navigates (the feature's home). */
  hub: string;
  /** Where "Open it" from the chooser navigates — uses the query when it's a
   *  real feature request, otherwise just the feature's home. */
  open: (q?: string) => string;
  /** Does this query relate to the feature (by name, or a strong request)? */
  relates: (q: string) => boolean;
};

// ── Strong-intent matchers (a query that clearly IS a feature request) ───────

/** A flag-game request, e.g. "guess the flag", "play a flags quiz". */
export function isGameRequest(t: string): boolean {
  const s = t.toLowerCase();
  if (/\bguess\s+the\s+(flag|countr)/.test(s)) return true;
  if (/\bflags?\b/.test(s) && /\b(game|quiz|challenge|play|guess|round|mode)\b/.test(s)) return true;
  if (/\bflag\s+(game|quiz)\b/.test(s)) return true;
  if (/\b(play|start)\b.*\b(flag|country|countries)\b/.test(s)) return true;
  return false;
}

/**
 * A stat-battle / bar-chart-race request — a RANKING THAT MOVES over time, not a
 * one-off factual lookup. We deliberately do NOT trigger on a metric + a bare
 * year ("gdp in 2024", "net worth 2024" are facts Isaac should just answer); a
 * battle needs either an inherent multi-entity ranking, or an explicit
 * trend/time-series signal (over time, a year RANGE, by year, …).
 */
export function isStatRequest(t: string): boolean {
  const s = t.toLowerCase();
  // 1) Explicit race / bar-chart-race phrasing.
  if (/\b(bar[-\s]?chart\s*race|stat\s*(battle|race)|ranking\s*over\s*time|race\s*chart)\b/.test(s)) return true;
  // 2) Inherently a multi-entity ranking → a battle even without a time phrase.
  if (/\b(largest|biggest|wealthiest|richest|poorest|most populous|top\s+\d+)\s+(?:econom(?:y|ies)|countries|nations|companies|cities|states)\b/.test(s))
    return true;
  // 3) A tracked metric + an explicit trend/time-series signal (never a bare year).
  if (
    /\b(gdp|elo|population|net worth|market cap|subscribers?|medals?|emissions|co2|military spending|defen[cs]e spending|life expectancy|inflation|per capita)\b/.test(s) &&
    /\b(over time|over the (?:years|decades)|through the (?:years|decades)|year[\s-]by[\s-]year|by year|each year|race|since \d{4}|from \d{4}|\d{4}\s*(?:to|through|–|—|-)\s*\d{4}|between \d{4} and \d{4})\b/.test(s)
  )
    return true;
  return false;
}

// ── Name triggers (the query is essentially just the feature's name) ─────────
// Tight, whole-string matches so "open games" / "stats" trigger the prompt but
// "olympic games" / "population statistics report" don't.
const WRAP = String.raw`(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:i\s+(?:want|wanna|need)\s+(?:to\s+)?)?(?:(?:open|launch|start|play|enter|begin|go\s+to|goto|show(?:\s+me)?|take\s+me\s+to)\s+)?(?:the\s+)?`;
const GAME_NAME = new RegExp(`^${WRAP}(?:flag\\s+)?(?:games?|arcade)\\s*[?!.]*$`);
const STAT_NAME = new RegExp(`^${WRAP}(?:stat\\s*battles?|stats?)\\s*[?!.]*$`);

// ── The registry ─────────────────────────────────────────────────────────────

export const FEATURES: FeatureDef[] = [
  {
    id: "games",
    label: "Games",
    note: "Play & guess — flags, quizzes & more.",
    accent: "clay",
    Icon: Gamepad2,
    hub: "/games",
    // A real flag request opens the game with it; a bare "games"/"open games"
    // just opens the hub (never prefill the feature name as a topic).
    open: (q) =>
      q && !GAME_NAME.test(q.toLowerCase().trim()) && isGameRequest(q)
        ? `/games/flags?q=${encodeURIComponent(q)}`
        : "/games",
    relates: (q) => GAME_NAME.test(q.toLowerCase().trim()) || isGameRequest(q),
  },
  {
    id: "stats",
    label: "Stat Battle",
    note: "Watch any ranking race over time.",
    accent: "spark",
    Icon: BarChart3,
    hub: "/stats",
    // A real battle topic builds it; a bare "stats"/"open stat battle" just
    // opens the menu (never prefill the feature name as a topic).
    open: (q) =>
      q && !STAT_NAME.test(q.toLowerCase().trim()) && isStatRequest(q)
        ? `/stats?q=${encodeURIComponent(q)}`
        : "/stats",
    relates: (q) => STAT_NAME.test(q.toLowerCase().trim()) || isStatRequest(q),
  },
];

export function featureById(id: FeatureId): FeatureDef {
  return FEATURES.find((f) => f.id === id)!;
}

/**
 * If a query relates to a feature, return it (so the UI can ask "open it, or
 * just search?"). Each feature decides via its own relates(); precedence is the
 * registry order. Returns null for an ordinary search so Isaac just answers.
 */
export function matchFeature(text: string): FeatureDef | null {
  const s = text.toLowerCase().trim();
  if (!s) return null;
  return FEATURES.find((f) => f.relates(s)) ?? null;
}
