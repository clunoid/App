/**
 * DERIV MT5 — honest edge test on SYNTHETIC indices.
 *
 * Volatility & Step indices are driftless martingales BY CONSTRUCTION, so even
 * at ZERO cost their expectancy is exactly 0 (optional-stopping theorem). This
 * test demonstrates that empirically: run textbook trend/reversion configs at
 * zero cost AND at realistic cost. A martingale shows t≈0 at zero cost (no edge
 * possible) and negative after cost.
 *
 * Crash/Boom get their own STRUCTURAL strategies (spike-ride / drift-fade /
 * post-spike momentum) — the asymmetry that retail believes is exploitable.
 * Independent 15M-tick work says these fail after cost; we confirm on our data.
 *
 *   node lib/deriv/mt5/backtest/synth-test.mjs <dataDir>
 */
import { STRATS, makeInd, loadBars } from "./search-lib.mjs";

const dir = process.argv[2];
// per-symbol pip (price units) + realistic Deriv spread (price units). Synthetics
// are 24/7; we test at zero cost (martingale proof) and at these spreads.
const SPEC = {
  R_10: { pip: 0.001, spread: 0.003 }, R_25: { pip: 0.001, spread: 0.006 },
  R_50: { pip: 0.0001, spread: 0.012 }, R_75: { pip: 0.0001, spread: 0.020 },
  R_100: { pip: 0.01, spread: 0.05 },
  "1HZ10V": { pip: 0.01, spread: 0.03 }, "1HZ25V": { pip: 0.01, spread: 0.06 },
  "1HZ50V": { pip: 0.01, spread: 0.10 }, "1HZ75V": { pip: 0.01, spread: 0.15 },
  "1HZ100V": { pip: 0.01, spread: 0.20 },
  BOOM500: { pip: 0.001, spread: 0.4 }, BOOM1000: { pip: 0.0001, spread: 1.05 },
  CRASH500: { pip: 0.001, spread: 0.4 }, CRASH1000: { pip: 0.0001, spread: 1.05 },
  stpRNG: { pip: 0.1, spread: 0.1 },
};
const MAXBARS = 96;

function simPair(S, genFn, p, spread, from, to) {
  let pos = null, since = 0; const R = [];
  for (let i = 60; i < S.N - 1; i++) {
    const tm = S.t[i];
    if (pos) {
      since++;
      const o = S.o[i], h = S.h[i], l = S.l[i], c = S.c[i];
      let exit = null;
      if (pos.side > 0) { if (o <= pos.sl) exit = o; else if (o >= pos.tp) exit = o; else if (l <= pos.sl) exit = pos.sl; else if (h >= pos.tp) exit = pos.tp; }
      else { if (o >= pos.sl) exit = o; else if (o <= pos.tp) exit = o; else if (h >= pos.sl) exit = pos.sl; else if (l <= pos.tp) exit = pos.tp; }
      if (exit == null && since >= MAXBARS) exit = c;
      if (exit != null) { R.push((pos.side > 0 ? exit - pos.entry : pos.entry - exit) / pos.riskDist); pos = null; }
    }
    if (!pos && tm >= from && tm <= to) {
      const sig = genFn(S, i, p); if (!sig) continue;
      const riskDist = sig.slDist; if (!(riskDist > 0)) continue;
      const fill = S.o[i + 1], eff = sig.side > 0 ? fill + spread : fill - spread;
      pos = { side: sig.side, entry: eff, riskDist, sl: sig.side > 0 ? eff - riskDist : eff + riskDist, tp: sig.side > 0 ? eff + sig.tpDist : eff - sig.tpDist }; since = 0;
    }
  }
  return R;
}
const stats = (R) => { const n = R.length; if (!n) return { n: 0, exp: 0, t: 0, pf: 0, win: 0 }; const m = R.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(R.reduce((s, x) => s + (x - m) ** 2, 0) / n); const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0; const w = R.filter((x) => x > 0).length; const gw = R.filter((x) => x > 0).reduce((s, x) => s + x, 0), gl = -R.filter((x) => x <= 0).reduce((s, x) => s + x, 0); return { n, exp: m, t, pf: gl > 0 ? gw / gl : 9, win: w / n * 100 }; };
const flag = (t, n) => !n ? "no data" : t > 2 ? "✓ EDGE" : t < -2 ? "✗ neg" : "· noise";

const CONFIGS = [
  ["emaX 21/55", "emaX", { fast: 21, slow: 55, slAtr: 2.5, tpRR: 2, trail: 0 }],
  ["donch20 brk", "donch", { n: 20, slAtr: 2, tpRR: 2, trail: 1 }],
  ["RSI2 revert", "rsiRev", { n: 2, lo: 10, slAtr: 2, tpAtr: 2, trend: 0 }],
  ["bbRev20", "bbRev", { n: 20, k: 2, slAtr: 2, tpMid: 1, tpAtr: 2 }],
  ["zRev fade", "zRev", { n: 20, z: 2, slAtr: 2, tpFrac: 1 }],
];

const VOL = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"];
console.log(`\n=== VOLATILITY / STEP indices — martingale check (zero-cost proof + realistic cost) ===`);
console.log(`If these are true martingales, even ZERO-cost expectancy ≈ 0 (t not > 2). Any edge is impossible, not just unprofitable.\n`);
for (const [label, fam, p] of CONFIGS) {
  let R0 = [], Rc = [];
  for (const sym of [...VOL, "stpRNG"]) {
    const raw = loadBars(dir, sym); if (!raw) continue;
    const S = makeInd(raw); const sp = SPEC[sym]?.spread ?? 0;
    R0 = R0.concat(simPair(S, STRATS[fam].gen, p, 0, S.t[60], S.t[S.N - 1]));
    Rc = Rc.concat(simPair(S, STRATS[fam].gen, p, sp, S.t[60], S.t[S.N - 1]));
  }
  const s0 = stats(R0), sc = stats(Rc);
  console.log(`  ${label.padEnd(12)} ZERO-cost: exp ${s0.exp.toFixed(4)}R t=${s0.t.toFixed(2).padStart(6)} ${flag(s0.t, s0.n)}   |  w/cost: exp ${sc.exp.toFixed(4)}R t=${sc.t.toFixed(2).padStart(6)} PF ${sc.pf.toFixed(2)} ${flag(sc.t, sc.n)}  (n=${sc.n})`);
}
console.log(`\n(Zero-cost t≈0 ⇒ no exploitable structure exists — a mathematical property of a driftless random walk, not a cost problem.)`);
