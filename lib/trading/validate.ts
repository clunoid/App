/**
 * Quantitative validation harness. The selection rule is fixed BEFORE any data
 * is seen (no metric shopping):
 *
 *   1. WALK-FORWARD: anchored rolling windows (train → pick params by train
 *      expectancy·√trades → evaluate untouched test window). Only the
 *      concatenated OUT-OF-SAMPLE trades count toward selection.
 *   2. MONTE CARLO: 5,000 seeded shuffles of the OOS trade sequence → drawdown
 *      and final-equity distributions (sequence-risk stress).
 *   3. NEIGHBORHOOD: every grid neighbor (one param step away) of the chosen
 *      params must mostly stay profitable — an isolated peak is overfit.
 *   4. REGIME: OOS R split by ATR-percentile terciles — a strategy that only
 *      works in one volatility regime is flagged.
 *
 * ROBUSTNESS GATES (all must pass to trade live):
 *   oosTrades ≥ 30 · oosPF ≥ 1.15 · oosExpectancy > 0 · ≥55% of windows
 *   non-negative · neighborhoodProfitable ≥ 0.5 · MC p95 drawdown ≤ 25R ·
 *   MC pProfit ≥ 0.8. Failing candidates are REPORTED but never traded.
 */
import type { Bar, Metrics, MonteCarlo, Pair, SimTrade, Timeframe, ValidationReport, WalkWindow } from "./types";
import { computeMetrics, simulate } from "./backtest";
import { atr, percentileRank } from "./indicators";
import { gridCombos, type StrategyDef } from "./strategies";

/** Deterministic RNG (mulberry32) so Monte Carlo results are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function monteCarlo(trades: SimTrade[], runs = 5000, seed = 42): MonteCarlo {
  const rs = trades.map((t) => t.r);
  if (!rs.length) return { runs, ddP50: 0, ddP95: 0, pProfit: 0, finalP5: 0 };
  const rand = rng(seed);
  const dds: number[] = [];
  const finals: number[] = [];
  let profitable = 0;
  for (let k = 0; k < runs; k++) {
    const shuffled = [...rs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let eq = 0;
    let peak = 0;
    let dd = 0;
    for (const r of shuffled) {
      eq += r;
      peak = Math.max(peak, eq);
      dd = Math.max(dd, peak - eq);
    }
    dds.push(dd);
    finals.push(eq);
    if (eq > 0) profitable++;
  }
  dds.sort((a, b) => a - b);
  finals.sort((a, b) => a - b);
  const pick = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  return {
    runs,
    ddP50: Number(pick(dds, 0.5).toFixed(2)),
    ddP95: Number(pick(dds, 0.95).toFixed(2)),
    pProfit: Number((profitable / runs).toFixed(3)),
    finalP5: Number(pick(finals, 0.05).toFixed(2)),
  };
}

/** Train-window scoring: expectancy scaled by √trades — prefers a real edge with
 *  evidence over a lucky handful of trades. Fixed a priori. */
const score = (m: Metrics) => (m.trades >= 8 ? m.expectancyR * Math.sqrt(m.trades) : -Infinity);

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type WalkForwardResult = {
  windows: WalkWindow[];
  oosTrades: SimTrade[];
  finalParams: Record<string, number>;
};

/** Anchored walk-forward: [trainBars] → test [testBars], stepping by testBars. */
export function walkForward(bars: Bar[], strat: StrategyDef, pair: Pair, tf: Timeframe, trainBars: number, testBars: number): WalkForwardResult {
  const combos = gridCombos(strat.grid);
  const windows: WalkWindow[] = [];
  const oosTrades: SimTrade[] = [];
  let finalParams = combos[0];
  for (let start = 0; start + trainBars + testBars <= bars.length; start += testBars) {
    const train = bars.slice(start, start + trainBars);
    // include train tail as warmup so test-window indicators are hot from bar 0,
    // but only count trades that ENTER inside the test window
    const testFrom = start + trainBars;
    // warmup must cover the longest look-back (VOL_WINDOW=400 ATR-percentile +
    // EMA200) so a test-window bar's regime gate is computed on the same history
    // it would have live — otherwise early test bars are gated differently.
    const warm = Math.min(450, trainBars);
    const testSeg = bars.slice(testFrom - warm, testFrom + testBars);
    const testStartMs = bars[testFrom].t;

    let best = combos[0];
    let bestScore = -Infinity;
    for (const params of combos) {
      const m = computeMetrics(simulate(train, strat.run(train, params, pair, tf), pair));
      const sc = score(m);
      if (sc > bestScore) {
        bestScore = sc;
        best = params;
      }
    }
    const testTrades = simulate(testSeg, strat.run(testSeg, best, pair, tf), pair).filter((t) => t.entryTime >= testStartMs);
    const m = computeMetrics(testTrades);
    windows.push({
      trainStart: iso(train[0].t),
      testStart: iso(testStartMs),
      testEnd: iso(testSeg[testSeg.length - 1].t),
      chosenParams: best,
      oos: { trades: m.trades, totalR: m.totalR, profitFactor: Number(m.profitFactor.toFixed(2)) },
    });
    oosTrades.push(...testTrades);
    finalParams = best; // most recent window's choice goes live
  }
  return { windows, oosTrades, finalParams };
}

/** Fraction of one-step grid neighbors of `params` that stay profitable over the
 *  full series (an IN-SAMPLE plateau check: the chosen params must sit on a broad
 *  ridge, not an isolated spike — cheap but effective anti-overfit signal). */
export function neighborhoodStability(bars: Bar[], strat: StrategyDef, pair: Pair, tf: Timeframe, params: Record<string, number>): number {
  const neighbors: Record<string, number>[] = [];
  for (const [k, vals] of Object.entries(strat.grid)) {
    const idx = vals.indexOf(params[k]);
    for (const step of [-1, 1]) {
      const v = vals[idx + step];
      if (v !== undefined) neighbors.push({ ...params, [k]: v });
    }
  }
  if (!neighbors.length) return 1;
  let ok = 0;
  for (const p of neighbors) {
    const m = computeMetrics(simulate(bars, strat.run(bars, p, pair, tf), pair));
    if (m.trades >= 10 && m.totalR > 0) ok++;
  }
  return ok / neighbors.length;
}

/** OOS net R by ATR-percentile tercile at each trade's entry bar. */
export function regimeSplit(bars: Bar[], trades: SimTrade[]): { low: number; mid: number; high: number } {
  const a = atr(bars, 14);
  const byTime = new Map<number, number>();
  bars.forEach((b, i) => byTime.set(b.t, i));
  const buckets = { low: 0, mid: 0, high: 0 };
  for (const t of trades) {
    // entry fills at bar i+1 open; regime read from the signal bar before it
    const idx = byTime.get(t.entryTime);
    const i = idx !== undefined ? Math.max(0, idx - 1) : -1;
    if (i < 0 || Number.isNaN(a[i])) continue;
    const p = percentileRank(a, i, 400);
    if (p < 1 / 3) buckets.low += t.r;
    else if (p < 2 / 3) buckets.mid += t.r;
    else buckets.high += t.r;
  }
  return { low: Number(buckets.low.toFixed(2)), mid: Number(buckets.mid.toFixed(2)), high: Number(buckets.high.toFixed(2)) };
}

export type Gates = { minTrades: number; minPF: number; minWindowsNonNeg: number; minNeighborhood: number; maxDdP95: number; minPProfit: number };
export const DEFAULT_GATES: Gates = { minTrades: 30, minPF: 1.15, minWindowsNonNeg: 0.55, minNeighborhood: 0.5, maxDdP95: 25, minPProfit: 0.8 };

export function validateCandidate(bars: Bar[], strat: StrategyDef, pair: Pair, tf: Timeframe, trainBars: number, testBars: number, gates: Gates = DEFAULT_GATES): ValidationReport {
  const wf = walkForward(bars, strat, pair, tf, trainBars, testBars);
  const oos = computeMetrics(wf.oosTrades);
  const inSample = computeMetrics(simulate(bars, strat.run(bars, wf.finalParams, pair, tf), pair));
  const mc = monteCarlo(wf.oosTrades);
  const neighborhood = neighborhoodStability(bars, strat, pair, tf, wf.finalParams);
  const regime = regimeSplit(bars, wf.oosTrades);

  const notes: string[] = [];
  const windowsNonNeg = wf.windows.length ? wf.windows.filter((w) => w.oos.totalR >= 0 || w.oos.trades === 0).length / wf.windows.length : 0;
  if (oos.trades < gates.minTrades) notes.push(`OOS sample too small (${oos.trades} < ${gates.minTrades})`);
  if (oos.profitFactor < gates.minPF) notes.push(`OOS profit factor ${oos.profitFactor.toFixed(2)} < ${gates.minPF}`);
  if (oos.expectancyR <= 0) notes.push(`OOS expectancy ${oos.expectancyR.toFixed(3)}R ≤ 0`);
  if (windowsNonNeg < gates.minWindowsNonNeg) notes.push(`only ${(windowsNonNeg * 100).toFixed(0)}% of walk-forward windows non-negative`);
  if (neighborhood < gates.minNeighborhood) notes.push(`parameter neighborhood unstable (${(neighborhood * 100).toFixed(0)}% profitable)`);
  if (mc.ddP95 > gates.maxDdP95) notes.push(`Monte Carlo p95 drawdown ${mc.ddP95}R too deep`);
  if (mc.pProfit < gates.minPProfit) notes.push(`Monte Carlo P(profit) ${(mc.pProfit * 100).toFixed(0)}% too low`);
  const regimesNeg = [regime.low, regime.mid, regime.high].filter((r) => r < -2).length;
  if (regimesNeg >= 2) notes.push("loses in 2 of 3 volatility regimes");

  return {
    pair,
    strategy: strat.id,
    timeframe: tf,
    params: wf.finalParams,
    oosMetrics: oos,
    inSampleMetrics: inSample,
    walkForward: wf.windows,
    monteCarlo: mc,
    neighborhoodProfitable: Number(neighborhood.toFixed(2)),
    regimeR: regime,
    dataStart: iso(bars[0].t),
    dataEnd: iso(bars[bars.length - 1].t),
    passed: notes.length === 0,
    gateNotes: notes,
  };
}
