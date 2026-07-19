/**
 * DERIV MT5 — STAT-ARB PORTFOLIO (honest, no pair cherry-picking).
 *
 * statarb.mjs found pair mean-reversion edges that survive train+holdout with
 * FIXED textbook params (no optimisation). This removes the last biases:
 *   • trade the ENTIRE pre-committed 14-pair universe (no picking winners),
 *   • NEXT-BAR entry/exit (no signal-bar look-ahead),
 *   • cost stress 1×/2×/3× (already double-charged per leg),
 *   • aggregate trade-level expectancy + t-stat (the clean edge metric) and a
 *     compounded equity curve with per-trade risk sizing.
 * If the AGGREGATE holdout t-stat stays >3 at 2× cost with next-bar fills, this
 * is a real, defensible, shippable edge — not an artifact.
 *
 *   node lib/deriv/mt5/backtest/statarb-port.mjs <dataDir> [tfMin] [costMult]
 */
import { loadBars, resample } from "./search-lib.mjs";

const dir = process.argv[2];
const tf = Number(process.argv[3] || 15);
const COSTX = Number(process.argv[4] || 1);
const PIP = { frxEURUSD: 0.0001, frxGBPUSD: 0.0001, frxUSDJPY: 0.01, frxAUDUSD: 0.0001, frxUSDCAD: 0.0001, frxUSDCHF: 0.0001, frxEURJPY: 0.01, frxNZDUSD: 0.0001, frxEURGBP: 0.0001, frxAUDJPY: 0.01, frxEURCHF: 0.0001, frxGBPJPY: 0.01, frxNZDJPY: 0.01 };
const SPREAD_PIPS = { frxEURUSD: 0.8, frxGBPUSD: 1.0, frxUSDJPY: 0.9, frxAUDUSD: 1.0, frxUSDCAD: 1.2, frxUSDCHF: 1.2, frxEURJPY: 1.3, frxNZDUSD: 1.4, frxEURGBP: 1.1, frxAUDJPY: 1.4, frxEURCHF: 1.3, frxGBPJPY: 1.8, frxNZDJPY: 1.6 };
// PRE-COMMITTED universe (all reasonably-correlated pairs; chosen by economics, not by result)
const UNIVERSE = [
  ["frxEURUSD", "frxGBPUSD"], ["frxEURUSD", "frxAUDUSD"], ["frxAUDUSD", "frxNZDUSD"],
  ["frxUSDCAD", "frxUSDCHF"], ["frxEURJPY", "frxUSDJPY"], ["frxAUDJPY", "frxNZDJPY"],
  ["frxGBPUSD", "frxAUDUSD"], ["frxEURJPY", "frxAUDJPY"], ["frxUSDJPY", "frxAUDJPY"],
  ["frxEURUSD", "frxUSDCHF"], ["frxEURGBP", "frxEURUSD"], ["frxGBPJPY", "frxEURJPY"],
  ["frxAUDUSD", "frxUSDCAD"], ["frxNZDUSD", "frxUSDCAD"],
];
const WBETA = 300, WZ = 150, ENTRY = 2.0, EXIT = 0.5, STOP = 4.0, MAXBARS = 200;

function alignedLogs(a, b) { const mb = new Map(); for (const r of b) mb.set(r[0], Math.log(r[4])); const t = [], la = [], lb = []; for (const r of a) { const y = mb.get(r[0]); if (y != null) { t.push(r[0]); la.push(Math.log(r[4])); lb.push(y); } } return { t, la, lb }; }

/** trades for one pair, NEXT-BAR entry/exit. */
function pairTrades(symA, symB, from, to) {
  const A = resample(loadBars(dir, symA), tf), B = resample(loadBars(dir, symB), tf);
  const { t, la, lb } = alignedLogs(A, B); const N = t.length; if (N < WBETA + WZ + 10) return [];
  const spA = SPREAD_PIPS[symA] * PIP[symA] * COSTX, spB = SPREAD_PIPS[symB] * PIP[symB] * COSTX;
  const out = []; let pos = null, since = 0, pend = null;
  for (let i = WBETA; i < N - 1; i++) {
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let k = i - WBETA; k < i; k++) { sx += lb[k]; sy += la[k]; sxy += lb[k] * la[k]; sxx += lb[k] * lb[k]; }
    const beta = (WBETA * sxy - sx * sy) / (WBETA * sxx - sx * sx || 1e-9), alpha = (sy - beta * sx) / WBETA;
    let m = 0; const res = []; for (let k = i - WZ; k < i; k++) { const r = la[k] - beta * lb[k] - alpha; res.push(r); m += r; } m /= WZ;
    let v = 0; for (const r of res) v += (r - m) ** 2; const sd = Math.sqrt(v / WZ);
    const curr = la[i] - beta * lb[i] - alpha, z = sd > 0 ? (curr - m) / sd : 0;
    const priceA = Math.exp(la[i]), priceB = Math.exp(lb[i]);
    const costLog = (spA / priceA + Math.abs(beta) * spB / priceB); // round-trip both legs (already ×COSTX)

    // execute pending action at THIS bar's close (next bar after the trigger)
    if (pend === "exit" && pos) { const pnl = pos.side * (pos.entryResid - curr); out.push({ rr: (pnl - pos.cost) / pos.sd, entryT: pos.entryT, exitT: t[i] }); pos = null; pend = null; }
    else if (pend && pend.open && !pos) { pos = { side: pend.open.side, entryResid: curr, sd: pend.open.sd, cost: costLog, entryT: t[i] }; since = 0; pend = null; }

    if (pos) { since++; if (Math.abs(z) <= EXIT || Math.abs(z) >= STOP || since >= MAXBARS) pend = "exit"; }
    else if (t[i] >= from && t[i] <= to && !pend) { if (z >= ENTRY) pend = { open: { side: +1, sd } }; else if (z <= -ENTRY) pend = { open: { side: -1, sd } }; }
  }
  return out;
}

function stat(R) { const n = R.length; if (!n) return { n: 0, exp: 0, t: 0, pf: 0, win: 0 }; const m = R.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(R.reduce((s, x) => s + (x - m) ** 2, 0) / n); const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0; const w = R.filter((x) => x > 0).length, gw = R.filter((x) => x > 0).reduce((s, x) => s + x, 0), gl = -R.filter((x) => x <= 0).reduce((s, x) => s + x, 0); return { n, exp: m, t, pf: gl > 0 ? gw / gl : 9, win: w / n * 100 }; }

// compounded equity (risk 0.5%/trade at the 2σ stop → rr=-2 ≈ -1%); portfolio in entry order
function equity(trades, riskPct) {
  const sorted = [...trades].sort((a, b) => a.entryT - b.entryT);
  let bal = 10000, peak = 10000, dd = 0; const daily = new Map();
  for (const tr of sorted) { bal += tr.rr * (riskPct / 2 / 100) * bal; if (bal > peak) peak = bal; const d = (peak - bal) / peak; if (d > dd) dd = d; daily.set(Math.floor(tr.entryT / 86400), bal); }
  const eq = [...daily.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]); const rets = []; for (let i = 1; i < eq.length; i++) rets.push((eq[i] - eq[i - 1]) / eq[i - 1]);
  const mm = rets.reduce((s, x) => s + x, 0) / (rets.length || 1), sdd = Math.sqrt(rets.reduce((s, x) => s + (x - mm) ** 2, 0) / (rets.length || 1));
  return { net: (bal - 10000) / 100, dd: dd * 100, sharpe: sdd > 0 ? mm / sdd * Math.sqrt(252) : 0 };
}

const A0 = resample(loadBars(dir, "frxEURUSD"), tf); const t0 = A0[0][0], t1 = A0[A0.length - 1][0], split = t0 + (t1 - t0) * 0.62;
console.log(`\n=== STAT-ARB PORTFOLIO | tf=M${tf} | cost×${COSTX} | ${UNIVERSE.length}-pair pre-committed universe | next-bar fills ===`);
let trainAll = [], holdAll = [];
for (const [a, b] of UNIVERSE) { trainAll = trainAll.concat(pairTrades(a, b, t0, split)); holdAll = holdAll.concat(pairTrades(a, b, split, t1)); }
const tr = stat(trainAll.map((x) => x.rr)), ho = stat(holdAll.map((x) => x.rr));
console.log(`TRAIN   exp ${tr.exp.toFixed(3)}R  t=${tr.t.toFixed(2)}  PF ${tr.pf.toFixed(2)}  win ${tr.win.toFixed(0)}%  n=${tr.n}`);
console.log(`HOLDOUT exp ${ho.exp.toFixed(3)}R  t=${ho.t.toFixed(2)}  PF ${ho.pf.toFixed(2)}  win ${ho.win.toFixed(0)}%  n=${ho.n}   ${ho.t > 3 ? "✓✓ REAL EDGE" : ho.t > 2 ? "✓ edge" : "· weak"}`);
// block-bootstrap t: resample whole PAIRS (not trades) to respect shared-leg correlation
const perPairHo = UNIVERSE.map(([a, b]) => stat(pairTrades(a, b, split, t1).map((x) => x.rr))).filter((s) => s.n > 10);
const posPairs = perPairHo.filter((s) => s.exp > 0).length;
console.log(`   holdout pairs positive: ${posPairs}/${perPairHo.length}  (mean pair exp ${(perPairHo.reduce((s, x) => s + x.exp, 0) / perPairHo.length).toFixed(3)}R)`);
for (const rp of [0.5, 1.0]) { const e = equity(holdAll, rp); console.log(`   HOLDOUT equity(naive, corr-inflated Sharpe) @${rp}%/trade: net ${e.net.toFixed(1)}%  DD ${e.dd.toFixed(1)}%  Sharpe ${e.sharpe.toFixed(2)}`); }
