/**
 * DERIV MT5 — PORTFOLIO backtest of the per-pair customized systems.
 *
 * Runs each pair's chosen strategy TOGETHER on a shared balance, over TRAIN and
 * (untouched) TEST, with realistic risk sizing, a total-open-risk cap, and a
 * daily-loss halt. This is the decisive go/no-go number: only ship if the
 * COMBINED out-of-sample equity is net-positive with tolerable drawdown while
 * trading continuously.
 *
 *   node lib/deriv/mt5/backtest/portfolio.mjs <dataDir> [risk%] [--news]
 */
import { STRATS, makeInd, loadBars, resample } from "./search-lib.mjs";

const dataDir = process.argv[2];
const riskPct = Number(process.argv[3]) || 1.0;
const useNews = process.argv.includes("--news");

// per-pair customized systems (from honest validation; each with its own TF)
const CONFIGS = {
  frxEURJPY: { tf: 30, name: "emaX",   p: { fast: 12, slow: 50, slAtr: 3, tpRR: 3, trail: 0 } },
  frxUSDCAD: { tf: 30, name: "rsiRev", p: { n: 3, lo: 20, slAtr: 1.5, tpAtr: 2.5, trend: 1 } },
  frxUSDJPY: { tf: 30, name: "emaX",   p: { fast: 8, slow: 50, slAtr: 2, tpRR: 3, trail: 0 } },
  frxAUDJPY: { tf: 30, name: "emaX",   p: { fast: 12, slow: 200, slAtr: 2, tpRR: 3, trail: 0 } },
  frxGBPUSD: { tf: 15, name: "emaX",   p: { fast: 12, slow: 200, slAtr: 3, tpRR: 3, trail: 0 } },
};
const PIP = { frxEURJPY: 0.01, frxUSDCAD: 0.0001, frxUSDJPY: 0.01, frxAUDJPY: 0.01, frxGBPUSD: 0.0001 };
const SPREAD_PIPS = { frxEURJPY: 1.3, frxUSDCAD: 1.2, frxUSDJPY: 0.9, frxAUDJPY: 1.4, frxGBPUSD: 1.0 };
const CLUSTER = { frxEURJPY: "JPY", frxUSDJPY: "JPY", frxAUDJPY: "JPY", frxUSDCAD: "USD", frxGBPUSD: "USD" };
const NEWS_HOURS = new Set([12, 13, 14]);
const MAX_OPEN_RISK = riskPct * 3.5;   // total simultaneous risk cap
const CORR_CAP = riskPct * 2;          // per-correlation-cluster cap
const DAILY_HALT = riskPct * 4;        // stop trading for the day past this loss
const MAX_BARS = Number(process.env.MAXBARS) || 96;

/** Replay a pair's system → list of trades with entry/exit epochs (no portfolio caps yet). */
function pairTrades(sym, from, to) {
  const cfg = CONFIGS[sym];
  const raw = loadBars(dataDir, sym);
  if (!raw) return [];
  const S = makeInd(resample(raw, cfg.tf));
  const strat = STRATS[cfg.name], p = cfg.p;
  const smult = Number(process.env.SPREADMULT) || 1;
  const pip = PIP[sym], spread = (SPREAD_PIPS[sym] || 1.2) * pip * smult, slip = 0.1 * pip * smult;
  const out = [];
  let pos = null, sinceEntry = 0;
  for (let i = 60; i < S.N - 1; i++) {
    const tm = S.t[i];
    if (pos) {
      sinceEntry++;
      const bh = S.h[i], bl = S.l[i], bc = S.c[i];
      let exit = null;
      const hitSL = pos.side > 0 ? bl <= pos.sl : bh >= pos.sl;
      const hitTP = pos.side > 0 ? bh >= pos.tp : bl <= pos.tp;
      if (hitSL) exit = pos.sl;
      else if (hitTP) exit = pos.tp;
      else if (pos.trailAtr > 0) { const a = S.atr(14)[i]; const prof = pos.side > 0 ? bc - pos.entry : pos.entry - bc; if (a > 0 && prof >= pos.trailDist) { const ns = pos.side > 0 ? bc - pos.trailAtr * a : bc + pos.trailAtr * a; if (pos.side > 0 ? ns > pos.sl : ns < pos.sl) pos.sl = ns; } }
      if (exit == null && sinceEntry >= MAX_BARS) exit = bc;
      if (exit != null) { const rr = (pos.side > 0 ? exit - pos.entry : pos.entry - exit) / pos.riskDist; out.push({ sym, entryT: pos.entryT, exitT: tm, rr }); pos = null; }
    }
    if (!pos && tm >= from && tm <= to) {
      if (useNews && NEWS_HOURS.has(Math.floor((tm % 86400) / 3600))) continue;
      const sig = strat.gen(S, i, p);
      if (!sig) continue;
      if (sig.once) { /* orb handled per-day inside gen callers; skip here */ }
      const fill = S.o[i + 1];
      const eff = sig.side > 0 ? fill + spread + slip : fill - spread - slip;
      const riskDist = sig.slDist;
      if (!(riskDist > 0) || (spread + slip) / riskDist > 0.33) continue;
      pos = { side: sig.side, entry: eff, riskDist, sl: sig.side > 0 ? eff - riskDist : eff + riskDist, tp: sig.side > 0 ? eff + sig.tpDist : eff - sig.tpDist, trailAtr: sig.trailAtr || 0, trailDist: (sig.trailAtr || 0) * S.atr(14)[i], entryT: S.t[i + 1] };
      sinceEntry = 0;
    }
  }
  return out;
}

/** Merge all pairs' trades on a shared balance with risk caps + daily halt. */
function runPortfolio(from, to) {
  let all = [];
  for (const sym of Object.keys(CONFIGS)) all = all.concat(pairTrades(sym, from, to));
  all.sort((a, b) => a.entryT - b.entryT);
  // event-drive by entry order; approximate open-risk via time overlap
  let bal = 10000, peak = 10000, maxDD = 0;
  const open = []; // {sym, exitT, riskPct}
  let dayKey = 0, dayStart = 10000, halted = false;
  const taken = [];
  const dailyEq = new Map();
  for (const tr of all) {
    // close positions that have exited before this entry
    for (let k = open.length - 1; k >= 0; k--) if (open[k].exitT <= tr.entryT) open.splice(k, 1);
    const dk = Math.floor(tr.entryT / 86400);
    if (dk !== dayKey) { dayKey = dk; dayStart = bal; halted = false; }
    if (halted) continue;
    // risk caps
    const totalOpen = open.reduce((s, x) => s + x.riskPct, 0);
    const clusOpen = open.filter((x) => CLUSTER[x.sym] === CLUSTER[tr.sym]).reduce((s, x) => s + x.riskPct, 0);
    if (totalOpen + riskPct > MAX_OPEN_RISK + 1e-9) continue;
    if (clusOpen + riskPct > CORR_CAP + 1e-9) continue;
    const pnl = tr.rr * bal * (riskPct / 100);
    bal += pnl;
    open.push({ sym: tr.sym, exitT: tr.exitT, riskPct });
    taken.push({ ...tr, pnl });
    if (bal > peak) peak = bal;
    const dd = (peak - bal) / peak; if (dd > maxDD) maxDD = dd;
    if ((bal - dayStart) / dayStart * 100 <= -DAILY_HALT) halted = true;
    dailyEq.set(dk, bal);
  }
  const wins = taken.filter((x) => x.pnl > 0), gl = Math.abs(taken.filter((x) => x.pnl <= 0).reduce((s, x) => s + x.pnl, 0)), gw = wins.reduce((s, x) => s + x.pnl, 0);
  const days = (to - from) / 86400 * 5 / 7;
  const bySym = {};
  for (const sym of Object.keys(CONFIGS)) { const ts = taken.filter((x) => x.sym === sym); bySym[sym] = { n: ts.length, pnl: Math.round(ts.reduce((s, x) => s + x.pnl, 0)) }; }
  // daily returns → rough annualized Sharpe
  const eq = [...dailyEq.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const rets = []; for (let i = 1; i < eq.length; i++) rets.push((eq[i] - eq[i - 1]) / eq[i - 1]);
  const mean = rets.reduce((s, x) => s + x, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length || 1));
  const sharpe = sd > 0 ? mean / sd * Math.sqrt(252) : 0;
  return { net: (bal - 10000) / 100, trades: taken.length, tpd: taken.length / Math.max(1, days), win: taken.length ? wins.length / taken.length * 100 : 0, pf: gl > 0 ? gw / gl : 9, dd: maxDD * 100, sharpe, bySym };
}

// windows from the first pair's data
const raw0 = loadBars(dataDir, "frxEURJPY");
const S0 = makeInd(resample(raw0, 30));
const t0 = S0.t[60], t1 = S0.t[S0.N - 1], split = t0 + (t1 - t0) * 0.62;

console.log(`\n=== PORTFOLIO BACKTEST | risk ${riskPct}%/trade | news=${useNews} | ${Object.keys(CONFIGS).length} pairs ===`);
for (const [tag, [a, b]] of [["FULL YEAR", [t0, t1]], ["TRAIN", [t0, split]], ["TEST (OOS)", [split, t1]]]) {
  const r = runPortfolio(a, b);
  console.log(`\n${tag.padEnd(11)} net ${r.net.toFixed(1).padStart(7)}%  PF ${r.pf.toFixed(2)}  win ${r.win.toFixed(0)}%  DD ${r.dd.toFixed(1)}%  Sharpe ${r.sharpe.toFixed(2)}  trades ${r.trades} (${r.tpd.toFixed(1)}/d)`);
  console.log(`            bySym: ${Object.entries(r.bySym).map(([s, v]) => `${s.replace("frx", "")} ${v.pnl >= 0 ? "+" : ""}${v.pnl}(${v.n})`).join("  ")}`);
}
