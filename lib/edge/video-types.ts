/**
 * Shared shapes for Edge prediction videos (client + server, pure TS). A VideoPlan
 * is produced server-side (real predictions + a brief two-voice dialogue + sport
 * media) and rendered client-side into BOTH a 9:16 and a 16:9 MP4 from one set of
 * premium-voice audio.
 */
export type VideoMatch = {
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  sport: string;
  league: string;
  leagueEmoji?: string;
  /** Outright favourite — drives the on-screen VS highlight. */
  winner: string;
  winnerProb: number; // 0..1
  drawProb?: number;
  /** The BEST play — often a safer market than the outright (double chance, DNB,
   *  over/under…) giving the best chance to win. This is what the analyst says. */
  pick: string;
  pickProb: number; // 0..1
  pickMarket?: string; // e.g. "Double chance", "Total goals"
  /** Natural, number-free spoken call ("there's a good chance France take this one") —
   *  entertainment phrasing that avoids odds/percentages/betting language. */
  callText: string;
  bgImage?: string; // canvas-safe Pexels sport background
};

/** One spoken beat. speaker "a" = Isaac (asks), "b" = Matilda (the analyst, answers). */
export type VideoScene = {
  speaker: "a" | "b";
  line: string;
  matchIndex: number; // which match is on screen (-1 = intro/outro title card)
};

export type VideoPlan = {
  title: string;
  matches: VideoMatch[];
  scenes: VideoScene[];
  createdAt: string;
};

/** What a saved history row stores (re-openable). */
export type EdgeVideoSnapshot = { prompt: string; plan: VideoPlan };

/**
 * Per-user video branding. Defaults to Clunoid; a brand can point it at their own
 * site + logo + call-to-action. "throughout" adds a small corner watermark on every
 * frame plus the end card; "end" shows only the end card. Auto-saved (no save button).
 */
export type Branding = {
  enabled: boolean;
  placement: "end" | "throughout";
  corner: "top" | "bottom"; // watermark corner when placement is "throughout"
  name: string; // watermark text, e.g. "clunoid.com"
  tagline: string; // end-card line, e.g. "Made on clunoid.com" / "Play on yourbrand.com"
  website?: string; // the brand's site (for logo re-fetch / reference)
  logo?: string; // canvas-safe data URL (optional brand logo)
};
