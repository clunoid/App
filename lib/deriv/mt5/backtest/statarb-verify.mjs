/**
 * DERIV MT5 — STAT-ARB falsification + robustness.
 *
 *  1. DESYNC NULL — shift leg B by a big offset so the two series are no longer
 *     contemporaneously cointegrated (same marginals, broken relationship). A
 *     genuine mean-reversion edge MUST vanish here; if it persists, the harness
 *     has a look-ahead/accounting bug manufacturing the edge.
 *  2. M30 — does the edge hold on a second timeframe (not just M15)?
 *  3. CAPPED PORTFOLIO — cap concurrent open positions so shared-leg correlation
 *     can't inflate the equity/Sharpe; report an honest net/DD/Sharpe.
 *
 *   node lib/deriv/mt5/backtest/statarb-verify.mjs <dataDir>
 */
import { loadBars, resample } from "./search-lib.mjs";

const dir = process.argv[2];
const PIP = { frxEURUSD: 0.0001, frxGBPUSD: 0.0001, frxUSDJPY: 0.01, frxAUDUSD: 0.0001, frxUSDCAD: 0.0001, frxUSDCHF: 0.0001, frxEURJPY: 0.01, frxNZDUSD: 0.0001, frxEURGBP: 0.0001, frxAUDJPY: 0.01, frxEURCHF: 0.0001, frxGBPJPY: 0.01, frxNZDJPY: 0.01 };
const SPREAD_PIPS = { frxEURUSD: 0.8, frxGBPUSD: 1.0, frxUSDJPY: 0.9, frxAUDUSD: 1.0, frxUSDCAD: 1.2, frxUSDCHF: 1.2, frxEURJPY: 1.3, frxNZDUSD: 1.4, frxEURGBP: 1.1, frxAUDJPY: 1.4, frxEURCHF: 1.3, frxGBPJPY: 1.8, frxNZDJPY: 1.6 };
const UNIVERSE = [
  ["frxEURUSD", "frxGBPUSD"], ["frxEURUSD", "frxAUDUSD"], ["frxAUDUSD", "frxNZDUSD"],
  ["frxUSDCAD", "frxUSDCHF"], ["frxEURJPY", "frxUSDJPY"], ["frxAUDJPY", "frxNZDJPY"],
  ["frxGBPUSD", "frxAUDUSD"], ["frxEURJPY", "frxAUDJPY"], ["frxUSDJPY", "frxAUDJPY"],
  ["frxEURUSD", "frxUSDCHF"], ["frxEURGBP", "frxEURUSD"], ["frxGBPJPY", "frxEURJPY"],
  ["frxAUDUSD", "frxUSDCAD"], ["frxNZDUSD", "frxUSDCAD"],
];
const WBETA = 300, WZ = 150, ENTRY = 2.0, EXIT = 0.5, STOP = 4.0, MAXBARS = 200, COSTX = Number(process.argv[3] ?? 2);

function alignedLogs(a, b, shiftB = 0) {
  const mb = new Map(); b.forEach((r, idx) => mb.set(r[0], Math.log(b[(idx + shiftB) % b.length][4])));
  const t = [], la = [], lb = [];
  for (const r of a) { const y = mb.get(r[0]); if (y != null) { t.push(r[0]); la.push(Math.log(r[4])); lb.push(y); } }
  return { t, la, lb };
}
function pairTrades(symA, symB, tf, from, to, shiftB = 0) {
  const A = resample(loadBars(dir, symA), tf), B = resample(loadBars(dir, symB), tf);
  const { t, la, lb } = alignedLogs(A, B, shiftB); const N = t.length; if (N < WBETA + WZ + 10) return [];
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
    const costLog = spA / priceA + Math.abs(beta) * spB / priceB;
    // CORRECT P&L: hold FIXED entry hedge ratio; P&L of short-spread = Δla − βΔlb
    // (alpha cancels; no beta drift). side=+1 shorted the spread (bet it falls).
    if (pend === "exit" && pos) { const pnl = pos.side * ((pos.laE - la[i]) - pos.betaE * (pos.lbE - lb[i])); out.push({ rr: (pnl - pos.cost) / pos.sd, entryT: pos.entryT, exitT: t[i] }); pos = null; pend = null; }
    else if (pend && pend.open && !pos) { pos = { side: pend.open.side, laE: la[i], lbE: lb[i], betaE: beta, sd: pend.open.sd, cost: costLog, entryT: t[i] }; since = 0; pend = null; }
    if (pos) { since++; if (Math.abs(z) <= EXIT || Math.abs(z) >= STOP || since >= MAXBARS) pend = "exit"; }
    else if (t[i] >= from && t[i] <= to && !pend) { if (z >= ENTRY) pend = { open: { side: +1, sd } }; else if (z <= -ENTRY) pend = { open: { side: -1, sd } }; }
  }
  return out;
}
const stat = (R) => { const n = R.length; if (!n) return { n: 0, exp: 0, t: 0, pf: 0, win: 0 }; const m = R.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(R.reduce((s, x) => s + (x - m) ** 2, 0) / n); const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0; const w = R.filter((x) => x > 0).length, gw = R.filter((x) => x > 0).reduce((s, x) => s + x, 0), gl = -R.filter((x) => x <= 0).reduce((s, x) => s + x, 0); return { n, exp: m, t, pf: gl > 0 ? gw / gl : 9, win: w / n * 100 }; };

const A0 = resample(loadBars(dir, "frxEURUSD"), 15); const t0 = A0[0][0], t1 = A0[A0.length - 1][0], split = t0 + (t1 - t0) * 0.62;

console.log(`\n=== STAT-ARB FALSIFICATION (cost×${COSTX}) ===\n`);
console.log(`1. DESYNC NULL — leg B shifted +5000 bars (cointegration destroyed). Edge MUST vanish if real.`);
let real = [], nullR = [];
for (const [a, b] of UNIVERSE) { real = real.concat(pairTrades(a, b, 15, split, t1, 0).map((x) => x.rr)); nullR = nullR.concat(pairTrades(a, b, 15, split, t1, 5000).map((x) => x.rr)); }
const sr = stat(real), sn = stat(nullR);
console.log(`   REAL pairs   holdout exp ${sr.exp.toFixed(3)}R  t=${sr.t.toFixed(2)}  PF ${sr.pf.toFixed(2)}  n=${sr.n}`);
console.log(`   DESYNC pairs holdout exp ${sn.exp.toFixed(3)}R  t=${sn.t.toFixed(2)}  PF ${sn.pf.toFixed(2)}  n=${sn.n}   ${Math.abs(sn.t) < 2 ? "✓ edge VANISHED → real cointegration, not a bug" : "✗ edge persists → SUSPECT a harness bug"}`);

console.log(`\n2. M30 robustness (second timeframe):`);
const A30 = resample(loadBars(dir, "frxEURUSD"), 30); const u0 = A30[0][0], u1 = A30[A30.length - 1][0], usplit = u0 + (u1 - u0) * 0.62;
let m30 = []; for (const [a, b] of UNIVERSE) m30 = m30.concat(pairTrades(a, b, 30, usplit, u1, 0).map((x) => x.rr));
const s30 = stat(m30);
console.log(`   M30 holdout exp ${s30.exp.toFixed(3)}R  t=${s30.t.toFixed(2)}  PF ${s30.pf.toFixed(2)}  n=${s30.n}   ${s30.t > 3 ? "✓✓ holds" : s30.t > 2 ? "✓ holds" : "· weak"}`);

console.log(`\n3. CAPPED PORTFOLIO (max 5 concurrent positions; honest correlation-aware equity), M15 holdout:`);
let allTr = []; for (const [a, b] of UNIVERSE) allTr = allTr.concat(pairTrades(a, b, 15, split, t1, 0));
allTr.sort((x, y) => x.entryT - y.entryT);
for (const cap of [3, 5, 8]) for (const rp of [0.5, 1.0]) {
  let bal = 10000, peak = 10000, dd = 0; const open = []; const daily = new Map();
  for (const tr of allTr) {
    for (let k = open.length - 1; k >= 0; k--) if (open[k] <= tr.entryT) open.splice(k, 1);
    if (open.length >= cap) continue;
    open.push(tr.exitT);
    bal += tr.rr * (rp / 2 / 100) * bal; if (bal > peak) peak = bal; const d = (peak - bal) / peak; if (d > dd) dd = d;
    daily.set(Math.floor(tr.exitT / 86400), bal);
  }
  const eq = [...daily.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]); const rets = []; for (let i = 1; i < eq.length; i++) rets.push((eq[i] - eq[i - 1]) / eq[i - 1]);
  const mm = rets.reduce((s, x) => s + x, 0) / (rets.length || 1), sd = Math.sqrt(rets.reduce((s, x) => s + (x - mm) ** 2, 0) / (rets.length || 1));
  console.log(`   cap ${cap} @${rp}%/trade: net ${((bal - 10000) / 100).toFixed(1)}%  DD ${(dd * 100).toFixed(1)}%  Sharpe ${(sd > 0 ? mm / sd * Math.sqrt(252) : 0).toFixed(2)}`);
}
