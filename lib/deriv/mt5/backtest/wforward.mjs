/**
 * DERIV MT5 — the definitive honesty tests. Two ways to remove overfitting:
 *
 *  A. ZERO-DOF: fixed TEXTBOOK configs (no optimisation at all), applied
 *     uniformly to all 12 pairs over the FULL year. No researcher choice → no
 *     overfit possible. Reports expectancy(R) with a t-stat; |t|<2 ⇒ the "edge"
 *     is statistically indistinguishable from zero.
 *
 *  B. WALK-FORWARD: roll a 6-month train / 1-month test window; each fold picks
 *     ONE global param on train, trades all pairs the next month OOS; accumulate.
 *     Real out-of-sample with a meaningful sample size.
 *
 * Costs modelled: spread+slip, gap-through stop fills, overnight swap, cost gate,
 * 48-bar time-stop — same as honest.mjs.
 *
 *   node lib/deriv/mt5/backtest/wforward.mjs <dataDir>
 */
import { STRATS, makeInd, loadBars, resample } from "./search-lib.mjs";

const dataDir = process.argv[2];
const PAIRS = { frxEURUSD: 0.0001, frxGBPUSD: 0.0001, frxUSDJPY: 0.01, frxAUDUSD: 0.0001, frxUSDCAD: 0.0001, frxUSDCHF: 0.0001, frxEURJPY: 0.01, frxNZDUSD: 0.0001, frxEURGBP: 0.0001, frxAUDJPY: 0.01, frxEURCHF: 0.0001, frxGBPJPY: 0.01 };
const SPREAD_PIPS = { frxEURUSD: 0.8, frxGBPUSD: 1.0, frxUSDJPY: 0.9, frxAUDUSD: 1.0, frxUSDCAD: 1.2, frxUSDCHF: 1.2, frxEURJPY: 1.3, frxNZDUSD: 1.4, frxEURGBP: 1.1, frxAUDJPY: 1.4, frxEURCHF: 1.3, frxGBPJPY: 1.8 };
const MAXBARS = 48, SWAP_PIPS = 0.5, COST_GATE = 0.33;
const nightsHeld = (t0, t1) => { let n = 0, mark = Math.ceil((t0 - 21 * 3600) / 86400) * 86400 + 21 * 3600; while (mark <= t1) { n += new Date(mark * 1000).getUTCDay() === 3 ? 3 : 1; mark += 86400; } return n; };

function simPair(S, genFn, p, cost, from, to) {
  const { spread, slip, pip } = cost;
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
      if (exit != null) { const rawR = (pos.side > 0 ? exit - pos.entry : pos.entry - exit) / pos.riskDist; const swapR = nightsHeld(pos.entryT, tm) * SWAP_PIPS * pip / pos.riskDist; R.push(rawR - swapR); pos = null; }
    }
    if (!pos && tm >= from && tm <= to) {
      const sig = genFn(S, i, p); if (!sig) continue;
      const riskDist = sig.slDist; if (!(riskDist > 0) || (spread + slip) / riskDist > COST_GATE) continue;
      const fill = S.o[i + 1], eff = sig.side > 0 ? fill + spread + slip : fill - spread - slip;
      pos = { side: sig.side, entry: eff, riskDist, sl: sig.side > 0 ? eff - riskDist : eff + riskDist, tp: sig.side > 0 ? eff + sig.tpDist : eff - sig.tpDist, entryT: S.t[i + 1] }; since = 0;
    }
  }
  return R;
}
const costOf = (sym) => { const pip = PAIRS[sym]; return { spread: (SPREAD_PIPS[sym] || 1.2) * pip, slip: 0.1 * pip, pip }; };
const stats = (R) => { const n = R.length; if (!n) return { n: 0 }; const m = R.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(R.reduce((s, x) => s + (x - m) ** 2, 0) / n); const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0; const w = R.filter((x) => x > 0).length; const gw = R.filter((x) => x > 0).reduce((s, x) => s + x, 0), gl = -R.filter((x) => x <= 0).reduce((s, x) => s + x, 0); return { n, exp: m, t, win: w / n * 100, pf: gl > 0 ? gw / gl : 9 }; };

// caches
const series = {};
const S_of = (sym, tf) => { const k = `${sym}@${tf}`; if (!series[k]) series[k] = makeInd(resample(loadBars(dataDir, sym), tf)); return series[k]; };

/* ── A. ZERO-DOF textbook configs, all pairs, full year ─────────────────────── */
console.log(`\n=== A. ZERO-DOF (fixed textbook configs, no optimisation) — all 12 pairs, full year ===`);
const FIXED = [
  ["emaX 21/55 M30", 30, "emaX", { fast: 21, slow: 55, slAtr: 2.5, tpRR: 2, trail: 0 }],
  ["emaX 12/50 M30", 30, "emaX", { fast: 12, slow: 50, slAtr: 2.5, tpRR: 2, trail: 0 }],
  ["emaX 50/200 M30", 30, "emaX", { fast: 50, slow: 200, slAtr: 3, tpRR: 3, trail: 0 }],
  ["donch20 brk M30", 30, "donch", { n: 20, slAtr: 2, tpRR: 2, trail: 1 }],
  ["donch55 brk M30", 30, "donch", { n: 55, slAtr: 2.5, tpRR: 3, trail: 1 }],
  ["Connors RSI2 M30", 30, "rsiRev", { n: 2, lo: 10, slAtr: 2, tpAtr: 2, trend: 1 }],
  ["bbRev20 M30", 30, "bbRev", { n: 20, k: 2, slAtr: 2, tpMid: 1, tpAtr: 2 }],
  ["emaX 21/55 H1", 60, "emaX", { fast: 21, slow: 55, slAtr: 2.5, tpRR: 2, trail: 0 }],
  ["donch20 brk H1", 60, "donch", { n: 20, slAtr: 2, tpRR: 2, trail: 1 }],
];
for (const [label, tf, fam, p] of FIXED) {
  let R = [];
  for (const sym of Object.keys(PAIRS)) { const S = S_of(sym, tf); const t0 = S.t[60], t1 = S.t[S.N - 1]; R = R.concat(simPair(S, STRATS[fam].gen, p, costOf(sym), t0, t1)); }
  const s = stats(R);
  const flag = s.n ? (s.t > 2 ? "✓ EDGE" : s.t < -2 ? "✗ neg" : "· noise") : "";
  console.log(`  ${label.padEnd(18)} n=${String(s.n).padStart(5)}  exp ${(s.exp ?? 0).toFixed(4)}R  t=${(s.t ?? 0).toFixed(2).padStart(6)}  PF ${(s.pf ?? 0).toFixed(2)}  win ${(s.win ?? 0).toFixed(0)}%  ${flag}`);
}

/* ── B. Walk-forward, single global param per fold ──────────────────────────── */
console.log(`\n=== B. WALK-FORWARD (train 6mo → test 1mo, roll 1mo; one global param/fold) ===`);
for (const [famLabel, fam, grid, tf] of [
  ["emaX M30", "emaX", STRATS.emaX.grid, 30],
  ["rsiRev(dip) M30", "rsiRev", STRATS.rsiRev.grid.filter((p) => p.trend === 1), 30],
  ["donch M30", "donch", STRATS.donch.grid, 30],
]) {
  // global timeline from EURUSD
  const S0 = S_of("frxEURUSD", tf); const t0 = S0.t[60], t1 = S0.t[S0.N - 1];
  const MONTH = 30 * 86400;
  let oos = [];
  for (let testStart = t0 + 6 * MONTH; testStart + MONTH <= t1; testStart += MONTH) {
    const trainW = [testStart - 6 * MONTH, testStart], testW = [testStart, testStart + MONTH];
    // pick best global param on train (aggregate across pairs)
    let best = null;
    for (const p of grid) {
      let R = [];
      for (const sym of Object.keys(PAIRS)) R = R.concat(simPair(S_of(sym, tf), STRATS[fam].gen, p, costOf(sym), trainW[0], trainW[1]));
      const s = stats(R);
      if (s.n < 30 || !(s.exp > 0)) continue;
      const sc = s.exp * Math.sqrt(s.n);
      if (!best || sc > best.sc) best = { p, sc };
    }
    if (!best) continue;
    for (const sym of Object.keys(PAIRS)) oos = oos.concat(simPair(S_of(sym, tf), STRATS[fam].gen, best.p, costOf(sym), testW[0], testW[1]));
  }
  const s = stats(oos);
  const flag = s.n ? (s.t > 2 ? "✓ EDGE" : s.t < -2 ? "✗ neg" : "· noise") : "no folds";
  console.log(`  ${famLabel.padEnd(16)} OOS n=${String(s.n).padStart(5)}  exp ${(s.exp ?? 0).toFixed(4)}R  t=${(s.t ?? 0).toFixed(2).padStart(6)}  PF ${(s.pf ?? 0).toFixed(2)}  win ${(s.win ?? 0).toFixed(0)}%  ${flag}`);
}
console.log(`\n(A trade-level edge needs t>2 — i.e. mean R per trade reliably above zero after costs.)`);
