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
  /** The predicted winner (always present — "no bet" is not an option in a video). */
  winner: string;
  winnerProb: number; // 0..1
  drawProb?: number;
  edgeLine?: string; // e.g. "clear favourites", "narrow call", "coin-flip → slight lean"
  bgImage?: string; // canvas-safe Pexels sport background
};

/** One spoken beat. speaker "a" = Isaac (asks), "b" = Sarah (the analyst, answers). */
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
