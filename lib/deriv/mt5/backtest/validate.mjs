/**
 * DERIV MT5 — HONEST VALIDATION of per-pair strategies.
 *
 * search.mjs peeked at the test window to pick winners (optimistic bias). This
 * does it right:
 *   1. SELECT the best config on TRAIN ONLY (no test peeking).
 *   2. Report the UNTOUCHED test window.
 *   3. CONSISTENCY: split test into 3 sub-folds, count how many are positive.
 *   4. COST STRESS: re-run the chosen config on test at 1.0/1.5/2.0× spread.
 *   5. CROSS-SECTIONAL: the same family winning on many pairs = real effect,
 *      not noise (momentum/reversion are known FX anomalies; a fluke is not).
 *
 * A config is TRUSTED only if: test net>0, ≥2/3 sub-folds positive, and it
 * survives 1.5× spread. That is the bar to ship.
 *
 *   node lib/deriv/mt5/backtest/validate.mjs <dataDir> <tfMinutes> [--news]
 */
import { STRATS, makeInd, loadBars, resample, backtest, cartesian } from "./search-lib.mjs";

const dataDir = process.argv[2];
const tf = Number(process.argv[3] || 15);
const useNews = process.argv.includes("--news");

const PAIRS = {
  frxEURUSD: 0.0001, frxGBPUSD: 0.0001, frxUSDJPY: 0.01, frxAUDUSD: 0.0001,
  frxUSDCAD: 0.0001, frxUSDCHF: 0.0001, frxEURJPY: 0.01, frxNZDUSD: 0.0001,
  frxEURGBP: 0.0001, frxAUDJPY: 0.01, frxEURCHF: 0.0001, frxGBPJPY: 0.01,
};
const SPREAD_PIPS = {
  frxEURUSD: 0.8, frxGBPUSD: 1.0, frxUSDJPY: 0.9, frxAUDUSD: 1.0, frxUSDCAD: 1.2,
  frxUSDCHF: 1.2, frxEURJPY: 1.3, frxNZDUSD: 1.4, frxEURGBP: 1.1, frxAUDJPY: 1.4,
  frxEURCHF: 1.3, frxGBPJPY: 1.8,
};

console.log(`\n=== HONEST VALIDATION | tf=M${tf} | news=${useNews} ===\n`);
const chosen = {};
const familyHits = {}; // family -> count of pairs where it's the train winner

for (const sym of Object.keys(PAIRS)) {
  const raw = loadBars(dataDir, sym);
  if (!raw) { console.log(`${sym}: no data`); continue; }
  const S = makeInd(resample(raw, tf));
  const pip = PAIRS[sym];
  const cost = { spread: (SPREAD_PIPS[sym] || 1.2) * pip, slip: 0.1 * pip };
  const t0 = S.t[60], t1 = S.t[S.N - 1];
  const split = t0 + (t1 - t0) * 0.62;
  const trainW = [t0, split], testW = [split, t1];
  const minTr = Math.max(40, (split - t0) / 86400 * 0.15);

  // 1. SELECT best config per family on TRAIN ONLY, then best family on train.
  let bestByFam = {};
  for (const [name, strat] of Object.entries(STRATS)) {
    let fbest = null;
    for (const p of strat.grid) {
      const tr = backtest(S, strat, p, cost, trainW[0], trainW[1], { news: useNews });
      if (tr.trades < minTr || tr.expR <= 0 || tr.pf < 1.08) continue;
      const score = tr.expR * Math.sqrt(tr.trades); // train robustness only
      if (!fbest || score > fbest.score) fbest = { name, p, tr, score };
    }
    if (fbest) bestByFam[name] = fbest;
  }
  const fams = Object.values(bestByFam).sort((a, b) => b.score - a.score);
  if (!fams.length) { console.log(`${sym.replace("frx", "").padEnd(7)} — no train edge`); continue; }
  const win = fams[0];
  familyHits[win.name] = (familyHits[win.name] || 0) + 1;

  // 2. UNTOUCHED test
  const te = backtest(S, STRATS[win.name], win.p, cost, testW[0], testW[1], { news: useNews });

  // 3. Consistency across 3 test sub-folds
  const subs = [];
  for (let k = 0; k < 3; k++) {
    const a = testW[0] + (testW[1] - testW[0]) * (k / 3), b = testW[0] + (testW[1] - testW[0]) * ((k + 1) / 3);
    subs.push(backtest(S, STRATS[win.name], win.p, cost, a, b, { news: useNews }).net);
  }
  const posSubs = subs.filter((x) => x > 0).length;

  // 4. Cost stress
  const stress = [1.5, 2.0].map((m) => backtest(S, STRATS[win.name], win.p, { spread: cost.spread * m, slip: cost.slip * m }, testW[0], testW[1], { news: useNews }).net);

  const trusted = te.net > 0 && posSubs >= 2 && stress[0] > 0;
  const tag = trusted ? "✓ TRUST" : "✗ weak ";
  console.log(`${sym.replace("frx", "").padEnd(7)} ${tag} ${win.name.padEnd(7)} ${JSON.stringify(win.p)}`);
  console.log(`   train ${win.tr.net.toFixed(1).padStart(6)}%  |  TEST ${te.net.toFixed(1).padStart(6)}% PF ${te.pf.toFixed(2)} win ${te.win.toFixed(0)}% exp ${te.expR.toFixed(3)}R n=${te.trades} (${te.tpd.toFixed(1)}/d) DD ${te.dd.toFixed(0)}%`);
  console.log(`   subfolds [${subs.map((x) => x.toFixed(1)).join(", ")}]% pos=${posSubs}/3  |  stress 1.5x ${stress[0].toFixed(1)}% 2.0x ${stress[1].toFixed(1)}%`);
  if (trusted) chosen[sym] = { name: win.name, p: win.p, te };
}

console.log(`\n--- family win counts (train): ${Object.entries(familyHits).map(([k, v]) => `${k}:${v}`).join("  ")}`);
console.log(`--- TRUSTED pairs: ${Object.keys(chosen).length}`);
for (const [sym, c] of Object.entries(chosen)) console.log(`     ${sym.replace("frx", "").padEnd(7)} ${c.name.padEnd(7)} TEST ${c.te.net.toFixed(1)}% (${c.te.tpd.toFixed(1)}/d)`);
console.log(`\n${JSON.stringify(Object.fromEntries(Object.entries(chosen).map(([s, c]) => [s, { name: c.name, p: c.p }])), null, 0)}`);
