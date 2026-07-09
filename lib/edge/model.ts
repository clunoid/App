/**
 * The quantitative core — explainable, real-data probability models. No AI here;
 * the AI layer (ai.ts) only INTERPRETS what this produces. Everything derives
 * from provider numbers (standings goals, market odds); nothing is invented.
 *
 * Football: a double-Poisson goals model with attack/defence strengths estimated
 * from season goals-for/against (Maher/Dixon-Coles inputs), reading 1X2 / over-
 * under / BTTS off the joint scoreline grid. The de-vigged market line is the
 * strongest single baseline, so the reported probabilities BLEND model + market
 * (market-weighted when present). Value is the gap between our probability and
 * the fair (de-vigged) market probability; stakes use fractional Kelly.
 */
import type { MarketOdds, ModelProbabilities, Selection } from "./types";
import type { StandingRow } from "./data";

/* ── Poisson helpers ──────────────────────────────────────────────────────── */
function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

const MAX_GOALS = 10;

/** Estimate attack/defence strength for one team from its season goals, relative
 *  to the league average goals-per-game. Shrinks small samples toward 1.0. */
function strengths(row: StandingRow, leagueAvgGpg: number): { attack: number; defence: number; gp: number } | null {
  const gp = row.gamesPlayed ?? ((row.wins ?? 0) + (row.draws ?? 0) + (row.losses ?? 0));
  if (!gp || row.goalsFor == null || row.goalsAgainst == null || leagueAvgGpg <= 0) return null;
  const gfpg = row.goalsFor / gp;
  const gapg = row.goalsAgainst / gp;
  // shrink toward the league mean when the sample is thin (Bayesian-ish prior)
  const w = gp / (gp + 6); // 6 "prior" games at league average
  const attack = w * (gfpg / leagueAvgGpg) + (1 - w) * 1;
  const defence = w * (gapg / leagueAvgGpg) + (1 - w) * 1;
  return { attack: Math.max(0.2, attack), defence: Math.max(0.2, defence), gp };
}

export type PoissonInput = { home: StandingRow; away: StandingRow; table: StandingRow[] };

/** Full scoreline model for a soccer fixture. Returns null if goals data is thin. */
export function poissonModel(inp: PoissonInput): (ModelProbabilities & { minGamesPlayed: number }) | null {
  const played = inp.table.filter((r) => (r.gamesPlayed ?? 0) > 0 && r.goalsFor != null);
  if (played.length < 4) return null;
  const totalGf = played.reduce((a, r) => a + (r.goalsFor ?? 0), 0);
  const totalGp = played.reduce((a, r) => a + (r.gamesPlayed ?? 0), 0);
  if (totalGp <= 0) return null;
  const leagueAvgGpg = totalGf / totalGp; // avg goals scored per team per game
  const HOME_ADV = 1.12; // ~home teams score ~12% more (kept modest, league-generic)

  const h = strengths(inp.home, leagueAvgGpg);
  const a = strengths(inp.away, leagueAvgGpg);
  if (!h || !a) return null;

  const lambdaHome = leagueAvgGpg * h.attack * a.defence * HOME_ADV;
  const lambdaAway = leagueAvgGpg * a.attack * h.defence / HOME_ADV;

  // joint scoreline grid
  let pHome = 0, pDraw = 0, pAway = 0, pO15 = 0, pO25 = 0, pO35 = 0, pBtts = 0;
  const homePmf = Array.from({ length: MAX_GOALS + 1 }, (_, i) => poissonPmf(i, lambdaHome));
  const awayPmf = Array.from({ length: MAX_GOALS + 1 }, (_, i) => poissonPmf(i, lambdaAway));
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = homePmf[i] * awayPmf[j];
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i + j > 1.5) pO15 += p;
      if (i + j > 2.5) pO25 += p;
      if (i + j > 3.5) pO35 += p;
      if (i >= 1 && j >= 1) pBtts += p;
    }
  }
  const norm = pHome + pDraw + pAway || 1;
  return {
    home: pHome / norm,
    draw: pDraw / norm,
    away: pAway / norm,
    expHome: Number(lambdaHome.toFixed(2)),
    expAway: Number(lambdaAway.toFixed(2)),
    over15: pO15 / norm,
    overProb: pO25 / norm,
    over35: pO35 / norm,
    bttsProb: pBtts / norm,
    method: "double-poisson (attack/defence from season goals)",
    minGamesPlayed: Math.min(h.gp, a.gp),
  };
}

/** Blend model with the de-vigged market (market is a hard-to-beat baseline). */
export function blendWithMarket(model: ModelProbabilities | null, implied: MarketOdds["implied"] | undefined, marketWeight = 0.5): ModelProbabilities | null {
  if (!model && !implied) return null;
  if (!model) return { home: implied!.home ?? 0, draw: implied!.draw, away: implied!.away ?? 0, method: "market-implied (de-vigged)" };
  if (!implied || implied.home == null || implied.away == null) return model;
  const w = marketWeight;
  const home = (1 - w) * model.home + w * (implied.home ?? 0);
  const away = (1 - w) * model.away + w * (implied.away ?? 0);
  const draw = model.draw != null && implied.draw != null ? (1 - w) * model.draw + w * implied.draw : model.draw;
  const s = home + (draw ?? 0) + away || 1;
  return { ...model, home: home / s, draw: draw != null ? draw / s : undefined, away: away / s, method: `${model.method} + market blend` };
}

/** A light record-based prior for fixtures with no goals model AND no market — e.g.
 *  an NBA/NFL/MLB game whose book line isn't posted yet. Uses the two teams' real
 *  season W–L records + a small home edge. Real data, explainable, honestly labelled;
 *  only a last-resort so every real fixture still gets a prediction (never fabricated
 *  — returns null when the records aren't parseable). */
export function recordProbabilities(homeRecord?: string, awayRecord?: string): ModelProbabilities | null {
  const winRate = (rec?: string): number | null => {
    if (!rec) return null;
    const p = rec.split("-").map((n) => parseInt(n.trim(), 10));
    if (p.length < 2 || p.some((n) => Number.isNaN(n))) return null;
    const w = p[0], l = p[p.length - 1]; // "W-L" or "W-D-L" (draws ignored)
    return w + l > 0 ? w / (w + l) : null;
  };
  const hw = winRate(homeRecord), aw = winRate(awayRecord);
  if (hw == null || aw == null) return null;
  const HOME_EDGE = 0.06;
  const hs = Math.min(0.95, hw + HOME_EDGE), as = Math.max(0.05, aw);
  const home = Math.max(0.12, Math.min(0.88, hs / (hs + as)));
  return { home, away: 1 - home, method: "record-based (season W–L + home edge)" };
}

/* ── value / edge / staking ───────────────────────────────────────────────── */
const KELLY_FRACTION = 0.25; // quarter-Kelly — deliberately conservative
const EDGE_THRESHOLD = 0.04; // model must beat fair line by ≥4 pts to flag value

/** Build ranked selections across ALL the everyday markets (not just who-wins:
 *  double chance, draw-no-bet, totals at 1.5/2.5/3.5, BTTS), flagging real edges
 *  where a market price exists. Giving the full menu is what lets the desk offer
 *  the *best chance to win*, which is often a safer market than the outright. */
export function buildSelections(prob: ModelProbabilities, odds: MarketOdds | undefined, threeWay: boolean, homeName: string, awayName: string): Selection[] {
  const out: Selection[] = [];
  const consider = (market: string, pick: string, category: Selection["category"], modelProb: number, bookOdds?: number, impliedProb?: number) => {
    if (!(modelProb > 0.02) || modelProb > 0.995) return;
    const fairOdds = 1 / modelProb;
    const sel: Selection = { market, pick, category, modelProb, impliedProb, fairOdds: Number(fairOdds.toFixed(2)), bookOdds, confidence: 0 };
    if (bookOdds && bookOdds > 1) {
      const edge = modelProb * bookOdds - 1; // EV per unit
      sel.edgePct = Number((edge * 100).toFixed(1));
      const b = bookOdds - 1;
      const kelly = (b * modelProb - (1 - modelProb)) / b;
      sel.kellyFraction = kelly > 0 ? Number((kelly * KELLY_FRACTION).toFixed(3)) : 0;
    }
    const edgeVsFair = impliedProb != null ? modelProb - impliedProb : 0;
    sel.confidence = Math.max(0, Math.min(100, Math.round(45 + modelProb * 45 + edgeVsFair * 120)));
    out.push(sel);
  };
  const h = prob.home, d = prob.draw ?? 0, a = prob.away;
  // 1) outright
  consider("Match result", `${homeName} win`, "result", h, odds?.homeWin, odds?.implied?.home);
  if (threeWay) consider("Match result", "Draw", "result", d, odds?.draw, odds?.implied?.draw);
  consider("Match result", `${awayName} win`, "result", a, odds?.awayWin, odds?.implied?.away);
  // 2) double chance + draw-no-bet (the safer ways to back a side) — soccer
  if (threeWay) {
    consider("Double chance", `${homeName} or draw`, "double-chance", h + d);
    consider("Double chance", `${awayName} or draw`, "double-chance", a + d);
    consider("Double chance", `${homeName} or ${awayName}`, "double-chance", h + a);
    if (h + a > 0) {
      consider("Draw no bet", `${homeName} (DNB)`, "dnb", h / (h + a));
      consider("Draw no bet", `${awayName} (DNB)`, "dnb", a / (h + a));
    }
  }
  // 3) totals
  if (prob.over15 != null) { consider("Total goals", "Over 1.5", "totals", prob.over15); consider("Total goals", "Under 1.5", "totals", 1 - prob.over15); }
  if (prob.overProb != null) { consider("Total goals", "Over 2.5", "totals", prob.overProb, undefined, odds?.overUnder != null ? undefined : undefined); consider("Total goals", "Under 2.5", "totals", 1 - prob.overProb); }
  if (prob.over35 != null) consider("Total goals", "Over 3.5", "totals", prob.over35);
  // 4) BTTS
  if (prob.bttsProb != null) { consider("Both teams to score", "Yes", "btts", prob.bttsProb); consider("Both teams to score", "No", "btts", 1 - prob.bttsProb); }
  // rank by edge (value) when odds exist, else by model probability
  out.sort((x, y) => (y.edgePct ?? -999) - (x.edgePct ?? -999) || y.modelProb - x.modelProb);
  return out;
}

/** The highest-probability SENSIBLE selection — the best CHANCE to win (often a
 *  double chance / DNB / over-1.5, not the outright). Trivial near-certainties
 *  (>90%) are excluded so the pick stays a real bet. */
export function bestChancePick(selections: Selection[]): Selection | undefined {
  const eligible = selections.filter((s) => s.modelProb >= 0.5 && s.modelProb <= 0.9);
  const pool = eligible.length ? eligible : selections;
  return [...pool].sort((x, y) => y.modelProb - x.modelProb)[0];
}

/** Decide the overall stance. No-bet is a first-class outcome. */
export function decideStance(selections: Selection[], hasMarket: boolean, minGamesPlayed: number | undefined): { stance: "bet" | "lean" | "no-bet"; top?: Selection; reason: string } {
  const withOdds = selections.filter((s) => s.edgePct != null);
  const best = withOdds[0];
  // insufficient data → never bet
  if (minGamesPlayed != null && minGamesPlayed < 5) return { stance: "no-bet", reason: "Too few games played this season to estimate strengths reliably." };
  if (!hasMarket || !best) return { stance: "no-bet", top: selections[0], reason: "No live market price available to measure value against — analysis only." };
  if (best.edgePct != null && best.edgePct >= EDGE_THRESHOLD * 100 && (best.confidence ?? 0) >= 58) return { stance: "bet", top: best, reason: `Model shows a ${best.edgePct}% edge over the fair line.` };
  if (best.edgePct != null && best.edgePct >= 1.5) return { stance: "lean", top: best, reason: `A small ${best.edgePct}% edge — a lean, not a strong bet.` };
  return { stance: "no-bet", top: best, reason: "No selection clears the fair line by enough to justify a bet — the market looks efficient here." };
}
