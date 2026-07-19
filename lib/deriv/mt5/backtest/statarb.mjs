/**
 * DERIV MT5 — STATISTICAL ARBITRAGE (pairs / relative-value) test.
 *
 * Everything before this tested DIRECTIONAL prediction (guess price direction) —
 * dead on efficient FX + martingale synthetics. Stat-arb is different: trade the
 * SPREAD between two correlated instruments. If the spread is mean-reverting
 * (cointegration), you profit when it snaps back to fair, regardless of where
 * either leg goes. This edge CAN exist in efficient markets.
 *
 * Method: rolling hedge ratio β (OLS of logA on logB), residual = logA − β·logB,
 * rolling z-score. Enter at |z|≥ENTRY (short the rich leg / long the cheap leg),
 * exit at |z|≤EXIT, hard stop at |z|≥STOP or a time-stop. P&L is the residual
 * change (dollar-neutral, log terms); cost = BOTH legs × spread, on entry AND
 * exit (stat-arb pays 4 half-spreads/round-trip — its main enemy). TRAIN/HOLDOUT
 * split; report OOS expectancy + t-stat.
 *
 *   node lib/deriv/mt5/backtest/statarb.mjs <dataDir> [tfMin]
 */
import { loadBars, resample } from "./search-lib.mjs";

const dir = process.argv[2];
const tf = Number(process.argv[3] || 30);
const PIP = { frxEURUSD: 0.0001, frxGBPUSD: 0.0001, frxUSDJPY: 0.01, frxAUDUSD: 0.0001, frxUSDCAD: 0.0001, frxUSDCHF: 0.0001, frxEURJPY: 0.01, frxNZDUSD: 0.0001, frxEURGBP: 0.0001, frxAUDJPY: 0.01, frxEURCHF: 0.0001, frxGBPJPY: 0.01, frxNZDJPY: 0.01 };
const SPREAD_PIPS = { frxEURUSD: 0.8, frxGBPUSD: 1.0, frxUSDJPY: 0.9, frxAUDUSD: 1.0, frxUSDCAD: 1.2, frxUSDCHF: 1.2, frxEURJPY: 1.3, frxNZDUSD: 1.4, frxEURGBP: 1.1, frxAUDJPY: 1.4, frxEURCHF: 1.3, frxGBPJPY: 1.8, frxNZDJPY: 1.6 };

// correlated candidate pairs (share a currency / bloc → spread can cointegrate)
const CANDIDATES = [
  ["frxEURUSD", "frxGBPUSD"], ["frxEURUSD", "frxAUDUSD"], ["frxAUDUSD", "frxNZDUSD"],
  ["frxUSDCAD", "frxUSDCHF"], ["frxEURJPY", "frxUSDJPY"], ["frxAUDJPY", "frxNZDJPY"],
  ["frxGBPUSD", "frxAUDUSD"], ["frxEURJPY", "frxAUDJPY"], ["frxUSDJPY", "frxAUDJPY"],
  ["frxEURUSD", "frxUSDCHF"], ["frxEURGBP", "frxEURUSD"], ["frxGBPJPY", "frxEURJPY"],
  ["frxAUDUSD", "frxUSDCAD"], ["frxNZDUSD", "frxUSDCAD"],
];
const WBETA = 300, WZ = 150, ENTRY = 2.0, EXIT = 0.5, STOP = 4.0, MAXBARS = 200;

function alignedLogs(a, b) {
  const mb = new Map(); for (const r of b) mb.set(r[0], Math.log(r[4]));
  const t = [], la = [], lb = [];
  for (const r of a) { const y = mb.get(r[0]); if (y != null) { t.push(r[0]); la.push(Math.log(r[4])); lb.push(y); } }
  return { t, la, lb };
}

function run(symA, symB, from, to) {
  const A = resample(loadBars(dir, symA), tf), B = resample(loadBars(dir, symB), tf);
  const { t, la, lb } = alignedLogs(A, B);
  const N = t.length; if (N < WBETA + WZ + 10) return null;
  const spA = SPREAD_PIPS[symA] * PIP[symA], spB = SPREAD_PIPS[symB] * PIP[symB];
  // cost per round-trip in log terms: both legs, entry+exit ≈ 2*(spA/priceA + spB/priceB)
  const R = [];
  let pos = null, since = 0;
  for (let i = WBETA; i < N - 1; i++) {
    // rolling OLS beta of la on lb over WBETA
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let k = i - WBETA; k < i; k++) { sx += lb[k]; sy += la[k]; sxy += lb[k] * la[k]; sxx += lb[k] * lb[k]; }
    const n = WBETA, beta = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1e-9), alpha = (sy - beta * sx) / n;
    // residual series over WZ for z
    let m = 0; const res = [];
    for (let k = i - WZ; k < i; k++) { const r = la[k] - beta * lb[k] - alpha; res.push(r); m += r; }
    m /= WZ; let v = 0; for (const r of res) v += (r - m) ** 2; const sd = Math.sqrt(v / WZ);
    const curr = la[i] - beta * lb[i] - alpha;
    const z = sd > 0 ? (curr - m) / sd : 0;
    const priceA = Math.exp(la[i]), priceB = Math.exp(lb[i]);
    const costLog = 2 * (spA / priceA + Math.abs(beta) * spB / priceB); // round-trip, both legs

    if (pos) {
      since++;
      const exitNow = Math.abs(z) <= EXIT || Math.abs(z) >= STOP || since >= MAXBARS;
      if (exitNow) {
        // P&L (dollar-neutral): + if residual moved toward the mean in our favour
        const pnlLog = pos.side * (pos.entryResid - curr); // side=+1 shorted A (bet resid falls)
        const rr = (pnlLog - costLog) / (pos.sdEntry || 1e-9); // normalise by 1σ of residual
        R.push(rr);
        pos = null;
      }
    }
    if (!pos && t[i] >= from && t[i] <= to) {
      if (z >= ENTRY) { pos = { side: +1, entryResid: curr, sdEntry: sd }; since = 0; }       // resid rich → short A/long B
      else if (z <= -ENTRY) { pos = { side: -1, entryResid: curr, sdEntry: sd }; since = 0; }  // resid cheap → long A/short B
    }
  }
  const nT = R.length; if (!nT) return { n: 0 };
  const mean = R.reduce((s, x) => s + x, 0) / nT, sdr = Math.sqrt(R.reduce((s, x) => s + (x - mean) ** 2, 0) / nT);
  const tstat = sdr > 0 ? mean / (sdr / Math.sqrt(nT)) : 0;
  const w = R.filter((x) => x > 0).length, gw = R.filter((x) => x > 0).reduce((s, x) => s + x, 0), gl = -R.filter((x) => x <= 0).reduce((s, x) => s + x, 0);
  return { n: nT, exp: mean, t: tstat, pf: gl > 0 ? gw / gl : 9, win: w / nT * 100 };
}

const flag = (t, n) => !n ? "no data" : t > 2 ? "✓ EDGE" : t < -2 ? "✗ neg" : "· noise";
console.log(`\n=== STAT-ARB (pairs mean-reversion) | tf=M${tf} | entry|z|≥${ENTRY} exit≤${EXIT} stop≥${STOP} | cost=both legs entry+exit ===`);
// windows from first candidate
const A0 = resample(loadBars(dir, "frxEURUSD"), tf); const t0 = A0[0][0], t1 = A0[A0.length - 1][0]; const split = t0 + (t1 - t0) * 0.62;
console.log(`TRAIN [${new Date(t0 * 1e3).toISOString().slice(0, 10)} → ${new Date(split * 1e3).toISOString().slice(0, 10)}]  |  HOLDOUT [→ ${new Date(t1 * 1e3).toISOString().slice(0, 10)}]\n`);
let anyEdge = false;
for (const [a, b] of CANDIDATES) {
  const tr = run(a, b, t0, split), ho = run(a, b, split, t1);
  if (!tr || !ho || !tr.n || !ho.n) { console.log(`  ${a.replace("frx", "")}/${b.replace("frx", "")}: insufficient data`); continue; }
  const ok = tr.t > 2 && ho.t > 2;
  if (ok) anyEdge = true;
  console.log(`  ${(a.replace("frx", "") + "/" + b.replace("frx", "")).padEnd(15)} TRAIN exp ${tr.exp.toFixed(3)}R t=${tr.t.toFixed(1).padStart(5)} n=${tr.n}  |  HOLDOUT exp ${ho.exp.toFixed(3)}R t=${ho.t.toFixed(1).padStart(5)} PF ${ho.pf.toFixed(2)} n=${ho.n}  ${ok ? "✓✓ EDGE BOTH" : flag(ho.t, ho.n)}`);
}
console.log(`\n${anyEdge ? "≥1 pair shows a cost-surviving edge on BOTH train & holdout — worth pursuing." : "No pair survives cost on both train & holdout."}`);
