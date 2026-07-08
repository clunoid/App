/**
 * The league registry — verified LIVE against the ESPN keyless API. Each entry's
 * `espnPath` is a confirmed `{sport}/{league}` scoreboard/standings route. Adding
 * a league is one line here; nothing else changes.
 */
import type { LeagueDef } from "./types";

export const LEAGUES: LeagueDef[] = [
  // ── soccer (3-way: draw is a real outcome) ──
  { id: "eng.1", sport: "soccer", espnPath: "soccer/eng.1", name: "Premier League", country: "England", emoji: "🏴", threeWay: true },
  { id: "esp.1", sport: "soccer", espnPath: "soccer/esp.1", name: "La Liga", country: "Spain", emoji: "🇪🇸", threeWay: true },
  { id: "ita.1", sport: "soccer", espnPath: "soccer/ita.1", name: "Serie A", country: "Italy", emoji: "🇮🇹", threeWay: true },
  { id: "ger.1", sport: "soccer", espnPath: "soccer/ger.1", name: "Bundesliga", country: "Germany", emoji: "🇩🇪", threeWay: true },
  { id: "fra.1", sport: "soccer", espnPath: "soccer/fra.1", name: "Ligue 1", country: "France", emoji: "🇫🇷", threeWay: true },
  { id: "uefa.champions", sport: "soccer", espnPath: "soccer/uefa.champions", name: "Champions League", country: "Europe", emoji: "🏆", threeWay: true },
  { id: "usa.1", sport: "soccer", espnPath: "soccer/usa.1", name: "MLS", country: "USA", emoji: "🇺🇸", threeWay: true },
  // ── US majors (2-way: no draw in the analysis, ties handled as rare) ──
  { id: "nba", sport: "basketball", espnPath: "basketball/nba", name: "NBA", country: "USA", emoji: "🏀", threeWay: false },
  { id: "nfl", sport: "football", espnPath: "football/nfl", name: "NFL", country: "USA", emoji: "🏈", threeWay: false },
  { id: "mlb", sport: "baseball", espnPath: "baseball/mlb", name: "MLB", country: "USA", emoji: "⚾", threeWay: false },
  { id: "nhl", sport: "hockey", espnPath: "hockey/nhl", name: "NHL", country: "USA", emoji: "🏒", threeWay: false },
  { id: "ufc", sport: "mma", espnPath: "mma/ufc", name: "UFC", country: "Global", emoji: "🥊", threeWay: false },
];

export const leagueById = (id: string): LeagueDef | undefined => LEAGUES.find((l) => l.id === id);

/** Guess the most likely league(s) a free-text question refers to, by keyword.
 *  Deterministic pre-filter so the resolver fetches only relevant scoreboards. */
export function guessLeagues(q: string): LeagueDef[] {
  const s = q.toLowerCase();
  const hit = (kw: RegExp, id: string) => (kw.test(s) ? leagueById(id) : undefined);
  const picks = [
    hit(/premier league|\bepl\b|english|arsenal|liverpool|man |chelsea|tottenham|spurs|newcastle|villa/, "eng.1"),
    hit(/la ?liga|spain|spanish|real madrid|barcelona|barca|atletico|sevilla/, "esp.1"),
    hit(/serie a|italy|italian|juventus|inter|milan|napoli|roma|lazio/, "ita.1"),
    hit(/bundesliga|germany|german|bayern|dortmund|leipzig|leverkusen/, "ger.1"),
    hit(/ligue ?1|france|french|psg|paris|marseille|monaco/, "fra.1"),
    hit(/champions league|\bucl\b|champions/, "uefa.champions"),
    hit(/\bmls\b|major league soccer/, "usa.1"),
    hit(/\bnba\b|basketball|lakers|celtics|warriors|knicks|nuggets|bucks/, "nba"),
    hit(/\bnfl\b|football|chiefs|eagles|cowboys|49ers|bills|ravens|quarterback/, "nfl"),
    hit(/\bmlb\b|baseball|yankees|dodgers|red sox|mets|cubs/, "mlb"),
    hit(/\bnhl\b|hockey|rangers|maple leafs|bruins|oilers/, "nhl"),
    hit(/\bufc\b|\bmma\b|fight|octagon/, "ufc"),
  ].filter(Boolean) as LeagueDef[];
  // De-dup while preserving order.
  return [...new Map(picks.map((l) => [l.id, l])).values()];
}
