/**
 * Prediction engine — turns a natural-language question into an evidence-based
 * report. Flow: resolve the real fixture → gather standings, H2H, injuries and
 * live market odds (ESPN) + live news (Tavily) → run the statistical model →
 * blend with the de-vigged market → build value selections → let Opus interpret
 * → assemble a PredictionReport. Every number traces to a provider; the AI never
 * invents. "No bet" is a first-class outcome.
 */
import { webSearch, hasSearch } from "@/lib/data/search";
import type { Evidence, Fixture, LeagueDef, MarketOdds, PredictionReport, Selection } from "./types";
import { RG_DISCLAIMER } from "./types";
import { guessLeagues, LEAGUES, leagueById } from "./leagues";
import { fetchFixtures, fetchStandings, fetchMatchDetail, type StandingRow, type MatchDetail } from "./data";
import { poissonModel, blendWithMarket, buildSelections, decideStance, bestChancePick, recordProbabilities } from "./model";
import { reasonOverPrediction } from "./ai";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Score how strongly a fixture is referenced by the question (team-name match). */
function fixtureScore(q: string, f: Fixture): number {
  const nq = " " + norm(q) + " ";
  let score = 0;
  for (const t of [f.home, f.away]) {
    const cands = [t.name, t.shortName, t.abbrev].filter(Boolean).map((x) => norm(x!));
    // match on any distinctive token (len ≥ 4) or the short name
    for (const c of cands) {
      if (c.length >= 3 && nq.includes(" " + c + " ")) { score += 2; break; }
      const tokens = c.split(" ").filter((w) => w.length >= 4);
      if (tokens.some((w) => nq.includes(" " + w + " "))) { score += 1; break; }
    }
  }
  return score;
}

const yyyymmdd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

/** Find the fixture the question is about across candidate leagues. */
async function resolveFixture(question: string, now: Date): Promise<{ fixture: Fixture; league: LeagueDef; odds?: import("./types").MarketOdds } | null> {
  const candidates = guessLeagues(question);
  const leagues = candidates.length ? candidates : LEAGUES.slice(0, 8);
  // widen the window a bit so "next match" style questions resolve
  const from = new Date(now.getTime() - 2 * 864e5);
  const to = new Date(now.getTime() + 14 * 864e5);
  const range = `${yyyymmdd(from)}-${yyyymmdd(to)}`;
  let best: { fixture: Fixture; league: LeagueDef; odds?: import("./types").MarketOdds; score: number } | null = null;
  for (const league of leagues) {
    try {
      const { fixtures, oddsById } = await fetchFixtures(league.id, range);
      for (const f of fixtures) {
        const score = fixtureScore(question, f);
        if (score > 0 && (!best || score > best.score || (score === best.score && Date.parse(f.startsAt) < Date.parse(best.fixture.startsAt)))) {
          best = { fixture: f, league, odds: oddsById[f.id], score };
        }
      }
    } catch {
      /* league fetch failed — skip, try the next */
    }
    if (best && best.score >= 4) break; // both teams matched — good enough
  }
  return best ? { fixture: best.fixture, league: best.league, odds: best.odds } : null;
}

function buildEvidence(f: Fixture, table: StandingRow[], detail: MatchDetail, researchAnswer?: string): Evidence[] {
  const ev: Evidence[] = [];
  const row = (id: string) => table.find((r) => r.team.id === id);
  const hr = row(f.home.id), ar = row(f.away.id);
  if (hr?.rank && ar?.rank) ev.push({ kind: "stat", text: `League position: ${f.home.name} ${hr.rank}${hr.points != null ? ` (${hr.points} pts)` : ""} vs ${f.away.name} ${ar.rank}${ar.points != null ? ` (${ar.points} pts)` : ""}.`, source: "ESPN standings", weight: "medium" });
  if (hr?.goalsFor != null && hr.gamesPlayed) ev.push({ kind: "stat", text: `${f.home.name}: ${(hr.goalsFor / hr.gamesPlayed).toFixed(2)} scored / ${((hr.goalsAgainst ?? 0) / hr.gamesPlayed).toFixed(2)} conceded per game.`, source: "ESPN", weight: "high" });
  if (ar?.goalsFor != null && ar.gamesPlayed) ev.push({ kind: "stat", text: `${f.away.name}: ${(ar.goalsFor / ar.gamesPlayed).toFixed(2)} scored / ${((ar.goalsAgainst ?? 0) / ar.gamesPlayed).toFixed(2)} conceded per game.`, source: "ESPN", weight: "high" });
  if (f.home.form) ev.push({ kind: "form", text: `${f.home.name} recent form: ${f.home.form}.`, source: "ESPN", weight: "medium" });
  if (f.away.form) ev.push({ kind: "form", text: `${f.away.name} recent form: ${f.away.form}.`, source: "ESPN", weight: "medium" });
  for (const g of detail.h2h.slice(0, 4)) if (g.homeScore != null && g.awayScore != null) ev.push({ kind: "h2h", text: `H2H: ${g.homeName ?? "?"} ${g.homeScore}-${g.awayScore} ${g.awayName ?? "?"}${g.date ? ` (${g.date.slice(0, 10)})` : ""}.`, source: "ESPN", weight: "low" });
  for (const inj of detail.injuries.slice(0, 6)) ev.push({ kind: "injury", text: `${inj.team === "home" ? f.home.name : f.away.name}: ${inj.player} — ${inj.status}${inj.detail ? ` (${inj.detail})` : ""}.`, source: "ESPN", weight: "high" });
  const od = detail.odds ?? undefined;
  if (od?.implied) ev.push({ kind: "market", text: `Market (de-vigged): home ${((od.implied.home ?? 0) * 100).toFixed(0)}%${od.implied.draw != null ? `, draw ${((od.implied.draw) * 100).toFixed(0)}%` : ""}, away ${((od.implied.away ?? 0) * 100).toFixed(0)}%.`, source: od.provider || "bookmaker", weight: "high" });
  if (researchAnswer) ev.push({ kind: "news", text: researchAnswer.slice(0, 400), source: "web research", weight: "medium" });
  return ev;
}

/** Analyse ONE resolved fixture into a full report. `light` (bulk mode) skips the
 *  web research + AI overlay + match-detail fetch for speed/cost; `table` lets a
 *  caller preload standings once per league. */
export async function analyzeFixture(f: Fixture, league: LeagueDef, sbOdds: MarketOdds | undefined, question: string, now: Date, opts: { light?: boolean; table?: StandingRow[] } = {}): Promise<PredictionReport> {
  const light = !!opts.light;
  const [table, detail, research] = await Promise.all([
    opts.table ? Promise.resolve(opts.table) : fetchStandings(league.id).catch(() => [] as StandingRow[]),
    light ? Promise.resolve({ h2h: [], injuries: [] } as MatchDetail) : fetchMatchDetail(league.id, f.id).catch(() => ({ h2h: [], injuries: [] } as MatchDetail)),
    !light && hasSearch() ? webSearch(`${f.home.name} vs ${f.away.name} ${league.name} team news injuries lineup preview`, { depth: "advanced", maxResults: 6 }).catch(() => null) : Promise.resolve(null),
  ]);
  const odds = detail.odds ?? sbOdds; // /summary pickcenter preferred, else scoreboard

  const hr = table.find((r) => r.team.id === f.home.id);
  const ar = table.find((r) => r.team.id === f.away.id);
  const model = league.sport === "soccer" && hr && ar ? poissonModel({ home: hr, away: ar, table }) : null;
  // soccer Poisson > de-vigged market > season-record prior (so non-soccer games
  // without a posted book line still get a real, data-based pick — never fabricated)
  const prob = blendWithMarket(model, odds?.implied, odds?.implied ? 0.5 : 0) ?? recordProbabilities(f.home.record, f.away.record);
  const selections: Selection[] = prob ? buildSelections(prob, odds, league.threeWay, f.home.name, f.away.name) : [];
  const stance = decideStance(selections, !!odds?.implied, model?.minGamesPlayed);
  const bestChance = bestChancePick(selections);

  const evidence = buildEvidence(f, table, detail, research?.answer);
  const fixtureLine = `${f.home.name} vs ${f.away.name}, ${league.name}, ${f.startsAt.slice(0, 10)}${f.venue ? `, ${f.venue}` : ""}`;
  const researchDigest = research?.results?.slice(0, 4).map((x) => `• ${x.title}: ${x.content.slice(0, 180)}`).join("\n");

  const ai = light ? null : await reasonOverPrediction({ question, fixtureLine, prob: prob ?? null, selections, evidence, research: researchDigest, stanceReason: stance.reason });

  let overallConf = Math.round((stance.top?.confidence ?? bestChance?.confidence ?? (prob ? 50 : 30)) + (ai?.confidenceDelta ?? 0));
  overallConf = Math.max(0, Math.min(100, overallConf));
  let finalStance = stance.stance;
  if (ai?.endorseNoBet && finalStance === "bet") finalStance = "lean";
  if (ai?.endorseNoBet && finalStance === "lean") finalStance = "no-bet";

  // lead with the PREDICTION, not "no bet / no value at the price" (misleading — we
  // always give a pick). Value/lean cases still show the actual bet + price + edge.
  const headline =
    finalStance === "no-bet"
      ? bestChance
        ? `Best chance: ${bestChance.pick} (${(bestChance.modelProb * 100).toFixed(0)}%)`
        : "Prediction based on the model — see the read below."
      : `${finalStance === "bet" ? "Value" : "Lean"}: ${stance.top?.pick}${stance.top?.bookOdds ? ` @ ${stance.top.bookOdds.toFixed(2)}` : ""}${stance.top?.edgePct != null ? ` (${stance.top.edgePct}% edge)` : ""}`;

  return {
    question,
    fixture: f,
    league,
    verdict: { stance: finalStance, headline, topSelection: finalStance !== "no-bet" ? stance.top : undefined, bestChance, confidence: overallConf },
    probabilities: prob ?? undefined,
    market: odds,
    selections,
    availability: detail.injuries,
    evidence,
    reasoning: ai?.reasoning || (model ? `Model: ${f.home.name} ${(prob!.home * 100).toFixed(0)}%${prob!.draw != null ? `, draw ${(prob!.draw * 100).toFixed(0)}%` : ""}, ${f.away.name} ${(prob!.away * 100).toFixed(0)}%.${bestChance ? ` Best chance to win: ${bestChance.pick} at ${(bestChance.modelProb * 100).toFixed(0)}%.` : ""} ${stance.reason}` : `Insufficient reliable data to model this fixture. ${stance.reason}`),
    risks: ai?.risks?.length ? ai.risks : ["Lineups and late team news can move these numbers — re-check near kickoff.", ...(model && model.minGamesPlayed < 6 ? ["Small season sample — strengths are still stabilising."] : [])],
    dataAsOf: now.toISOString(),
    disclaimer: RG_DISCLAIMER,
  };
}

export async function predict(question: string, now = new Date()): Promise<PredictionReport> {
  const resolved = await resolveFixture(question, now);
  if (!resolved) {
    const r = hasSearch() ? await webSearch(`${question} sports betting analysis prediction`, { depth: "advanced", maxResults: 6 }) : null;
    const rep: PredictionReport = { question, verdict: { stance: "no-bet", headline: "Couldn't pin this to a specific upcoming fixture in the covered leagues.", confidence: 0 }, selections: [], availability: [], evidence: [], reasoning: r?.answer || "I couldn't identify a specific match. Name both teams (e.g. \"Arsenal vs Chelsea\"), or ask for a whole competition (e.g. \"all remaining World Cup fixtures\").", risks: ["No verified fixture/odds resolved — general context only."], dataAsOf: now.toISOString(), disclaimer: RG_DISCLAIMER };
    if (r?.results?.length) rep.evidence = r.results.slice(0, 4).map((x) => ({ kind: "news" as const, text: `${x.title}: ${x.content.slice(0, 200)}`, source: x.url }));
    return rep;
  }
  return analyzeFixture(resolved.fixture, resolved.league, resolved.odds, question, now);
}

/** A broad request for MANY fixtures (a whole competition, "all remaining", a
 *  slate, or several explicit matchups) rather than one named match. */
export function isBulkPrompt(q: string): boolean {
  const s = q.toLowerCase();
  const scope = /\b(all|every|each|remaining|rest of|today'?s?|tonight'?s?|this (?:week|weekend)|upcoming|full|entire|whole|slate|card|matchday|game ?week|round of|fixtures|matches|games|schedule)\b/;
  const vsCount = (s.match(/\bvs\.?\b|\bversus\b/g) || []).length;
  return scope.test(s) || vsCount >= 2;
}

/** Resolve a broad prompt to a set of real upcoming fixtures (capped). */
export async function resolveBulkFixtures(prompt: string, now: Date, limit = 8): Promise<{ fixture: Fixture; league: LeagueDef; odds?: MarketOdds }[]> {
  const guessed = guessLeagues(prompt);
  const use = guessed.length ? guessed : LEAGUES.slice(0, 6);
  const from = new Date(now.getTime() - 1 * 864e5);
  const to = new Date(now.getTime() + 14 * 864e5);
  const range = `${yyyymmdd(from)}-${yyyymmdd(to)}`;
  const out: { fixture: Fixture; league: LeagueDef; odds?: MarketOdds }[] = [];
  for (const league of use) {
    try {
      const { fixtures, oddsById } = await fetchFixtures(league.id, range);
      for (const f of fixtures.filter((x) => x.status !== "final")) out.push({ fixture: f, league, odds: oddsById[f.id] });
    } catch {
      /* skip */
    }
    if (out.length >= limit) break;
  }
  out.sort((a, b) => Date.parse(a.fixture.startsAt) - Date.parse(b.fixture.startsAt));
  return out.slice(0, limit);
}

/** Analyse many fixtures for a broad prompt (fast/light per match). */
export async function predictMany(prompt: string, now = new Date(), limit = 8): Promise<PredictionReport[]> {
  const resolved = await resolveBulkFixtures(prompt, now, limit);
  const tables = new Map<string, StandingRow[]>();
  const reports: PredictionReport[] = [];
  for (const r of resolved) {
    let table = tables.get(r.league.id);
    if (!table) { table = await fetchStandings(r.league.id).catch(() => [] as StandingRow[]); tables.set(r.league.id, table); }
    reports.push(await analyzeFixture(r.fixture, r.league, r.odds, `${r.fixture.home.name} vs ${r.fixture.away.name}`, now, { light: true, table }));
  }
  return reports;
}

/** Today's slate — the top N upcoming predictions, prioritising the most-watched
 *  competitions. LEAGUES is already ordered by profile (World Cup → Premier League →
 *  La Liga → … → US majors → other), and Promise.all preserves that order, so we fill
 *  from the biggest competitions first and only fall back to lesser ones to reach the
 *  count. Real matches only (no TBD/placeholder). Light per-match (ESPN only — no Opus
 *  /Tavily) so a 10-match slate stays affordable. */
export async function dailyPredictions(now = new Date(), limit = 10): Promise<PredictionReport[]> {
  const from = new Date(now.getTime() - 0.5 * 864e5);
  const to = new Date(now.getTime() + 10 * 864e5);
  const range = `${yyyymmdd(from)}-${yyyymmdd(to)}`;
  const perLeague = await Promise.all(
    LEAGUES.map((league) =>
      fetchFixtures(league.id, range)
        .then(({ fixtures, oddsById }) => ({ league, fixtures, oddsById }))
        .catch(() => ({ league, fixtures: [] as Fixture[], oddsById: {} as Record<string, MarketOdds> })),
    ),
  );
  // exclude bracket placeholders (no real teams yet) — "Semifinal 1 Loser",
  // "Quarterfinal 3 Winner", "Round of 16 Winner", "TBD", …
  const PLACEHOLDER = /\b(winners?|losers?|tbd|bye|runner|semi[\s-]?finals?|quarter[\s-]?finals?|round of|third[\s-]?place|play[\s-]?offs?|to be determined)\b/i;
  const real = (f: Fixture) => !!f.home?.name && !!f.away?.name && f.status !== "final" && !PLACEHOLDER.test(`${f.home.name} ${f.away.name}`);
  const cand = Math.min(24, Math.ceil(limit * 1.8)); // over-pick, then keep the ones that actually model
  const picked: { fixture: Fixture; league: LeagueDef; odds?: MarketOdds }[] = [];
  for (const { league, fixtures, oddsById } of perLeague) {
    if (picked.length >= cand) break;
    const upcoming = fixtures.filter(real).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    for (const f of upcoming) {
      picked.push({ fixture: f, league, odds: oddsById[f.id] });
      if (picked.length >= cand) break;
    }
  }
  const tables = new Map<string, StandingRow[]>();
  const reports: PredictionReport[] = [];
  for (const r of picked) {
    let table = tables.get(r.league.id);
    if (!table) { table = await fetchStandings(r.league.id).catch(() => [] as StandingRow[]); tables.set(r.league.id, table); }
    reports.push(await analyzeFixture(r.fixture, r.league, r.odds, `${r.fixture.home.name} vs ${r.fixture.away.name}`, now, { light: true, table }));
  }
  // keep only fixtures that produced a real prediction (a best-chance pick or model probs)
  return reports.filter((r) => !!r.verdict.bestChance || !!r.probabilities).slice(0, limit);
}

/** Upcoming fixtures across leagues for the browser (real scoreboard data). */
export async function upcomingFixtures(leagueId?: string, now = new Date()): Promise<{ league: LeagueDef; fixtures: Fixture[]; oddsById: Record<string, import("./types").MarketOdds> }[]> {
  const leagues = leagueId ? [leagueById(leagueId)].filter(Boolean) as LeagueDef[] : LEAGUES;
  const from = new Date(now.getTime() - 1 * 864e5);
  const to = new Date(now.getTime() + 10 * 864e5);
  const range = `${yyyymmdd(from)}-${yyyymmdd(to)}`;
  const out: { league: LeagueDef; fixtures: Fixture[]; oddsById: Record<string, import("./types").MarketOdds> }[] = [];
  await Promise.all(
    leagues.map(async (league) => {
      try {
        const { fixtures, oddsById } = await fetchFixtures(league.id, range);
        if (fixtures.length) out.push({ league, fixtures: fixtures.slice(0, 12), oddsById });
      } catch {
        /* skip a league that fails */
      }
    })
  );
  out.sort((a, b) => LEAGUES.indexOf(a.league) - LEAGUES.indexOf(b.league));
  return out;
}
