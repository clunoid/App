/**
 * DERIV MT5 — HONEST nested-holdout validation.
 *
 * The first pass (validate.mjs → portfolio.mjs) picked which pairs and which
 * timeframe to ship using the SAME test window it then reported — survivorship
 * bias (an adversarial audit confirmed it via 3 independent reviewers). This
 * rebuild removes that:
 *
 *   TRAIN   [0 , 0.55)  — optimise each family's params (params chosen here only)
 *   SELECT  [0.55,0.75) — choose family + timeframe + which pairs to include
 *   HOLDOUT [0.75,1.0]  — evaluate the assembled portfolio EXACTLY ONCE
 *
 * HOLDOUT is never read by any decision, so its number is a genuine out-of-
 * sample estimate. Also fixes the cost realism the audit flagged:
 *   • GAP-THROUGH fills — if a bar OPENS beyond the stop/target (weekend /
 *     rollover / news gap) the fill is at the open, not the stop → real >1R tails.
 *   • OVERNIGHT SWAP — a per-night financing debit (triple Wednesday), charged as
 *     a cost in both directions (conservative).
 *   • One unified time-stop (MAXBARS) used here AND in the live EA.
 *   • The (spread+slip)/stop cost gate that live must also apply.
 *
 *   node lib/deriv/mt5/backtest/honest.mjs <dataDir> [risk%]
 */
import { STRATS, makeInd, loadBars, resample } from "./search-lib.mjs";

const dataDir = process.argv[2];
const riskPct = Number(process.argv[3]) || 1.0;

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
const CLUSTER = {
  frxEURJPY: "JPY", frxUSDJPY: "JPY", frxAUDJPY: "JPY", frxGBPJPY: "JPY",
  frxUSDCAD: "CAD", frxGBPUSD: "GBP", frxEURUSD: "EUR", frxEURGBP: "EUR",
  frxEURCHF: "EUR", frxAUDUSD: "AUD", frxNZDUSD: "NZD", frxUSDCHF: "CHF",
};
const TF_SET = [15, 30];           // timeframe candidates (chosen on SELECT)
const MAXBARS = 48;                // unified time-stop (also in strategy.ts)
const SWAP_PIPS = 0.5;             // per-night financing debit (triple Wed); conservative cost
const COST_GATE = 0.33;            // skip if (spread+slip)/stop exceeds this
const MAX_OPEN_RISK = riskPct * 3.5, CORR_CAP = riskPct * 2, DAILY_HALT = riskPct * 4;

const hourUTC = (t) => Math.floor((t % 86400) / 3600);
/** Count rollover (21:00 UTC) crossings in (t0,t1], triple on Wednesday. */
function nightsHeld(t0, t1) {
  let n = 0;
  let mark = Math.ceil((t0 - 21 * 3600) / 86400) * 86400 + 21 * 3600;
  while (mark <= t1) { n += new Date(mark * 1000).getUTCDay() === 3 ? 3 : 1; mark += 86400; }
  return n;
}

/** Single-pair sim with gap-through fills + swap. Returns per-trade + metrics. */
function simPair(S, genFn, p, cost, from, to) {
  const { spread, slip, pip } = cost;
  let bal = 10000, peak = 10000, maxDD = 0, pos = null, since = 0;
  const trades = [];
  for (let i = 60; i < S.N - 1; i++) {
    const tm = S.t[i];
    if (pos) {
      since++;
      const o = S.o[i], h = S.h[i], l = S.l[i], c = S.c[i];
      let exit = null;
      if (pos.side > 0) {
        if (o <= pos.sl) exit = o;          // gapped down through stop → fill at open (worse)
        else if (o >= pos.tp) exit = o;     // gapped up through target
        else if (l <= pos.sl) exit = pos.sl;
        else if (h >= pos.tp) exit = pos.tp;
      } else {
        if (o >= pos.sl) exit = o;
        else if (o <= pos.tp) exit = o;
        else if (h >= pos.sl) exit = pos.sl;
        else if (l <= pos.tp) exit = pos.tp;
      }
      if (exit == null && since >= MAXBARS) exit = c;
      if (exit != null) {
        const rawR = (pos.side > 0 ? exit - pos.entry : pos.entry - exit) / pos.riskDist;
        const swapR = nightsHeld(pos.entryT, tm) * SWAP_PIPS * pip / pos.riskDist;
        const rr = rawR - swapR;
        bal += rr * bal * 0.01;
        trades.push({ rr, pnl: rr, reason: exit === pos.sl ? "sl" : exit === pos.tp ? "tp" : "gap/time", exitT: tm, entryT: pos.entryT });
        pos = null;
      }
    }
    if (bal > peak) peak = bal;
    const dd = (peak - bal) / peak; if (dd > maxDD) maxDD = dd;

    if (!pos && tm >= from && tm <= to) {
      const sig = genFn(S, i, p);
      if (!sig) continue;
      const fill = S.o[i + 1];
      const eff = sig.side > 0 ? fill + spread + slip : fill - spread - slip; // fill next open, re-anchor SL/TP to fill
      const riskDist = sig.slDist;
      if (!(riskDist > 0) || (spread + slip) / riskDist > COST_GATE) continue;
      pos = { side: sig.side, entry: eff, riskDist, sl: sig.side > 0 ? eff - riskDist : eff + riskDist, tp: sig.side > 0 ? eff + sig.tpDist : eff - sig.tpDist, entryT: S.t[i + 1] };
      since = 0;
    }
  }
  const wins = trades.filter((x) => x.rr > 0), gl = Math.abs(trades.filter((x) => x.rr <= 0).reduce((s, x) => s + x.rr, 0)), gw = wins.reduce((s, x) => s + x.rr, 0);
  const days = (to - from) / 86400 * 5 / 7;
  return { trades, net: (bal - 10000) / 100, n: trades.length, tpd: trades.length / Math.max(1, days), win: trades.length ? wins.length / trades.length * 100 : 0, pf: gl > 0 ? gw / gl : gw > 0 ? 9 : 0, expR: trades.length ? trades.reduce((s, x) => s + x.rr, 0) / trades.length : 0, dd: maxDD * 100 };
}

function familyKey(name) { return name; }
const genOf = (name) => STRATS[name].gen;

// ── build per-pair models on each TF; split windows from the M30 clock ──────
const chosen = {}; // sym -> {tf, name, p, sel}
const perPairSeries = {}; // `${sym}@${tf}` -> S

console.log(`\n=== HONEST NESTED-HOLDOUT VALIDATION | risk ${riskPct}%/trade | maxBars ${MAXBARS} | swap ${SWAP_PIPS}pip/night ===`);
console.log(`TRAIN[0,0.55) params · SELECT[0.55,0.75) family+TF+pairs · HOLDOUT[0.75,1] once\n`);

for (const sym of Object.keys(PAIRS)) {
  const raw = loadBars(dataDir, sym);
  if (!raw) { console.log(`${sym}: no data`); continue; }
  const pip = PAIRS[sym];
  const cost = { spread: (SPREAD_PIPS[sym] || 1.2) * pip, slip: 0.1 * pip, pip };

  let best = null;
  for (const tf of TF_SET) {
    const S = makeInd(resample(raw, tf));
    perPairSeries[`${sym}@${tf}`] = S;
    const t0 = S.t[60], t1 = S.t[S.N - 1];
    const trainW = [t0, t0 + (t1 - t0) * 0.55];
    const selW = [t0 + (t1 - t0) * 0.55, t0 + (t1 - t0) * 0.75];
    const minTr = Math.max(30, (trainW[1] - trainW[0]) / 86400 * 0.12);
    const minSel = Math.max(12, (selW[1] - selW[0]) / 86400 * 0.10);

    for (const name of Object.keys(STRATS)) {
      const gen = genOf(name);
      // params chosen on TRAIN only
      let pbest = null;
      for (const p of STRATS[name].grid) {
        const tr = simPair(S, gen, p, cost, trainW[0], trainW[1]);
        if (tr.n < minTr || tr.expR <= 0 || tr.pf < 1.05) continue;
        const sc = tr.expR * Math.sqrt(tr.n);
        if (!pbest || sc > pbest.sc) pbest = { p, tr, sc };
      }
      if (!pbest) continue;
      // family + TF chosen on SELECT
      const sel = simPair(S, gen, pbest.p, cost, selW[0], selW[1]);
      if (sel.n < minSel || sel.net <= 0 || sel.expR <= 0) continue;
      const selScore = sel.expR * Math.sqrt(sel.n);
      if (!best || selScore > best.selScore) best = { tf, name, p: pbest.p, sel, selScore, S };
    }
  }
  if (!best) { console.log(`${sym.replace("frx", "").padEnd(7)} — no SELECT-positive system (excluded)`); continue; }
  chosen[sym] = { tf: best.tf, name: best.name, p: best.p, sel: best.sel };
  console.log(`${sym.replace("frx", "").padEnd(7)} ✓ include  M${best.tf} ${best.name.padEnd(7)} SELECT net ${best.sel.net.toFixed(1)}% pf ${best.sel.pf.toFixed(2)} exp ${best.sel.expR.toFixed(3)}R n=${best.sel.n}  ${JSON.stringify(best.p)}`);
}

// ── assemble the portfolio and evaluate ONCE on HOLDOUT ─────────────────────
const syms = Object.keys(chosen);
if (!syms.length) { console.log("\nNo pairs selected — nothing to ship."); process.exit(0); }

function pairTradesHoldout(sym) {
  const c = chosen[sym];
  const S = perPairSeries[`${sym}@${c.tf}`];
  const t0 = S.t[60], t1 = S.t[S.N - 1];
  const ho = [t0 + (t1 - t0) * 0.75, t1];
  const pip = PAIRS[sym];
  const cost = { spread: (SPREAD_PIPS[sym] || 1.2) * pip, slip: 0.1 * pip, pip };
  return simPair(S, genOf(c.name), c.p, cost, ho[0], ho[1]).trades.map((tr) => ({ ...tr, sym }));
}

function runPortfolio(riskP) {
  let all = [];
  for (const sym of syms) all = all.concat(pairTradesHoldout(sym));
  all.sort((a, b) => a.entryT - b.entryT);
  let bal = 10000, peak = 10000, maxDD = 0;
  const open = [];
  let dayKey = 0, dayStart = 10000, halted = false;
  const taken = [], dailyEq = new Map();
  const MOR = riskP * 3.5, CC = riskP * 2, DH = riskP * 4;
  for (const tr of all) {
    for (let k = open.length - 1; k >= 0; k--) if (open[k].exitT <= tr.entryT) open.splice(k, 1);
    const dk = Math.floor(tr.entryT / 86400);
    if (dk !== dayKey) { dayKey = dk; dayStart = bal; halted = false; }
    if (halted) continue;
    const totalOpen = open.reduce((s, x) => s + x.riskP, 0);
    const clusOpen = open.filter((x) => CLUSTER[x.sym] === CLUSTER[tr.sym]).reduce((s, x) => s + x.riskP, 0);
    if (totalOpen + riskP > MOR + 1e-9) continue;
    if (clusOpen + riskP > CC + 1e-9) continue;
    const pnl = tr.rr * bal * (riskP / 100);
    bal += pnl;
    open.push({ sym: tr.sym, exitT: tr.exitT, riskP });
    taken.push({ ...tr, pnl });
    if (bal > peak) peak = bal;
    const dd = (peak - bal) / peak; if (dd > maxDD) maxDD = dd;
    if ((bal - dayStart) / dayStart * 100 <= -DH) halted = true;
    dailyEq.set(dk, bal);
  }
  const wins = taken.filter((x) => x.pnl > 0), gl = Math.abs(taken.filter((x) => x.pnl <= 0).reduce((s, x) => s + x.pnl, 0)), gw = wins.reduce((s, x) => s + x.pnl, 0);
  const eq = [...dailyEq.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const rets = []; for (let i = 1; i < eq.length; i++) rets.push((eq[i] - eq[i - 1]) / eq[i - 1]);
  const mean = rets.reduce((s, x) => s + x, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length || 1));
  const sharpe = sd > 0 ? mean / sd * Math.sqrt(252) : 0;
  const bySym = {};
  for (const sym of syms) { const ts = taken.filter((x) => x.sym === sym); bySym[sym] = { n: ts.length, pnl: Math.round(ts.reduce((s, x) => s + x.pnl, 0)) }; }
  const days = eq.length;
  return { net: (bal - 10000) / 100, trades: taken.length, tpd: taken.length / Math.max(1, days * 5 / 7 || 1), win: taken.length ? wins.length / taken.length * 100 : 0, pf: gl > 0 ? gw / gl : 9, dd: maxDD * 100, sharpe, bySym };
}

console.log(`\n--- HOLDOUT (untouched) — the honest out-of-sample result ---`);
for (const r of [0.5, 1.0, 1.5]) {
  const res = runPortfolio(r);
  console.log(`\nrisk ${r}%/trade  net ${res.net.toFixed(1)}%  PF ${res.pf.toFixed(2)}  win ${res.win.toFixed(0)}%  DD ${res.dd.toFixed(1)}%  Sharpe ${res.sharpe.toFixed(2)}  trades ${res.trades} (${res.tpd.toFixed(1)}/d)`);
  console.log(`   bySym: ${Object.entries(res.bySym).map(([s, v]) => `${s.replace("frx", "")} ${v.pnl >= 0 ? "+" : ""}${v.pnl}(${v.n})`).join("  ")}`);
}
console.log(`\nCHOSEN CONFIGS: ${JSON.stringify(Object.fromEntries(Object.entries(chosen).map(([s, c]) => [s, { tf: c.tf, name: c.name, p: c.p }])))}`);
