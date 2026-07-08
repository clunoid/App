/**
 * CLUNOID EDGE — Sports Intelligence & Betting Analysis, core types.
 *
 * Design goals mirrored from the Trading Desk:
 *   • REAL DATA ONLY — every number traces to a verified provider response or a
 *     cited web source; the AI layer INTERPRETS, it never invents figures.
 *   • Probabilities & uncertainty are first-class; "no bet" is a valid, often
 *     desirable output when evidence is thin.
 *   • Modular: sports is the first module; the shapes below (Prediction,
 *     Evidence, Market) are domain-generic so esports/politics/markets can slot
 *     in later without a redesign.
 *
 * Admin-only while it matures (same allow-list as the Trading Desk).
 */

/** A sport + its ESPN path segment (sport/league) — the keyless data backbone. */
export type Sport = "soccer" | "basketball" | "football" | "baseball" | "hockey" | "mma" | "tennis";

export type LeagueDef = {
  id: string; // internal id, e.g. "eng.1"
  sport: Sport;
  espnPath: string; // ESPN "{sport}/{league}", e.g. "soccer/eng.1"
  name: string; // "Premier League"
  country?: string;
  emoji?: string;
  /** Outcome space: 3-way (soccer draw possible) or 2-way (most US sports). */
  threeWay: boolean;
};

/** One team as the providers describe it (logo/branding included). */
export type Team = {
  id: string;
  name: string;
  shortName?: string;
  abbrev?: string;
  logo?: string; // ESPN a.espncdn.com or TheSportsDB badge
  record?: string; // "W-D-L" / "W-L"
  form?: string; // recent results string, e.g. "WWDLW" (most recent last)
  standing?: number; // league position when known
};

/** A scheduled or completed match. */
export type Fixture = {
  id: string;
  league: string; // LeagueDef.id
  sport: Sport;
  startsAt: string; // ISO
  status: "scheduled" | "in" | "final";
  home: Team;
  away: Team;
  venue?: string;
  homeScore?: number;
  awayScore?: number;
};

/** Market odds for a fixture (bookmaker or ESPN pickcenter), decimal form. */
export type MarketOdds = {
  provider?: string;
  homeWin?: number; // decimal odds
  draw?: number;
  awayWin?: number;
  overUnder?: number; // total line
  spread?: number; // home spread (US)
  /** De-vig implied probabilities derived from the above (0..1, sum≈1). */
  implied?: { home?: number; draw?: number; away?: number };
};

/** An injury / availability note for a player. */
export type Availability = {
  team: "home" | "away";
  player: string;
  status: string; // "Out", "Questionable", "Suspended"…
  detail?: string;
};

/** A piece of evidence the analysis rests on — always traceable. */
export type Evidence = {
  kind: "stat" | "form" | "h2h" | "injury" | "market" | "news" | "context";
  text: string;
  source?: string; // provider name or URL
  weight?: "low" | "medium" | "high";
};

/** Model output for a single market on a fixture (quantitative, pre-AI). */
export type ModelProbabilities = {
  home: number;
  draw?: number;
  away: number;
  /** Expected goals/points per side where the model produces them. */
  expHome?: number;
  expAway?: number;
  /** Extra markets when computable (soccer): P(over 2.5), P(BTTS). */
  overProb?: number;
  bttsProb?: number;
  method: string; // "dixon-coles" | "market-blend" | "elo" …
};

/** A concrete recommendation on one betting selection. */
export type Selection = {
  market: string; // "Match result", "Over 2.5 goals", "BTTS"…
  pick: string; // "Arsenal to win", "Over 2.5"…
  modelProb: number; // 0..1
  impliedProb?: number; // 0..1 from de-vigged market
  fairOdds: number; // 1 / modelProb
  bookOdds?: number; // decimal
  edgePct?: number; // (modelProb*bookOdds - 1) * 100
  kellyFraction?: number; // fraction of bankroll (fractional Kelly)
  confidence: number; // 0..100 calibrated confidence in THIS pick
};

/** The full analysis returned for a user question. */
export type PredictionReport = {
  question: string;
  fixture?: Fixture;
  league?: LeagueDef;
  /** Highest-conviction stance. `noBet` when evidence is insufficient. */
  verdict: {
    stance: "bet" | "lean" | "no-bet";
    headline: string; // one-line human summary
    topSelection?: Selection;
    confidence: number; // 0..100 overall
  };
  probabilities?: ModelProbabilities;
  market?: MarketOdds;
  selections: Selection[]; // ranked; can be empty (no-bet)
  availability: Availability[];
  evidence: Evidence[];
  reasoning: string; // AI narrative — interpretation, cites the evidence above
  risks: string[]; // what could invalidate the read
  dataAsOf: string; // ISO
  disclaimer: string; // responsible-gambling framing (always present)
};

/** Responsible-gambling text shown on every report (never omitted). */
export const RG_DISCLAIMER =
  "For 18+ analysis and entertainment only. These are probabilistic estimates, not guarantees — no prediction can assure a winning outcome. Only ever stake what you can afford to lose. If gambling stops being fun, seek help (e.g. BeGambleAware.org / 1-800-GAMBLER).";
