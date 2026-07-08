/**
 * Sports data adapters — REAL DATA ONLY, mirroring lib/trading/data.ts discipline
 * (unofficial-but-verified primary + strict parsing + a clean provider seam).
 *
 * Backbone: ESPN hidden API (keyless, verified live) — fixtures & scores, embedded
 * DraftKings odds, recent form, standings (NOTE: standings live on a DIFFERENT
 * host, site.web.api.espn.com, verified), and /summary (H2H, last-5, injuries,
 * per-book odds). TheSportsDB (free key 3) supplies cleaner badges/metadata.
 * Live team news / injuries / lineups come from Tavily (lib/data/search).
 *
 * All fetches are server-side. Nothing is interpolated: a missing field is left
 * undefined, never guessed.
 */
import type { Availability, Fixture, LeagueDef, MarketOdds, Team } from "./types";
import { leagueById } from "./leagues";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" };
const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_WEB = "https://site.web.api.espn.com/apis/v2/sports"; // standings host

async function getJson(url: string, tries = 2, timeoutMs = 12_000): Promise<unknown> {
  let lastErr: unknown;
  for (let a = 0; a < tries; a++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { headers: UA, signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status === 404 || res.status === 400) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 350 * (a + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/* ── American → decimal odds (ESPN moneyLine is American) ─────────────────── */
function americanToDecimal(ml: number | undefined | null): number | undefined {
  if (ml == null || !isFinite(ml) || ml === 0) return undefined;
  return ml > 0 ? 1 + ml / 100 : 1 + 100 / Math.abs(ml);
}

/* ── de-vig: raw implied probs (1/odds) normalised to sum 1 (multiplicative) ─ */
export function deVig(odds: { home?: number; draw?: number; away?: number }): MarketOdds["implied"] | undefined {
  const raw = { home: odds.home ? 1 / odds.home : undefined, draw: odds.draw ? 1 / odds.draw : undefined, away: odds.away ? 1 / odds.away : undefined };
  const sum = (raw.home ?? 0) + (raw.draw ?? 0) + (raw.away ?? 0);
  if (sum <= 0) return undefined;
  return {
    home: raw.home != null ? raw.home / sum : undefined,
    draw: raw.draw != null ? raw.draw / sum : undefined,
    away: raw.away != null ? raw.away / sum : undefined,
  };
}

// ESPN's payloads are deeply nested and loosely typed; we parse defensively and
// validate every field we extract, so a permissive shape here is intentional.
type J = any;

function num(x: unknown): number | undefined {
  const n = typeof x === "string" ? Number(x) : (x as number);
  return typeof n === "number" && isFinite(n) ? n : undefined;
}

function parseTeam(competitor: J): Team {
  const t = competitor?.team ?? {};
  const record = Array.isArray(competitor?.records) && competitor.records[0]?.summary ? String(competitor.records[0].summary) : undefined;
  return {
    id: String(t.id ?? competitor?.id ?? ""),
    name: String(t.displayName || t.name || t.shortDisplayName || "Unknown"),
    shortName: t.shortDisplayName || t.name || undefined,
    abbrev: t.abbreviation || undefined,
    logo: typeof t.logo === "string" ? t.logo : Array.isArray(t.logos) && t.logos[0]?.href ? t.logos[0].href : undefined,
    record,
    form: typeof competitor?.form === "string" ? competitor.form : undefined,
  };
}

function parseOdds(competition: J, league: LeagueDef): MarketOdds | undefined {
  const o = Array.isArray(competition?.odds) ? competition.odds[0] : undefined;
  if (!o) return undefined;
  const home = americanToDecimal(num(o.homeTeamOdds?.moneyLine));
  const away = americanToDecimal(num(o.awayTeamOdds?.moneyLine));
  const draw = league.threeWay ? americanToDecimal(num(o.drawOdds?.moneyLine)) : undefined;
  const odds: MarketOdds = {
    provider: o.provider?.name || undefined,
    homeWin: home,
    draw,
    awayWin: away,
    overUnder: num(o.overUnder),
    spread: num(o.spread),
  };
  if (home || away || draw) odds.implied = deVig({ home, draw, away });
  return odds.homeWin || odds.awayWin || odds.overUnder != null ? odds : undefined;
}

function statusOf(competition: J): Fixture["status"] {
  const n = competition?.status?.type?.name || "";
  if (/FINAL|FULL_TIME|FT/i.test(n)) return "final";
  if (/IN_PROGRESS|HALFTIME|STATUS_IN|LIVE|FIRST|SECOND/i.test(n)) return "in";
  return "scheduled";
}

/** Parse an ESPN scoreboard event into a Fixture (+ odds side-channel). */
function parseEvent(ev: J, league: LeagueDef): { fixture: Fixture; odds?: MarketOdds } | null {
  const comp = ev?.competitions?.[0];
  const cs = comp?.competitors;
  if (!comp || !Array.isArray(cs) || cs.length < 2) return null;
  const homeC = cs.find((c: J) => c.homeAway === "home") ?? cs[0];
  const awayC = cs.find((c: J) => c.homeAway === "away") ?? cs[1];
  const home = parseTeam(homeC);
  const away = parseTeam(awayC);
  if (!home.id || !away.id) return null;
  const st = statusOf(comp);
  return {
    fixture: {
      id: String(ev.id ?? comp.id ?? ""),
      league: league.id,
      sport: league.sport,
      startsAt: String(ev.date ?? comp.date ?? ""),
      status: st,
      home,
      away,
      venue: comp.venue?.fullName || undefined,
      homeScore: st !== "scheduled" ? num(homeC?.score) : undefined,
      awayScore: st !== "scheduled" ? num(awayC?.score) : undefined,
    },
    odds: parseOdds(comp, league),
  };
}

/** Scoreboard fixtures for a league (optionally a specific YYYYMMDD date or range). */
export async function fetchFixtures(leagueId: string, dates?: string): Promise<{ fixtures: Fixture[]; oddsById: Record<string, MarketOdds> }> {
  const league = leagueById(leagueId);
  if (!league) throw new Error(`unknown league ${leagueId}`);
  const url = `${ESPN}/${league.espnPath}/scoreboard${dates ? `?dates=${dates}` : ""}`;
  const j = (await getJson(url)) as J;
  const events = Array.isArray(j?.events) ? j.events : [];
  const fixtures: Fixture[] = [];
  const oddsById: Record<string, MarketOdds> = {};
  for (const ev of events) {
    const parsed = parseEvent(ev, league);
    if (!parsed) continue;
    fixtures.push(parsed.fixture);
    if (parsed.odds) oddsById[parsed.fixture.id] = parsed.odds;
  }
  fixtures.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { fixtures, oddsById };
}

/* ── standings (the site.web.api host — site.api returns empty) ───────────── */
export type StandingRow = {
  team: Team;
  rank?: number;
  gamesPlayed?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  points?: number;
};

function statVal(stats: J[], ...names: string[]): number | undefined {
  for (const n of names) {
    const s = stats.find((x) => x?.name === n || x?.type === n || x?.abbreviation === n);
    if (s) return num(s.value ?? s.displayValue);
  }
  return undefined;
}

/** Collect standings entries no matter how deeply ESPN nests them. */
function collectEntries(node: J, out: J[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.entries)) out.push(...node.entries);
  for (const k of ["children", "standings", "groups"]) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => collectEntries(c, out));
    else if (v && typeof v === "object") collectEntries(v, out);
  }
}

export async function fetchStandings(leagueId: string): Promise<StandingRow[]> {
  const league = leagueById(leagueId);
  if (!league) throw new Error(`unknown league ${leagueId}`);
  const j = (await getJson(`${ESPN_WEB}/${league.espnPath}/standings`)) as J;
  const entries: J[] = [];
  collectEntries(j, entries);
  const rows: StandingRow[] = [];
  for (const e of entries) {
    const t = e?.team;
    if (!t?.id) continue;
    const stats: J[] = Array.isArray(e.stats) ? e.stats : [];
    rows.push({
      team: {
        id: String(t.id),
        name: String(t.displayName || t.name || ""),
        shortName: t.shortDisplayName || undefined,
        abbrev: t.abbreviation || undefined,
        logo: typeof t.logos?.[0]?.href === "string" ? t.logos[0].href : typeof t.logo === "string" ? t.logo : undefined,
      },
      rank: statVal(stats, "rank"),
      gamesPlayed: statVal(stats, "gamesPlayed"),
      wins: statVal(stats, "wins"),
      draws: statVal(stats, "ties", "draws"),
      losses: statVal(stats, "losses"),
      goalsFor: statVal(stats, "pointsFor", "goalsFor"),
      goalsAgainst: statVal(stats, "pointsAgainst", "goalsAgainst"),
      points: statVal(stats, "points"),
    });
  }
  // de-dup by team id, keep first
  const seen = new Set<string>();
  const dedup = rows.filter((r) => (seen.has(r.team.id) ? false : (seen.add(r.team.id), true)));
  dedup.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return dedup;
}

/* ── match detail: H2H, recent form, injuries, per-book odds ──────────────── */
export type MatchDetail = {
  h2h: { date?: string; homeName?: string; awayName?: string; homeScore?: number; awayScore?: number }[];
  injuries: Availability[];
  odds?: MarketOdds;
};

export async function fetchMatchDetail(leagueId: string, eventId: string): Promise<MatchDetail> {
  const league = leagueById(leagueId);
  if (!league) throw new Error(`unknown league ${leagueId}`);
  let j: J = {};
  try {
    j = (await getJson(`${ESPN}/${league.espnPath}/summary?event=${encodeURIComponent(eventId)}`)) as J;
  } catch {
    return { h2h: [], injuries: [] };
  }
  const h2h: MatchDetail["h2h"] = [];
  const games = j?.headToHeadGames || j?.seasonseries || [];
  const flat = Array.isArray(games) ? games.flatMap((g: J) => (Array.isArray(g?.events) ? g.events : g)) : [];
  for (const g of flat.slice(0, 8)) {
    const cs = g?.competitors || g?.teams;
    if (Array.isArray(cs) && cs.length >= 2) {
      h2h.push({
        date: g.date || g.gameDate,
        homeName: cs[0]?.displayName || cs[0]?.team?.displayName,
        awayName: cs[1]?.displayName || cs[1]?.team?.displayName,
        homeScore: num(cs[0]?.score),
        awayScore: num(cs[1]?.score),
      });
    }
  }
  const injuries: Availability[] = [];
  const inj = Array.isArray(j?.injuries) ? j.injuries : [];
  for (const teamInj of inj) {
    const side: "home" | "away" = teamInj?.team?.homeAway === "away" ? "away" : "home";
    for (const it of teamInj?.injuries || []) {
      const name = it?.athlete?.displayName;
      if (name) injuries.push({ team: side, player: String(name), status: String(it?.status || it?.type?.name || "Out"), detail: it?.details?.type || undefined });
    }
  }
  // per-book odds (pickcenter) — prefer a consensus/first entry
  let odds: MarketOdds | undefined;
  const pick = Array.isArray(j?.pickcenter) ? j.pickcenter[0] : undefined;
  if (pick) {
    const home = americanToDecimal(num(pick.homeTeamOdds?.moneyLine));
    const away = americanToDecimal(num(pick.awayTeamOdds?.moneyLine));
    const draw = league.threeWay ? americanToDecimal(num(pick.drawOdds?.moneyLine)) : undefined;
    if (home || away) odds = { provider: pick.provider?.name, homeWin: home, awayWin: away, draw, overUnder: num(pick.overUnder), spread: num(pick.spread), implied: deVig({ home, draw, away }) };
  }
  return { h2h, injuries, odds };
}

/* ── TheSportsDB badge enrichment (cleaner logos) ─────────────────────────── */
export async function badgeFor(teamName: string): Promise<string | null> {
  try {
    const j = (await getJson(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`)) as J;
    const b = j?.teams?.[0]?.strBadge;
    return typeof b === "string" && b ? b : null;
  } catch {
    return null;
  }
}
