/**
 * RESEARCH RUNNER — the offline validation pass that decides what trades live.
 *
 *   npx tsx lib/trading/research/run.ts
 *
 * For every pair × strategy × timeframe with enough real history it runs the
 * full validation harness (walk-forward → OOS metrics → Monte Carlo →
 * neighborhood → regime), applies the fixed robustness gates, and writes:
 *   • reports.json   — every candidate's complete dossier (transparent evidence)
 *   • playbooks.json — ONLY the gate-passing champions the live scanner may use
 *
 * H1 candidates validate on ~2 years (anchored walk-forward: 4000-bar train,
 * 1000-bar test ≈ 9mo/8wk windows). M30 runs a shorter 60-day micro-validation
 * (provider depth limit) and is additionally required to have an H1 champion of
 * the same family — a lower-timeframe echo of an edge proven on more data, never
 * a standalone claim. Pairs with no passing candidate ship as "monitor only":
 * no trade is the designed outcome for weak evidence.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAIRS, SPREAD_PIPS, type Pair, type PairPlaybook, type Timeframe, type ValidationReport } from "../types";
import { fetchBars } from "../data";
import { STRATEGIES } from "../strategies";
import { validateCandidate, DEFAULT_GATES } from "../validate";

const HERE = dirname(fileURLToPath(import.meta.url));

const H1_TRAIN = 4000; // ≈ 9 months of hourly bars
const H1_TEST = 1000; // ≈ 8 weeks
const M30_TRAIN = 1400; // ≈ 40 days of 30m bars
const M30_TEST = 700; // ≈ 20 days

// M30 gates: same discipline, sample floor scaled to the 60-day depth.
const M30_GATES = { ...DEFAULT_GATES, minTrades: 15, minWindowsNonNeg: 0.5 };

async function main() {
  const reports: ValidationReport[] = [];
  const playbooks: PairPlaybook[] = [];

  for (const pair of PAIRS) {
    console.log(`\n══ ${pair} ═════════════════════════════════════`);
    const h1 = await fetchBars(pair, "1h");
    const m30 = await fetchBars(pair, "30m");
    console.log(`   data: H1 ${h1.length} bars (${new Date(h1[0].t).toISOString().slice(0, 10)} → ${new Date(h1[h1.length - 1].t).toISOString().slice(0, 10)}), M30 ${m30.length} bars`);

    const pairReports: ValidationReport[] = [];
    for (const strat of STRATEGIES) {
      const t0 = Date.now();
      const rep = validateCandidate(h1, strat, pair, "1h", H1_TRAIN, H1_TEST);
      pairReports.push(rep);
      console.log(
        `   H1  ${strat.id.padEnd(16)} ${rep.passed ? "PASS" : "fail"}  oos: ${String(rep.oosMetrics.trades).padStart(3)}tr  PF ${rep.oosMetrics.profitFactor === Infinity ? "inf" : rep.oosMetrics.profitFactor.toFixed(2)}  exp ${rep.oosMetrics.expectancyR.toFixed(3)}R  dd ${rep.oosMetrics.maxDrawdownR.toFixed(1)}R  nb ${(rep.neighborhoodProfitable * 100).toFixed(0)}%  (${((Date.now() - t0) / 1000).toFixed(1)}s)${rep.passed ? "" : `  [${rep.gateNotes[0] || ""}]`}`
      );
    }

    // M30 micro-validation — only for families with an H1 PASS on this pair
    const h1PassFamilies = new Set(pairReports.filter((r) => r.passed).map((r) => STRATEGIES.find((s) => s.id === r.strategy)?.family));
    for (const strat of STRATEGIES) {
      if (!h1PassFamilies.has(strat.family)) continue;
      const rep = validateCandidate(m30, strat, pair, "30m", M30_TRAIN, M30_TEST, M30_GATES);
      rep.gateNotes.unshift("micro-validation: 60-day depth only — echo of the H1 edge, reduced confidence");
      pairReports.push(rep);
      console.log(`   M30 ${strat.id.padEnd(16)} ${rep.passed ? "PASS" : "fail"}  oos: ${String(rep.oosMetrics.trades).padStart(3)}tr  PF ${rep.oosMetrics.profitFactor === Infinity ? "inf" : rep.oosMetrics.profitFactor.toFixed(2)}  exp ${rep.oosMetrics.expectancyR.toFixed(3)}R`);
    }

    reports.push(...pairReports);
    const champions = pairReports
      .filter((r) => r.passed)
      .sort((a, b) => b.oosMetrics.expectancyR * Math.sqrt(b.oosMetrics.trades) - a.oosMetrics.expectancyR * Math.sqrt(a.oosMetrics.trades))
      .slice(0, 2)
      .map((r) => ({ strategy: r.strategy, timeframe: r.timeframe as Timeframe, params: r.params, oosProfitFactor: Number(r.oosMetrics.profitFactor.toFixed(2)), oosTrades: r.oosMetrics.trades }));
    playbooks.push({ pair: pair as Pair, champions, spreadPips: SPREAD_PIPS[pair], generatedAt: new Date().toISOString() });
    console.log(`   → playbook: ${champions.length ? champions.map((c) => `${c.strategy}@${c.timeframe}`).join(", ") : "MONITOR ONLY (no candidate passed all gates)"}`);
  }

  // trim equity curves in reports.json to keep the bundle lean (UI downsamples anyway)
  const slim = reports.map((r) => ({
    ...r,
    oosMetrics: { ...r.oosMetrics, equityCurve: downsample(r.oosMetrics.equityCurve, 240) },
    inSampleMetrics: { ...r.inSampleMetrics, equityCurve: downsample(r.inSampleMetrics.equityCurve, 240) },
  }));

  mkdirSync(HERE, { recursive: true });
  writeFileSync(join(HERE, "reports.json"), JSON.stringify({ generatedAt: new Date().toISOString(), gates: DEFAULT_GATES, reports: slim }, null, 1));
  writeFileSync(join(HERE, "playbooks.json"), JSON.stringify({ generatedAt: new Date().toISOString(), playbooks }, null, 1));
  console.log(`\nWrote ${reports.length} reports, ${playbooks.filter((p) => p.champions.length).length}/${PAIRS.length} pairs tradeable.`);
}

function downsample(xs: number[], n: number): number[] {
  if (xs.length <= n) return xs;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(xs[Math.floor((i / (n - 1)) * (xs.length - 1))]);
  return out;
}

main().catch((e) => {
  console.error("research run failed:", e);
  process.exit(1);
});
