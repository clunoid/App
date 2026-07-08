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
  let pHome = 0, pDraw = 0, pAway = 0, pOver = 0, pBtts = 0;
  const homePmf = Array.from({ length: MAX_GOALS + 1 }, (_, i) => poissonPmf(i, lambdaHome));
  const awayPmf = Array.from({ length: MAX_GOALS + 1 }, (_, i) => poissonPmf(i, lambdaAway));
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = homePmf[i] * awayPmf[j];
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i + j > 2.5) pOver += p;
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
    overProb: pOver / norm,
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

/* ── value / edge / staking ───────────────────────────────────────────────── */
const KELLY_FRACTION = 0.25; // quarter-Kelly — deliberately conservative
const EDGE_THRESHOLD = 0.04; // model must beat fair line by ≥4 pts to flag value

/** Build ranked selections for the standard markets, flagging only real edges. */
export function buildSelections(prob: ModelProbabilities, odds: MarketOdds | undefined, threeWay: boolean, homeName: string, awayName: string): Selection[] {
  const out: Selection[] = [];
  const consider = (market: string, pick: string, modelProb: number, bookOdds?: number, impliedProb?: number) => {
    if (!(modelProb > 0)) return;
    const fairOdds = 1 / modelProb;
    const sel: Selection = { market, pick, modelProb, impliedProb, fairOdds: Number(fairOdds.toFixed(2)), bookOdds, confidence: 0 };
    if (bookOdds && bookOdds > 1) {
      const edge = modelProb * bookOdds - 1; // EV per unit
      sel.edgePct = Number((edge * 100).toFixed(1));
      const b = bookOdds - 1;
      const kelly = (b * modelProb - (1 - modelProb)) / b;
      sel.kellyFraction = kelly > 0 ? Number((kelly * KELLY_FRACTION).toFixed(3)) : 0;
    }
    // confidence: how far model clears the fair line + sample credibility proxy
    const edgeVsFair = impliedProb != null ? modelProb - impliedProb : 0;
    sel.confidence = Math.max(0, Math.min(100, Math.round(45 + modelProb * 45 + edgeVsFair * 120)));
    out.push(sel);
  };
  consider("Match result", `${homeName} win`, prob.home, odds?.homeWin, odds?.implied?.home);
  if (threeWay) consider("Match result", "Draw", prob.draw ?? 0, odds?.draw, odds?.implied?.draw);
  consider("Match result", `${awayName} win`, prob.away, odds?.awayWin, odds?.implied?.away);
  if (prob.overProb != null) consider("Total goals", "Over 2.5", prob.overProb);
  if (prob.bttsProb != null) consider("Both teams to score", "Yes", prob.bttsProb);
  // rank by edge (value) when odds exist, else by model probability
  out.sort((x, y) => (y.edgePct ?? -999) - (x.edgePct ?? -999) || y.modelProb - x.modelProb);
  return out;
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
