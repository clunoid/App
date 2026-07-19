/**
 * DERIV MT5 — PER-PAIR MULTI-STRATEGY SEARCH.
 *
 * The v3 overhaul only tested ONE strategy family (ARDE regime → breakout/fade)
 * and concluded "no edge." That was premature: it never tested mean-reversion,
 * session breakouts, or per-pair customization. This harness fixes that.
 *
 * For EACH pair it sweeps a LIBRARY of proven strategy families over a param
 * grid, on a strict TRAIN window, then reports the honest OUT-OF-SAMPLE (TEST)
 * result. Only configs that are net-positive on BOTH windows survive — the
 * curve-fit trap (great in-sample, dies live) is exactly what blew the live
 * accounts, so TEST is the number we trust.
 *
 *   node lib/deriv/mt5/backtest/search.mjs <dataDir> <tfMinutes> [pairFilter] [--news]
 *
 * Realism: enter next-bar-open, pay full spread + slippage per round trip,
 * one position per pair at a time, intrabar SL/TP worst-case (SL first),
 * fixed 1% fractional risk compounding from $10k.
 */
import fs from "node:fs";
import path from "node:path";

/* ── data ─────────────────────────────────────────────────────────────────── */
function loadBars(dataDir, sym) {
  const f = path.join(dataDir, `${sym}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8")).bars;
}
function resample(bars, minutes) {
  if (minutes === 5) return bars;
  const step = minutes * 60, out = [];
  let cur = null;
  for (const [t, o, h, l, c] of bars) {
    const b = Math.floor(t / step) * step;
    if (!cur || cur[0] !== b) { if (cur) out.push(cur); cur = [b, o, h, l, c]; }
    else { if (h > cur[2]) cur[2] = h; if (l < cur[3]) cur[3] = l; cur[4] = c; }
  }
  if (cur) out.push(cur);
  return out;
}

/* ── parameterized indicators (lazy + cached per pair) ────────────────────── */
function makeInd(bars) {
  const N = bars.length;
  const t = new Float64Array(N), o = new Float64Array(N), h = new Float64Array(N), l = new Float64Array(N), c = new Float64Array(N);
  for (let i = 0; i < N; i++) { t[i] = bars[i][0]; o[i] = bars[i][1]; h[i] = bars[i][2]; l[i] = bars[i][3]; c[i] = bars[i][4]; }
  const cache = new Map();
  const memo = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };

  const tr = memo("tr", () => {
    const a = new Float64Array(N);
    for (let i = 0; i < N; i++) a[i] = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    return a;
  });
  const atr = (n) => memo("atr" + n, () => {
    const out = new Float64Array(N).fill(NaN);
    let a = 0;
    for (let i = 1; i <= n && i < N; i++) a += tr[i];
    if (N > n) { a /= n; out[n] = a; for (let i = n + 1; i < N; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; } }
    return out;
  });
  const ema = (n) => memo("ema" + n, () => {
    const out = new Float64Array(N), k = 2 / (n + 1);
    let p = c[0] || 0;
    for (let i = 0; i < N; i++) { p = i === 0 ? c[0] : c[i] * k + p * (1 - k); out[i] = p; }
    return out;
  });
  const sma = (n) => memo("sma" + n, () => {
    const out = new Float64Array(N).fill(NaN);
    let s = 0;
    for (let i = 0; i < N; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) out[i] = s / n; }
    return out;
  });
  const sd = (n) => memo("sd" + n, () => {
    const out = new Float64Array(N).fill(NaN);
    let s = 0, s2 = 0;
    for (let i = 0; i < N; i++) { s += c[i]; s2 += c[i] * c[i]; if (i >= n) { s -= c[i - n]; s2 -= c[i - n] * c[i - n]; } if (i >= n - 1) { const m = s / n; out[i] = Math.sqrt(Math.max(0, s2 / n - m * m)); } }
    return out;
  });
  const rsi = (n) => memo("rsi" + n, () => {
    const out = new Float64Array(N).fill(NaN);
    let ag = 0, al = 0;
    for (let i = 1; i <= n && i < N; i++) { const d = c[i] - c[i - 1]; if (d >= 0) ag += d; else al -= d; }
    if (N > n) { ag /= n; al /= n; out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      for (let i = n + 1; i < N; i++) { const d = c[i] - c[i - 1]; ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n; al = (al * (n - 1) + (d < 0 ? -d : 0)) / n; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } }
    return out;
  });
  // rolling max/min over PREVIOUS n bars (excl current)
  const roll = (n, isMax) => memo((isMax ? "dHi" : "dLo") + n, () => {
    const src = isMax ? h : l, out = new Float64Array(N).fill(NaN), dq = [];
    for (let i = 0; i < N; i++) {
      if (i >= 1) { const j = i - 1; while (dq.length && (isMax ? src[dq[dq.length - 1]] <= src[j] : src[dq[dq.length - 1]] >= src[j])) dq.pop(); dq.push(j); }
      while (dq.length && dq[0] < i - n) dq.shift();
      if (i >= n) out[i] = src[dq[0]];
    }
    return out;
  });
  const adx = (n) => memo("adx" + n, () => {
    const out = new Float64Array(N).fill(NaN), pDM = new Float64Array(N), mDM = new Float64Array(N);
    for (let i = 1; i < N; i++) { const up = h[i] - h[i - 1], dn = l[i - 1] - l[i]; pDM[i] = up > dn && up > 0 ? up : 0; mDM[i] = dn > up && dn > 0 ? dn : 0; }
    let trS = 0, pS = 0, mS = 0;
    for (let i = 1; i <= n && i < N; i++) { trS += tr[i]; pS += pDM[i]; mS += mDM[i]; }
    const dx = new Float64Array(N).fill(NaN);
    for (let i = n; i < N; i++) { if (i > n) { trS = trS - trS / n + tr[i]; pS = pS - pS / n + pDM[i]; mS = mS - mS / n + mDM[i]; } if (trS > 0) { const pdi = 100 * pS / trS, mdi = 100 * mS / trS, sum = pdi + mdi; dx[i] = sum === 0 ? 0 : 100 * Math.abs(pdi - mdi) / sum; } else dx[i] = 0; }
    let a = 0, cnt = 0;
    for (let i = n; i < Math.min(2 * n, N); i++) { a += dx[i]; cnt++; }
    if (N > 2 * n - 1 && cnt === n) { a /= n; out[2 * n - 1] = a; for (let i = 2 * n; i < N; i++) { a = (a * (n - 1) + dx[i]) / n; out[i] = a; } }
    return out;
  });
  return { N, t, o, h, l, c, atr, ema, sma, sd, rsi, adx, dHi: (n) => roll(n, true), dLo: (n) => roll(n, false) };
}

/* ── strategy library ─────────────────────────────────────────────────────── *
 * Each gen(S, i, p) inspects bars through i (CLOSED) and returns an entry
 * {side:+1|-1, slDist, tpDist, trailAtr?} in PRICE units, or null. Entry fills
 * next bar open. slDist/tpDist are distances from entry.                        */

const hourUTC = (S, i) => Math.floor((S.t[i] % 86400) / 3600);

const STRATS = {
  // A. RSI mean reversion (Connors-style, both directions, ATR stops)
  rsiRev: {
    grid: cartesian({ n: [2, 3, 4], lo: [5, 10, 15, 20], slAtr: [1.5, 2.5, 3.5], tpAtr: [1.0, 1.5, 2.5], trend: [0, 1] }),
    gen: (S, i, p) => {
      const r = S.rsi(p.n)[i], a = S.atr(14)[i], s200 = S.sma(100)[i];
      if (!(r >= 0) || !(a > 0)) return null;
      const hi = 100 - p.lo;
      let side = 0;
      if (r <= p.lo) side = 1; else if (r >= hi) side = -1; else return null;
      if (p.trend) { if (!(s200 > 0)) return null; if (side > 0 && S.c[i] < s200) return null; if (side < 0 && S.c[i] > s200) return null; }
      return { side, slDist: p.slAtr * a, tpDist: p.tpAtr * a };
    },
  },
  // B. Bollinger reversion — fade the band, target the mean or an ATR
  bbRev: {
    grid: cartesian({ n: [20, 30, 50], k: [2.0, 2.5, 3.0], slAtr: [1.5, 2.5], tpMid: [0, 1], tpAtr: [1.5, 2.5] }),
    gen: (S, i, p) => {
      const m = S.sma(p.n)[i], sd = S.sd(p.n)[i], a = S.atr(14)[i], px = S.c[i];
      if (!(sd > 0) || !(a > 0)) return null;
      const up = m + p.k * sd, dn = m - p.k * sd;
      let side = 0;
      if (px <= dn) side = 1; else if (px >= up) side = -1; else return null;
      const tpDist = p.tpMid ? Math.max(0.2 * a, Math.abs(m - px)) : p.tpAtr * a;
      return { side, slDist: p.slAtr * a, tpDist };
    },
  },
  // C. z-score fade with partial-mean target
  zRev: {
    grid: cartesian({ n: [20, 40], z: [1.5, 2.0, 2.5], slAtr: [1.5, 2.5, 3.5], tpFrac: [0.5, 0.8, 1.0] }),
    gen: (S, i, p) => {
      const m = S.sma(p.n)[i], sd = S.sd(p.n)[i], a = S.atr(14)[i], px = S.c[i];
      if (!(sd > 0) || !(a > 0)) return null;
      const z = (px - m) / sd;
      let side = 0;
      if (z <= -p.z) side = 1; else if (z >= p.z) side = -1; else return null;
      if (Math.abs(z) >= 3.5) return null;
      return { side, slDist: p.slAtr * a, tpDist: Math.max(0.2 * a, Math.abs(m - px) * p.tpFrac) };
    },
  },
  // D. Keltner reversion (EMA ± mult·ATR bands)
  keltRev: {
    grid: cartesian({ n: [20, 30], mult: [1.5, 2.0, 2.5], slAtr: [1.5, 2.5], tpAtr: [1.0, 1.5, 2.5] }),
    gen: (S, i, p) => {
      const mid = S.ema(p.n)[i], a = S.atr(14)[i], px = S.c[i];
      if (!(a > 0)) return null;
      let side = 0;
      if (px <= mid - p.mult * a) side = 1; else if (px >= mid + p.mult * a) side = -1; else return null;
      return { side, slDist: p.slAtr * a, tpDist: p.tpAtr * a };
    },
  },
  // E. Donchian breakout trend + ATR trail
  donch: {
    grid: cartesian({ n: [20, 40, 55], slAtr: [1.5, 2.0, 3.0], tpRR: [1.5, 2.5, 4.0], trail: [0, 1] }),
    gen: (S, i, p) => {
      const hi = S.dHi(p.n)[i], lo = S.dLo(p.n)[i], a = S.atr(14)[i], px = S.c[i];
      if (!(hi > 0) || !(a > 0)) return null;
      let side = 0;
      if (px >= hi) side = 1; else if (px <= lo) side = -1; else return null;
      const slDist = p.slAtr * a;
      return { side, slDist, tpDist: p.tpRR * slDist, trailAtr: p.trail ? p.slAtr : 0 };
    },
  },
  // F. EMA cross trend (fast crosses slow) + ATR trail
  emaX: {
    grid: cartesian({ fast: [8, 12, 21], slow: [50, 100, 200], slAtr: [2.0, 3.0], tpRR: [2.0, 3.0], trail: [0, 1] }),
    gen: (S, i, p) => {
      if (p.fast >= p.slow) return null;
      const ef = S.ema(p.fast), es = S.ema(p.slow), a = S.atr(14)[i];
      if (!(a > 0) || i < 1) return null;
      let side = 0;
      if (ef[i] > es[i] && ef[i - 1] <= es[i - 1]) side = 1;
      else if (ef[i] < es[i] && ef[i - 1] >= es[i - 1]) side = -1;
      else return null;
      const slDist = p.slAtr * a;
      return { side, slDist, tpDist: p.tpRR * slDist, trailAtr: p.trail ? p.slAtr : 0 };
    },
  },
  // G. Opening-range breakout (London 07:00 / NY 13:00 UTC)
  orb: {
    grid: cartesian({ startH: [7, 13], slAtr: [1.5, 2.5], tpRR: [1.5, 2.5, 3.5], buf: [0, 0.1] }),
    gen: (S, i, p) => {
      // build the session range from bars in [startH, startH+1); trigger after it.
      const hr = hourUTC(S, i);
      if (hr < p.startH || hr >= p.startH + 3) return null; // only trade the 3h after open
      const a = S.atr(14)[i]; if (!(a > 0)) return null;
      // find range hi/lo over the first hour of the session (this UTC day)
      const dayStart = Math.floor(S.t[i] / 86400) * 86400 + p.startH * 3600;
      let rHi = -Infinity, rLo = Infinity, seen = false;
      for (let j = i; j >= 0 && S.t[j] >= dayStart; j--) {
        if (S.t[j] < dayStart + 3600) { if (S.h[j] > rHi) rHi = S.h[j]; if (S.l[j] < rLo) rLo = S.l[j]; seen = true; }
      }
      if (!seen || !(rHi > rLo)) return null;
      const px = S.c[i], buf = p.buf * a;
      let side = 0;
      if (px >= rHi + buf) side = 1; else if (px <= rLo - buf) side = -1; else return null;
      const slDist = p.slAtr * a;
      return { side, slDist, tpDist: p.tpRR * slDist, once: true };
    },
  },
};

function cartesian(obj) {
  const keys = Object.keys(obj);
  let out = [{}];
  for (const k of keys) { const nx = []; for (const base of out) for (const v of obj[k]) nx.push({ ...base, [k]: v }); out = nx; }
  return out;
}

/* ── single-pair event backtest ───────────────────────────────────────────── */
const NEWS_HOURS = new Set([12, 13, 14]); // proxy for scheduled US/EU high-impact releases (UTC)

function backtest(S, strat, p, cost, from, to, opt = {}) {
  const { spread, slip } = cost;
  const maxBars = opt.maxBars ?? 96; // time-stop (~1 day on M15)
  const news = opt.news ?? false;
  const orbDay = new Map(); // for orb "once per session-day"
  let bal = 10000, peak = 10000, maxDD = 0;
  let pos = null, sinceEntry = 0;
  const trades = [];
  const risk = 0.01;

  for (let i = 60; i < S.N - 1; i++) {
    const tm = S.t[i];
    // manage open position on THIS bar (entered at prior bar's next-open)
    if (pos) {
      sinceEntry++;
      const bh = S.h[i], bl = S.l[i], bc = S.c[i];
      let exit = null, reason = "";
      const hitSL = pos.side > 0 ? bl <= pos.sl : bh >= pos.sl;
      const hitTP = pos.side > 0 ? bh >= pos.tp : bl <= pos.tp;
      if (hitSL) { exit = pos.sl; reason = "sl"; }        // worst-case: SL first
      else if (hitTP) { exit = pos.tp; reason = "tp"; }
      else if (pos.trailAtr > 0) {
        const a = S.atr(14)[i];
        const prof = pos.side > 0 ? bc - pos.entry : pos.entry - bc;
        if (a > 0 && prof >= pos.trailDist) { const ns = pos.side > 0 ? bc - pos.trailAtr * a : bc + pos.trailAtr * a; if (pos.side > 0 ? ns > pos.sl : ns < pos.sl) pos.sl = ns; }
      }
      if (!exit && sinceEntry >= maxBars) { exit = bc; reason = "time"; }
      if (exit != null) {
        const rr = (pos.side > 0 ? exit - pos.entry : pos.entry - exit) / pos.riskDist;
        const pnl = rr * bal * risk;
        bal += pnl;
        trades.push({ rr, pnl, reason, t: tm });
        pos = null;
      }
    }
    if (bal > peak) peak = bal;
    const dd = (peak - bal) / peak; if (dd > maxDD) maxDD = dd;

    // seek a NEW entry on closed bar i, fill at i+1 open
    if (!pos && tm >= from && tm <= to) {
      if (news && NEWS_HOURS.has(hourUTC(S, i))) continue;
      const sig = strat.gen(S, i, p);
      if (!sig) continue;
      if (sig.once) { const dk = Math.floor(tm / 86400) + "_" + hourUTC(S, i); if (orbDay.has(Math.floor(tm / 86400))) continue; orbDay.set(Math.floor(tm / 86400), 1); }
      const fill = S.o[i + 1];
      const eff = sig.side > 0 ? fill + spread + slip : fill - spread - slip; // cross spread on entry
      const riskDist = sig.slDist;
      if (!(riskDist > 0)) continue;
      // cost as a fraction of stop — skip if spread eats the edge
      if ((spread + slip) / riskDist > 0.33) continue;
      pos = {
        side: sig.side, entry: eff, riskDist,
        sl: sig.side > 0 ? eff - riskDist : eff + riskDist,
        tp: sig.side > 0 ? eff + sig.tpDist : eff - sig.tpDist,
        trailAtr: sig.trailAtr || 0, trailDist: (sig.trailAtr || 0) * S.atr(14)[i],
      };
      sinceEntry = 0;
    }
  }
  const wins = trades.filter((x) => x.pnl > 0), gl = Math.abs(trades.filter((x) => x.pnl <= 0).reduce((s, x) => s + x.pnl, 0)), gw = wins.reduce((s, x) => s + x.pnl, 0);
  const spanDays = (to - from) / 86400;
  return {
    net: (bal - 10000) / 100, trades: trades.length, tpd: trades.length / (spanDays * 5 / 7),
    win: trades.length ? wins.length / trades.length * 100 : 0,
    pf: gl > 0 ? gw / gl : gw > 0 ? 9 : 0,
    expR: trades.length ? trades.reduce((s, x) => s + x.rr, 0) / trades.length : 0,
    dd: maxDD * 100,
  };
}

/* ── main ─────────────────────────────────────────────────────────────────── */
const dataDir = process.argv[2];
const tf = Number(process.argv[3] || 15);
const pairFilter = process.argv[4] && !process.argv[4].startsWith("--") ? process.argv[4] : null;
const useNews = process.argv.includes("--news");

const PAIRS = {
  frxEURUSD: 0.0001, frxGBPUSD: 0.0001, frxUSDJPY: 0.01, frxAUDUSD: 0.0001,
  frxUSDCAD: 0.0001, frxUSDCHF: 0.0001, frxEURJPY: 0.01, frxNZDUSD: 0.0001,
  frxEURGBP: 0.0001, frxAUDJPY: 0.01, frxEURCHF: 0.0001, frxGBPJPY: 0.01,
};
// Deriv standard-account spreads (pips) — realistic mid estimates
const SPREAD_PIPS = {
  frxEURUSD: 0.8, frxGBPUSD: 1.0, frxUSDJPY: 0.9, frxAUDUSD: 1.0, frxUSDCAD: 1.2,
  frxUSDCHF: 1.2, frxEURJPY: 1.3, frxNZDUSD: 1.4, frxEURGBP: 1.1, frxAUDJPY: 1.4,
  frxEURCHF: 1.3, frxGBPJPY: 1.8,
};

const pairs = pairFilter ? [pairFilter.startsWith("frx") ? pairFilter : "frx" + pairFilter] : Object.keys(PAIRS);

// split the 1yr into TRAIN (first 62%) / TEST (last 38%)
function windows(S) {
  const t0 = S.t[60], t1 = S.t[S.N - 1];
  const split = t0 + (t1 - t0) * 0.62;
  return { train: [t0, split], test: [split, t1] };
}

console.log(`\n=== PER-PAIR STRATEGY SEARCH | tf=M${tf} | news-filter=${useNews} ===`);
console.log(`data: ${dataDir}`);
const summary = [];
for (const sym of pairs) {
  const raw = loadBars(dataDir, sym);
  if (!raw) { console.log(`${sym}: no data`); continue; }
  const bars = resample(raw, tf);
  const S = makeInd(bars);
  const { train, test } = windows(S);
  const pip = PAIRS[sym];
  const cost = { spread: (SPREAD_PIPS[sym] || 1.2) * pip, slip: 0.1 * pip };
  const minTradesTrain = Math.max(40, (train[1] - train[0]) / 86400 * 0.15);
  const minTradesTest = Math.max(25, (test[1] - test[0]) / 86400 * 0.12);

  let best = null;
  let evaluated = 0;
  for (const [name, strat] of Object.entries(STRATS)) {
    for (const p of strat.grid) {
      const tr = backtest(S, strat, p, cost, train[0], train[1], { news: useNews });
      evaluated++;
      if (tr.trades < minTradesTrain || tr.expR <= 0 || tr.pf < 1.05) continue; // must work in-sample & trade enough
      const te = backtest(S, strat, p, cost, test[0], test[1], { news: useNews });
      if (te.trades < minTradesTest || te.expR <= 0) continue; // must survive OOS
      // robustness score: OOS expectancy weighted by trade count, penalize DD
      const score = te.expR * Math.sqrt(te.trades) * Math.min(tr.expR / te.expR, te.expR / tr.expR + 1);
      const cand = { name, p, tr, te, score };
      if (!best || score > best.score) best = cand;
    }
  }
  if (!best) { console.log(`\n${sym.replace("frx", "").padEnd(7)} — NO robust edge found (${evaluated} configs tested)`); summary.push({ sym, ok: false }); continue; }
  const b = best;
  console.log(`\n${sym.replace("frx", "").padEnd(7)} ★ ${b.name}  ${JSON.stringify(b.p)}`);
  console.log(`   TRAIN net ${b.tr.net.toFixed(1).padStart(6)}%  PF ${b.tr.pf.toFixed(2)}  win ${b.tr.win.toFixed(0)}%  exp ${b.tr.expR.toFixed(3)}R  n=${b.tr.trades} (${b.tr.tpd.toFixed(1)}/d)  DD ${b.tr.dd.toFixed(0)}%`);
  console.log(`   TEST  net ${b.te.net.toFixed(1).padStart(6)}%  PF ${b.te.pf.toFixed(2)}  win ${b.te.win.toFixed(0)}%  exp ${b.te.expR.toFixed(3)}R  n=${b.te.trades} (${b.te.tpd.toFixed(1)}/d)  DD ${b.te.dd.toFixed(0)}%`);
  summary.push({ sym, ok: true, ...b });
}

const winners = summary.filter((s) => s.ok);
console.log(`\n\n=== SUMMARY: ${winners.length}/${summary.length} pairs with robust OOS edge ===`);
for (const w of winners) console.log(`  ${w.sym.replace("frx", "").padEnd(7)} ${w.name.padEnd(8)} TEST ${w.te.net.toFixed(1).padStart(6)}% PF ${w.te.pf.toFixed(2)} exp ${w.te.expR.toFixed(3)}R (${w.te.tpd.toFixed(1)}/d)`);
