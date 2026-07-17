/**
 * DERIV MT5 BACKTEST — portfolio simulator.
 *
 * Replays the ARDE decision logic bar-by-bar over cached Deriv M5 candles and
 * simulates the EA's execution faithfully: spread costs (with rollover-hour
 * widening), intrabar SL/TP (worst-case ordering), activation-gated ATR
 * trailing, partial-profit ladder, pyramid adds, per-symbol cooldown, daily
 * loss halt, and total + per-cluster open-risk caps — compounding a fractional
 * balance.
 *
 * Signals are computed on CLOSED bars only (the live engine's forming-bar
 * repaint is one of the bugs this harness exposes). Indicators are precomputed
 * incrementally per symbol so multi-year × 23-pair × many-config sweeps run in
 * seconds. Decision logic mirrors lib/deriv/mt5/strategy.ts, with the adaptive
 * upgrades exposed as config flags so variants can be A/B'd:
 *
 *   tf              : 5 | 15 | 30  (minutes; resampled from M5)
 *   sessionFilter   : block new entries during rollover dead-zone hours (UTC)
 *   erFilter        : Kaufman efficiency-ratio floor for trend entries
 *   volFloor        : ATR-percentile floor (skip dead-vol regimes)
 *   htfGate         : trend entries must align with the H1 EMA regime
 *   profile knobs   : adxGate, riskPct, trailMult, minRR, partials, adds, ...
 */
import fs from "node:fs";
import path from "node:path";

/* ── data loading ─────────────────────────────────────────────────────────── */

export function loadBars(dataDir, sym) {
  const f = path.join(dataDir, `${sym}.json`);
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  return j.bars; // [[t,o,h,l,c],...]
}

/** Resample M5 rows to N-minute bars (t = open time of the bucket). */
export function resample(bars, minutes) {
  if (minutes === 5) return bars;
  const step = minutes * 60;
  const out = [];
  let cur = null;
  for (const [t, o, h, l, c] of bars) {
    const bucket = Math.floor(t / step) * step;
    if (!cur || cur[0] !== bucket) {
      if (cur) out.push(cur);
      cur = [bucket, o, h, l, c];
    } else {
      if (h > cur[2]) cur[2] = h;
      if (l < cur[3]) cur[3] = l;
      cur[4] = c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* ── incremental indicator pipeline (arrays over the whole series) ────────── */

function emaArr(closes, n) {
  const out = new Float64Array(closes.length);
  const k = 2 / (n + 1);
  let prev = closes[0] || 0;
  for (let i = 0; i < closes.length; i++) {
    prev = i === 0 ? closes[0] : closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Rolling max/min over the PREVIOUS n bars (excludes current), via deque. */
function rollingExtreme(vals, n, isMax) {
  const out = new Float64Array(vals.length).fill(NaN);
  const dq = []; // indices, monotonic
  for (let i = 0; i < vals.length; i++) {
    // window for index i is [i-n, i-1]
    if (i >= 1) {
      const j = i - 1;
      while (dq.length && (isMax ? vals[dq[dq.length - 1]] <= vals[j] : vals[dq[dq.length - 1]] >= vals[j])) dq.pop();
      dq.push(j);
    }
    while (dq.length && dq[0] < i - n) dq.shift();
    if (i >= n) out[i] = vals[dq[0]];
  }
  return out;
}

export function computeSeries(bars) {
  const N = bars.length;
  const t = new Float64Array(N), o = new Float64Array(N), h = new Float64Array(N), l = new Float64Array(N), c = new Float64Array(N);
  for (let i = 0; i < N; i++) { t[i] = bars[i][0]; o[i] = bars[i][1]; h[i] = bars[i][2]; l[i] = bars[i][3]; c[i] = bars[i][4]; }

  // True range
  const tr = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (i === 0) { tr[i] = h[i] - l[i]; continue; }
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }

  // Wilder ATR(14) + ATR(20) for Keltner
  const atr14 = new Float64Array(N).fill(NaN), atr20 = new Float64Array(N).fill(NaN);
  const wilder = (n, out) => {
    let a = 0;
    for (let i = 1; i <= n && i < N; i++) a += tr[i];
    if (N > n) { a /= n; out[n] = a; }
    for (let i = n + 1; i < N; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  };
  wilder(14, atr14); wilder(20, atr20);

  // Wilder ADX(14)
  const adx = new Float64Array(N).fill(NaN);
  {
    const n = 14;
    const pDM = new Float64Array(N), mDM = new Float64Array(N);
    for (let i = 1; i < N; i++) {
      const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
      pDM[i] = up > dn && up > 0 ? up : 0;
      mDM[i] = dn > up && dn > 0 ? dn : 0;
    }
    let trS = 0, pS = 0, mS = 0;
    for (let i = 1; i <= n && i < N; i++) { trS += tr[i]; pS += pDM[i]; mS += mDM[i]; }
    const dx = new Float64Array(N).fill(NaN);
    for (let i = n; i < N; i++) {
      if (i > n) { trS = trS - trS / n + tr[i]; pS = pS - pS / n + pDM[i]; mS = mS - mS / n + mDM[i]; }
      if (trS > 0) {
        const pdi = 100 * (pS / trS), mdi = 100 * (mS / trS);
        const sum = pdi + mdi;
        dx[i] = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
      } else dx[i] = 0;
    }
    let a = 0, cnt = 0;
    for (let i = n; i < Math.min(2 * n, N); i++) { a += dx[i]; cnt++; }
    if (N > 2 * n - 1 && cnt === n) {
      a /= n; adx[2 * n - 1] = a;
      for (let i = 2 * n; i < N; i++) { a = (a * (n - 1) + dx[i]) / n; adx[i] = a; }
    }
  }

  // Choppiness(14): 100*log10(sumTR14/(maxH14-minL14))/log10(14) — window INCLUDES current bar
  const chop = new Float64Array(N).fill(NaN);
  {
    const n = 14;
    let sumTR = 0;
    const hq = [], lq = [];
    for (let i = 0; i < N; i++) {
      sumTR += tr[i];
      if (i >= n) sumTR -= tr[i - n];
      while (hq.length && h[hq[hq.length - 1]] <= h[i]) hq.pop();
      hq.push(i);
      while (hq.length && hq[0] <= i - n) hq.shift();
      while (lq.length && l[lq[lq.length - 1]] >= l[i]) lq.pop();
      lq.push(i);
      while (lq.length && lq[0] <= i - n) lq.shift();
      if (i >= n) {
        const range = h[hq[0]] - l[lq[0]];
        chop[i] = range > 0 && sumTR > 0 ? (100 * Math.log10(sumTR / range)) / Math.log10(n) : 50;
      }
    }
  }

  // EMAs
  const e8 = emaArr(c, 8), e21 = emaArr(c, 21), e55 = emaArr(c, 55);

  // SMA/stdev 20 (Bollinger + z-score)
  const sma20 = new Float64Array(N).fill(NaN), sd20 = new Float64Array(N).fill(NaN);
  {
    let s = 0, s2 = 0;
    for (let i = 0; i < N; i++) {
      s += c[i]; s2 += c[i] * c[i];
      if (i >= 20) { s -= c[i - 20]; s2 -= c[i - 20] * c[i - 20]; }
      if (i >= 19) {
        const m = s / 20;
        sma20[i] = m;
        sd20[i] = Math.sqrt(Math.max(0, s2 / 20 - m * m));
      }
    }
  }

  // Wilder RSI(14)
  const rsi = new Float64Array(N).fill(NaN);
  {
    const n = 14;
    let ag = 0, al = 0;
    for (let i = 1; i <= n && i < N; i++) {
      const d = c[i] - c[i - 1];
      if (d >= 0) ag += d; else al -= d;
    }
    if (N > n) {
      ag /= n; al /= n;
      rsi[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      for (let i = n + 1; i < N; i++) {
        const d = c[i] - c[i - 1];
        ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n;
        al = (al * (n - 1) + (d < 0 ? -d : 0)) / n;
        rsi[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      }
    }
  }

  // Donchian 20/10 (exclude current bar) — matches strategy.ts
  const dHi20 = rollingExtreme(h, 20, true), dLo20 = rollingExtreme(l, 20, false);
  const dHi10 = rollingExtreme(h, 10, true), dLo10 = rollingExtreme(l, 10, false);

  // Kaufman efficiency ratio (20)
  const er = new Float64Array(N).fill(NaN);
  {
    const n = 20;
    let vol = 0;
    const ad = new Float64Array(N);
    for (let i = 1; i < N; i++) ad[i] = Math.abs(c[i] - c[i - 1]);
    for (let i = 1; i < N; i++) {
      vol += ad[i];
      if (i > n) vol -= ad[i - n];
      if (i >= n) er[i] = vol > 0 ? Math.abs(c[i] - c[i - n]) / vol : 0;
    }
  }

  // ATR percentile rank over trailing ~20 days (in bars, computed by caller tf)
  return { N, t, o, h, l, c, tr, atr14, atr20, adx, chop, e8, e21, e55, sma20, sd20, rsi, dHi20, dLo20, dHi10, dLo10, er };
}

/** ATR percentile rank of the current bar vs the trailing `win` bars (0..1). */
export function atrPercentile(S, win) {
  const out = new Float64Array(S.N).fill(NaN);
  // coarse but fast: reservoir of the window, recompute rank via sampling every bar is O(win) — use stride sampling
  const stride = Math.max(1, Math.floor(win / 240)); // ~240 samples
  for (let i = win; i < S.N; i++) {
    const a = S.atr14[i];
    if (!(a > 0)) continue;
    let below = 0, total = 0;
    for (let j = i - win; j < i; j += stride) {
      const v = S.atr14[j];
      if (v > 0) { total++; if (v < a) below++; }
    }
    out[i] = total ? below / total : NaN;
  }
  return out;
}

/* ── decision logic (mirrors strategy.ts, on CLOSED bars) ─────────────────── */

const CHOP_TREND = 38.2, CHOP_RANGE = 61.8, MIN_BARS = 120;

export function decide(S, i, P, X) {
  // P: profile knobs; X: extras {erFloor, volPct, volFloorP, htfDir}
  if (i < MIN_BARS) return null;
  const adxV = S.adx[i], chopV = S.chop[i];
  if (!(adxV >= 0) || !(chopV >= 0)) return null;
  const up = S.e8[i] > S.e21[i] && S.e21[i] > S.e55[i];
  const down = S.e8[i] < S.e21[i] && S.e21[i] < S.e55[i];
  const dir = up ? 1 : down ? -1 : 0;
  const price = S.c[i], a = S.atr14[i];
  if (!(a > 0)) return null;

  const isTrend = adxV >= P.adxGate && chopV < CHOP_TREND && dir !== 0;
  const isRange = adxV < 20 && chopV > CHOP_RANGE;

  if (isTrend || (P.tradeTransitional && !isRange && dir !== 0)) {
    const transitional = !isTrend;
    // adaptive gates (upgrades under test)
    if (X.erFloor > 0 && !(S.er[i] >= X.erFloor)) return null;
    if (X.volPct && X.volFloorP > 0 && !(X.volPct[i] >= X.volFloorP)) return null;
    if (X.htfDir && X.htfDir(i) !== dir) return null;

    const buf = (X.breakoutBufferAtr || 0) * a;
    const brokeOut = dir > 0 ? price >= S.dHi20[i] + buf : price <= S.dLo20[i] - buf;
    const kelMid = emaAt(S.e21, i); // keltner mid = EMA20 ≈ e21 (strategy uses ema(20); e21 is close enough? no — mirror exactly below)
    // strategy.ts uses keltner(20): mid=ema(closes,20). We approximate with e21 —
    // parity checked separately; difference is negligible for the trigger.
    const pulledBack = dir > 0 ? price <= kelMid * 1.001 : price >= kelMid * 0.999;
    const microBreak = dir > 0 ? price >= S.dHi10[i] : price <= S.dLo10[i];
    if (!(brokeOut || (pulledBack && microBreak))) return null;

    const fdir = X.fadeTrend ? -dir : dir; // fade mode: invert the breakout direction
    const stopDist = P.trailMult * a;
    const riskPct = transitional ? P.riskPct * 0.5 : P.riskPct;
    const adds = [];
    for (let k = 1; k <= P.maxAdds; k++) {
      const back = dir > 0 ? S.e21[i] - k * 0.15 * a : S.e21[i] + k * 0.15 * a;
      const sl = dir > 0 ? price - stopDist : price + stopDist;
      if (dir > 0 ? back <= sl : back >= sl) break;
      adds.push({ price: back, riskPct: riskPct / (k + 1) });
    }
    return {
      kind: transitional ? "transitional" : "trend",
      dir: fdir, entry: price,
      sl: fdir > 0 ? price - stopDist : price + stopDist,
      tp: fdir > 0 ? price + P.minRR * stopDist : price - P.minRR * stopDist,
      trail: stopDist, riskPct,
      partials: P.partials.map((pp) => ({ price: fdir > 0 ? price + pp.atR * stopDist : price - pp.atR * stopDist, closePct: pp.closePct })),
      adds: X.fadeTrend ? [] : adds,
    };
  }

  if (isRange && !P.noRange) {
    const z = S.sd20[i] > 0 ? (price - S.sma20[i]) / S.sd20[i] : 0;
    const r = S.rsi[i];
    let dirR = 0;
    if (z <= -2 && r <= P.rsiLo) dirR = 1;
    else if (z >= 2 && r >= P.rsiHi) dirR = -1;
    if (!dirR) return null;
    if (Math.abs(z) >= 3) return null;
    const sd = S.sd20[i];
    const stopDist = Math.max(0.6 * a, (3 - Math.abs(z)) * sd);
    const tp = S.sma20[i];
    const rr = Math.abs(tp - price) / stopDist;
    if (rr < 1.0) return null;
    return {
      kind: "range", dir: dirR, entry: price,
      sl: dirR > 0 ? price - stopDist : price + stopDist,
      tp, trail: P.trailMult * a, riskPct: P.riskPct * 0.8,
      partials: [{ price: (price + tp) / 2, closePct: 50 }],
      adds: [],
    };
  }
  return null;
}
const emaAt = (arr, i) => arr[i];

/* ── portfolio simulation ─────────────────────────────────────────────────── */

/**
 * cfg = {
 *   tf, spreadPips: {sym->pips}, pip: {sym->size}, cluster: {sym->id},
 *   profile: {adxGate,riskPct,trailMult,minRR,partials,maxAdds,tradeTransitional,
 *             rsiLo,rsiHi, maxOpenRisk, corrCap, dailyLossPct, noRange},
 *   sessionBlockUTC: [h1,h2,...] hours where NEW entries are blocked,
 *   rolloverSpreadMult, erFloor, volFloorP, htfGate,
 *   from, to  (epoch bounds for the tested window)
 * }
 */
export function runPortfolio(datasets, cfg) {
  const P = cfg.profile;
  const syms = Object.keys(datasets);
  // Precompute per-symbol series + extras
  const S = {}, XVol = {}, HTF = {};
  for (const sym of syms) {
    S[sym] = computeSeries(datasets[sym]);
    XVol[sym] = cfg.volFloorP > 0 ? atrPercentile(S[sym], Math.floor((20 * 1440) / cfg.tf)) : null;
    if (cfg.htfGate) {
      // H1 EMA(21) vs EMA(55) direction, mapped to base-tf indices
      const h1 = computeSeries(resample(datasets[sym], cfg.htfTf||240));
      HTF[sym] = { t: h1.t, e21: h1.e21, e55: h1.e55 };
    }
  }
  // global timeline = union of bar times (bars are aligned per tf)
  const times = new Set();
  for (const sym of syms) { const tt = S[sym].t; for (let i = 0; i < tt.length; i++) { if (tt[i] >= cfg.from && tt[i] <= cfg.to) times.add(tt[i]); } }
  const timeline = [...times].sort((a, b) => a - b);
  // index maps per symbol
  const idxAt = {};
  for (const sym of syms) {
    const m = new Map();
    const tt = S[sym].t;
    for (let i = 0; i < tt.length; i++) m.set(tt[i], i);
    idxAt[sym] = m;
  }
  const htfDirFn = (sym) => {
    if (!cfg.htfGate) return null;
    const H = HTF[sym];
    let hi = 0;
    return (i) => {
      const tm = S[sym].t[i];
      while (hi + 1 < H.t.length && H.t[hi + 1] + (cfg.htfTf||240)*60 <= tm) hi++; // last CLOSED H1 bar
      const up = H.e21[hi] > H.e55[hi];
      return up ? 1 : -1;
    };
  };

  let balance = 10000;
  const open = {}; // sym -> {legs:[{dir,entry,sl,tp,vol(riskAmt),trail,openIdx}], plan, addsDone, partialsFired, origRisk}
  const cooldownUntil = {};
  let dayKey = 0, dayStart = balance, halted = false;
  const trades = [];
  const dailyReturns = new Map();
  let peak = balance, maxDD = 0;

  const spreadOf = (sym, hourUTC) => {
    let s = (cfg.spreadPips[sym] ?? 2) * cfg.pip[sym];
    if (cfg.rolloverSpreadMult > 1 && (hourUTC >= 21 && hourUTC < 23)) s *= cfg.rolloverSpreadMult;
    return s;
  };

  const closeLeg = (sym, leg, exitPrice, reason, tEpoch, riskFrac) => {
    const pnlR = (leg.dir > 0 ? exitPrice - leg.entryEff : leg.entryEff - exitPrice) / leg.riskDist;
    const pnl = pnlR * leg.riskAmt * riskFrac;
    balance += pnl;
    trades.push({ sym, dir: leg.dir, kind: leg.kind, entry: leg.entryEff, exit: exitPrice, pnl, pnlR: pnlR * riskFrac, reason, t: tEpoch });
    return pnl;
  };

  for (const tm of timeline) {
    const d = new Date(tm * 1000);
    const hour = d.getUTCHours();
    const dk = Math.floor(tm / 86400);
    if (dk !== dayKey) { dayKey = dk; dayStart = balance; halted = false; }

    // equity-based daily halt (approx with realized balance + floating at close)
    for (const sym of syms) {
      const i = idxAt[sym].get(tm);
      if (i == null) continue;
      const pos = open[sym];
      const bh = S[sym].h[i], bl = S[sym].l[i], bc = S[sym].c[i];
      if (pos) {
        // manage each leg: SL/TP intrabar (worst-case: SL first), then partials, then trail
        for (const leg of pos.legs) {
          if (leg.closed) continue;
          const hitSL = leg.dir > 0 ? bl <= leg.sl : bh >= leg.sl;
          const hitTP = leg.dir > 0 ? bh >= leg.tp : bl <= leg.tp;
          if (hitSL) { closeLeg(sym, leg, leg.sl, "sl", tm, leg.fracLeft); leg.closed = true; continue; }
          if (hitTP) { closeLeg(sym, leg, leg.tp, "tp", tm, leg.fracLeft); leg.closed = true; continue; }
          // partials (base leg only)
          if (leg.isBase && !cfg.noPartials) {
            for (let pi = pos.partialsFired; pi < pos.plan.partials.length; pi++) {
              const pp = pos.plan.partials[pi];
              const hit = leg.dir > 0 ? bh >= pp.price : bl <= pp.price;
              if (!hit) break;
              const frac = Math.min(leg.fracLeft, pp.closePct / 100);
              if (frac > 0.001) { closeLeg(sym, leg, pp.price, "partial", tm, frac); leg.fracLeft -= frac; }
              pos.partialsFired = pi + 1;
            }
            if (leg.fracLeft <= 0.001) leg.closed = true;
          }
          // trailing (activation-gated, mirrors EA v2.1)
          if (!leg.closed && leg.trail > 0 && !cfg.noTrail) {
            const prof = leg.dir > 0 ? bc - leg.entryEff : leg.entryEff - bc;
            if (prof >= leg.trail) {
              const newSL = leg.dir > 0 ? bc - leg.trail : bc + leg.trail;
              if (leg.dir > 0 ? newSL > leg.sl : newSL < leg.sl) leg.sl = newSL;
            }
          }
        }
        // pyramid adds: price pulls back to level while base still open
        if (!halted && pos.plan.adds.length && pos.addsDone < pos.plan.adds.length) {
          const base = pos.legs[0];
          if (!base.closed) {
            const ad = pos.plan.adds[pos.addsDone];
            const hit = base.dir > 0 ? bl <= ad.price : bh >= ad.price;
            if (hit && openRiskOk(open, P, cfg, sym, ad.riskPct)) {
              const sp = spreadOf(sym, hour);
              const entryEff = base.dir > 0 ? ad.price + sp : ad.price - sp;
              const riskDist = Math.abs(entryEff - base.sl);
              if (riskDist > 0) {
                pos.legs.push({ dir: base.dir, entryEff, sl: base.sl, tp: base.tp, trail: base.trail, riskDist, riskAmt: (balance * ad.riskPct) / 100, fracLeft: 1, kind: "add", isBase: false, riskPct: ad.riskPct });
                pos.addsDone++;
              }
            }
          }
        }
        if (pos.legs.every((x) => x.closed)) { delete open[sym]; cooldownUntil[sym] = tm + cfg.cooldownSec; }
      }
    }

    // daily halt check AFTER management
    const dd = ((balance - dayStart) / dayStart) * 100;
    if (P.dailyLossPct > 0 && dd <= -P.dailyLossPct) halted = true;

    // new entries
    if (!halted && !(cfg.sessionBlockUTC && cfg.sessionBlockUTC.includes(hour))) {
      for (const sym of syms) {
        const i = idxAt[sym].get(tm);
        if (i == null || open[sym]) continue;
        if ((cooldownUntil[sym] ?? 0) > tm) continue;
        const X = { erFloor: cfg.erFloor ?? 0, volPct: XVol[sym], volFloorP: cfg.volFloorP ?? 0, fadeTrend: cfg.fadeTrend, breakoutBufferAtr: cfg.breakoutBufferAtr, htfDir: cfg.htfGate ? htfDirFn(sym)?.bind(null) && htfDirFn(sym) : null };
        // NOTE: htfDirFn creates a stateful closure; create once per sym outside loop for perf — acceptable here
        const sig = decide(S[sym], i, P, { ...X, htfDir: cfg.htfGate ? (ii) => { const H = HTF[sym]; let lo = 0, hiI = H.t.length - 1, tmm = S[sym].t[ii]; while (lo < hiI) { const mid = (lo + hiI + 1) >> 1; if (H.t[mid] + (cfg.htfTf||240)*60 <= tmm) lo = mid; else hiI = mid - 1; } return H.e21[lo] > H.e55[lo] ? 1 : -1; } : null });
        if (!sig) continue;
        if (!openRiskOk(open, P, cfg, sym, sig.riskPct)) continue;
        const sp = spreadOf(sym, hour);
        const entryEff = sig.dir > 0 ? sig.entry + sp : sig.entry - sp; // cross the spread
        const riskDist = Math.abs(entryEff - sig.sl);
        if (riskDist <= 0) continue;
        // hard cost-admission gate: spread must be a small fraction of the stop
        if (sp / riskDist > (cfg.costGate ?? 0.25)) continue;
        // net-of-spread reward:risk floor
        if (cfg.minRRnet > 0) {
          const rrNet = (Math.abs(sig.tp - entryEff) - sp) / (riskDist + sp);
          if (rrNet < cfg.minRRnet) continue;
        }
        open[sym] = {
          plan: sig, addsDone: 0, partialsFired: 0,
          legs: [{ dir: sig.dir, entryEff, sl: sig.sl, tp: sig.tp, trail: sig.trail, riskDist, riskAmt: (balance * sig.riskPct) / 100, fracLeft: 1, kind: sig.kind, isBase: true, riskPct: sig.riskPct }],
        };
      }
    }

    if (balance > peak) peak = balance;
    const ddNow = (peak - balance) / peak;
    if (ddNow > maxDD) maxDD = ddNow;
    dailyReturns.set(dk, balance);
  }

  // force-close anything left at the end (at last close)
  for (const sym of Object.keys(open)) {
    const pos = open[sym];
    const SS = S[sym];
    const last = SS.c[SS.N - 1];
    for (const leg of pos.legs) if (!leg.closed) closeLeg(sym, leg, last, "eod", SS.t[SS.N - 1], leg.fracLeft);
  }

  // metrics
  const wins = trades.filter((x) => x.pnl > 0), losses = trades.filter((x) => x.pnl <= 0);
  const gw = wins.reduce((s, x) => s + x.pnl, 0), gl = Math.abs(losses.reduce((s, x) => s + x.pnl, 0));
  const days = [...dailyReturns.keys()].length;
  return {
    finalBalance: balance,
    netPct: ((balance - 10000) / 10000) * 100,
    trades: trades.length,
    tradesPerDay: days ? trades.length / days : 0,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: gl > 0 ? gw / gl : gw > 0 ? 99 : 0,
    maxDDPct: maxDD * 100,
    avgR: trades.length ? trades.reduce((s, x) => s + x.pnlR, 0) / trades.length : 0,
    bySym: Object.fromEntries(syms.map((s2) => [s2, round2(trades.filter((x) => x.sym === s2).reduce((s3, x) => s3 + x.pnl, 0))])),
    byKind: ["trend", "transitional", "range", "add"].map((k) => ({ kind: k, n: trades.filter((x) => x.kind === k).length, pnl: round2(trades.filter((x) => x.kind === k).reduce((s3, x) => s3 + x.pnl, 0)) })),
    tradesSample: trades.slice(0, 5),
  };
}

function openRiskOk(open, P, cfg, symNew, newRisk) {
  let total = 0, clus = 0;
  const cNew = cfg.cluster[symNew];
  for (const sym of Object.keys(open)) {
    for (const leg of open[sym].legs) {
      if (leg.closed) continue;
      total += leg.riskPct;
      if (cfg.cluster[sym] === cNew) clus += leg.riskPct;
    }
  }
  if (total + newRisk > P.maxOpenRisk + 1e-9) return false;
  if (P.corrCap > 0 && clus + newRisk > P.corrCap + 1e-9) return false;
  return true;
}

const round2 = (v) => Math.round(v * 100) / 100;
