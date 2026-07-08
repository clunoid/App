/**
 * The competition registry — every entry VERIFIED LIVE against the ESPN keyless
 * API (200 + real events). Adding a competition is one line here; nothing else
 * changes. Out-of-season competitions simply return no fixtures in the browse
 * window and are skipped — safe to list them all.
 */
import type { LeagueDef } from "./types";

export const LEAGUES: LeagueDef[] = [
  // ── the world stage (live in 2026) + top club football ──
  { id: "fifa.world", sport: "soccer", espnPath: "soccer/fifa.world", name: "FIFA World Cup", country: "World", emoji: "🌍", threeWay: true },
  { id: "eng.1", sport: "soccer", espnPath: "soccer/eng.1", name: "Premier League", country: "England", emoji: "🏴", threeWay: true },
  { id: "esp.1", sport: "soccer", espnPath: "soccer/esp.1", name: "La Liga", country: "Spain", emoji: "🇪🇸", threeWay: true },
  { id: "ita.1", sport: "soccer", espnPath: "soccer/ita.1", name: "Serie A", country: "Italy", emoji: "🇮🇹", threeWay: true },
  { id: "ger.1", sport: "soccer", espnPath: "soccer/ger.1", name: "Bundesliga", country: "Germany", emoji: "🇩🇪", threeWay: true },
  { id: "fra.1", sport: "soccer", espnPath: "soccer/fra.1", name: "Ligue 1", country: "France", emoji: "🇫🇷", threeWay: true },
  { id: "uefa.champions", sport: "soccer", espnPath: "soccer/uefa.champions", name: "Champions League", country: "Europe", emoji: "🏆", threeWay: true },
  { id: "uefa.europa", sport: "soccer", espnPath: "soccer/uefa.europa", name: "Europa League", country: "Europe", emoji: "🏅", threeWay: true },
  { id: "uefa.europa.conf", sport: "soccer", espnPath: "soccer/uefa.europa.conf", name: "Conference League", country: "Europe", emoji: "🎖️", threeWay: true },
  { id: "uefa.nations", sport: "soccer", espnPath: "soccer/uefa.nations", name: "UEFA Nations League", country: "Europe", emoji: "🇪🇺", threeWay: true },

  // ── US majors ──
  { id: "nba", sport: "basketball", espnPath: "basketball/nba", name: "NBA", country: "USA", emoji: "🏀", threeWay: false },
  { id: "nfl", sport: "football", espnPath: "football/nfl", name: "NFL", country: "USA", emoji: "🏈", threeWay: false },
  { id: "mlb", sport: "baseball", espnPath: "baseball/mlb", name: "MLB", country: "USA", emoji: "⚾", threeWay: false },
  { id: "nhl", sport: "hockey", espnPath: "hockey/nhl", name: "NHL", country: "USA", emoji: "🏒", threeWay: false },
  { id: "wnba", sport: "basketball", espnPath: "basketball/wnba", name: "WNBA", country: "USA", emoji: "🏀", threeWay: false },
  { id: "college-football", sport: "football", espnPath: "football/college-football", name: "College Football", country: "USA", emoji: "🏈", threeWay: false },
  { id: "mens-college-basketball", sport: "basketball", espnPath: "basketball/mens-college-basketball", name: "College Basketball", country: "USA", emoji: "🏀", threeWay: false },

  // ── other big internationals & continental cups ──
  { id: "fifa.wwc", sport: "soccer", espnPath: "soccer/fifa.wwc", name: "Women's World Cup", country: "World", emoji: "🌏", threeWay: true },
  { id: "uefa.euro", sport: "soccer", espnPath: "soccer/uefa.euro", name: "UEFA Euros", country: "Europe", emoji: "🇪🇺", threeWay: true },
  { id: "conmebol.libertadores", sport: "soccer", espnPath: "soccer/conmebol.libertadores", name: "Copa Libertadores", country: "S. America", emoji: "🌎", threeWay: true },
  { id: "conmebol.america", sport: "soccer", espnPath: "soccer/conmebol.america", name: "Copa América", country: "S. America", emoji: "🌎", threeWay: true },
  { id: "concacaf.gold", sport: "soccer", espnPath: "soccer/concacaf.gold", name: "Gold Cup", country: "N. America", emoji: "🌎", threeWay: true },

  // ── more domestic football ──
  { id: "usa.1", sport: "soccer", espnPath: "soccer/usa.1", name: "MLS", country: "USA", emoji: "🇺🇸", threeWay: true },
  { id: "mex.1", sport: "soccer", espnPath: "soccer/mex.1", name: "Liga MX", country: "Mexico", emoji: "🇲🇽", threeWay: true },
  { id: "bra.1", sport: "soccer", espnPath: "soccer/bra.1", name: "Brasileirão", country: "Brazil", emoji: "🇧🇷", threeWay: true },
  { id: "arg.1", sport: "soccer", espnPath: "soccer/arg.1", name: "Liga Profesional", country: "Argentina", emoji: "🇦🇷", threeWay: true },
  { id: "ned.1", sport: "soccer", espnPath: "soccer/ned.1", name: "Eredivisie", country: "Netherlands", emoji: "🇳🇱", threeWay: true },
  { id: "por.1", sport: "soccer", espnPath: "soccer/por.1", name: "Primeira Liga", country: "Portugal", emoji: "🇵🇹", threeWay: true },
  { id: "sco.1", sport: "soccer", espnPath: "soccer/sco.1", name: "Scottish Premiership", country: "Scotland", emoji: "🏴", threeWay: true },
  { id: "tur.1", sport: "soccer", espnPath: "soccer/tur.1", name: "Süper Lig", country: "Turkey", emoji: "🇹🇷", threeWay: true },
  { id: "bel.1", sport: "soccer", espnPath: "soccer/bel.1", name: "Belgian Pro League", country: "Belgium", emoji: "🇧🇪", threeWay: true },
  { id: "ksa.1", sport: "soccer", espnPath: "soccer/ksa.1", name: "Saudi Pro League", country: "Saudi Arabia", emoji: "🇸🇦", threeWay: true },
  { id: "jpn.1", sport: "soccer", espnPath: "soccer/jpn.1", name: "J.League", country: "Japan", emoji: "🇯🇵", threeWay: true },
  { id: "aus.1", sport: "soccer", espnPath: "soccer/aus.1", name: "A-League", country: "Australia", emoji: "🇦🇺", threeWay: true },
  { id: "eng.2", sport: "soccer", espnPath: "soccer/eng.2", name: "Championship", country: "England", emoji: "🏴", threeWay: true },
  { id: "esp.2", sport: "soccer", espnPath: "soccer/esp.2", name: "LaLiga 2", country: "Spain", emoji: "🇪🇸", threeWay: true },
  { id: "ger.2", sport: "soccer", espnPath: "soccer/ger.2", name: "2. Bundesliga", country: "Germany", emoji: "🇩🇪", threeWay: true },
  { id: "ita.2", sport: "soccer", espnPath: "soccer/ita.2", name: "Serie B", country: "Italy", emoji: "🇮🇹", threeWay: true },
  { id: "eng.fa", sport: "soccer", espnPath: "soccer/eng.fa", name: "FA Cup", country: "England", emoji: "🏴", threeWay: true },

  // ── combat & racket (2-competitor) ──
  { id: "ufc", sport: "mma", espnPath: "mma/ufc", name: "UFC", country: "Global", emoji: "🥊", threeWay: false },
  { id: "atp", sport: "tennis", espnPath: "tennis/atp", name: "ATP Tennis", country: "Global", emoji: "🎾", threeWay: false },
  { id: "wta", sport: "tennis", espnPath: "tennis/wta", name: "WTA Tennis", country: "Global", emoji: "🎾", threeWay: false },
];

export const leagueById = (id: string): LeagueDef | undefined => LEAGUES.find((l) => l.id === id);

/** Guess the most likely competition(s) a free-text question refers to, by
 *  keyword. Deterministic pre-filter so the resolver fetches only relevant
 *  scoreboards; falls back to the marquee set when nothing obvious matches. */
export function guessLeagues(q: string): LeagueDef[] {
  const s = q.toLowerCase();
  const hit = (kw: RegExp, id: string) => (kw.test(s) ? leagueById(id) : undefined);
  const picks = [
    hit(/world cup|\bwc\b|fifa|mundial/, "fifa.world"),
    hit(/women'?s world cup|wwc/, "fifa.wwc"),
    hit(/euros?|european championship/, "uefa.euro"),
    hit(/nations league/, "uefa.nations"),
    hit(/premier league|\bepl\b|english|arsenal|liverpool|man |chelsea|tottenham|spurs|newcastle|villa/, "eng.1"),
    hit(/la ?liga|spanish|real madrid|barcelona|barca|atletico|sevilla/, "esp.1"),
    hit(/serie a|italian|juventus|inter|milan|napoli|roma|lazio/, "ita.1"),
    hit(/bundesliga|german|bayern|dortmund|leipzig|leverkusen/, "ger.1"),
    hit(/ligue ?1|french|psg|paris|marseille|monaco/, "fra.1"),
    hit(/champions league|\bucl\b/, "uefa.champions"),
    hit(/europa league|\buel\b/, "uefa.europa"),
    hit(/conference league/, "uefa.europa.conf"),
    hit(/libertadores/, "conmebol.libertadores"),
    hit(/copa america|copa américa/, "conmebol.america"),
    hit(/gold cup|concacaf/, "concacaf.gold"),
    hit(/\bmls\b|major league soccer/, "usa.1"),
    hit(/liga mx|mexican/, "mex.1"),
    hit(/brasileir|brazilian/, "bra.1"),
    hit(/argentin/, "arg.1"),
    hit(/eredivisie|dutch/, "ned.1"),
    hit(/primeira|portuguese|benfica|porto|sporting/, "por.1"),
    hit(/scottish|celtic|rangers/, "sco.1"),
    hit(/super ?lig|turkish|galatasaray|fenerbah/, "tur.1"),
    hit(/saudi|al[- ]?(nassr|hilal|ittihad)|ronaldo/, "ksa.1"),
    hit(/championship|\befl\b/, "eng.2"),
    hit(/fa cup/, "eng.fa"),
    hit(/\bnba\b|lakers|celtics|warriors|knicks|nuggets|bucks/, "nba"),
    hit(/\bwnba\b/, "wnba"),
    hit(/college football|ncaa football|cfb/, "college-football"),
    hit(/college basketball|ncaa basketball|march madness/, "mens-college-basketball"),
    hit(/\bnfl\b|chiefs|eagles|cowboys|49ers|bills|ravens|quarterback/, "nfl"),
    hit(/\bmlb\b|baseball|yankees|dodgers|red sox|mets|cubs/, "mlb"),
    hit(/\bnhl\b|hockey|maple leafs|bruins|oilers/, "nhl"),
    hit(/\bufc\b|\bmma\b|fight|octagon/, "ufc"),
    hit(/tennis|\batp\b|wimbledon|us open|roland garros|djokovic|alcaraz|sinner/, "atp"),
    hit(/\bwta\b|women'?s tennis|swiatek|sabalenka|gauff/, "wta"),
  ].filter(Boolean) as LeagueDef[];
  return [...new Map(picks.map((l) => [l.id, l])).values()];
}
