/**
 * DERIV MT5 — CRASH/BOOM edge STRESS test.
 *
 * boom-test.mjs showed an apparent "short-drift" / "fade-spike" edge. Two reasons
 * to distrust it, both tested here:
 *   1. SPREAD — I used Deriv's MINIMUM (1.05 on B/C1000); realistic/measured is
 *      ~1.43+ and floats wider around spikes. Sweep 1×…3×.
 *   2. SPIKE STOP-OUT SLIPPAGE — a Boom up-spike is a single tick that blows a
 *      short's stop far past the stop price, but M5 candles let the sim fill
 *      cleanly at the stop. Model the pessimistic bound: a stopped-out trade
 *      fills at the bar's WORST excursion (the spike peak), not the stop.
 * Also report MAX DRAWDOWN and the worst single trade (tail risk of "always
 * short Boom"). If the edge dies under realistic spread OR pessimistic fills,
 * it was a candle-resolution artifact, matching the tick-level 15M study.
 *
 *   node lib/deriv/mt5/backtest/boom-stress.mjs <dataDir>
 */
import { makeInd, loadBars } from "./search-lib.mjs";

const dir = process.argv[2];
const SPEC = {
  BOOM500: { spread: 0.4, spikeUp: true }, BOOM1000: { spread: 1.05, spikeUp: true },
  CRASH500: { spread: 0.4, spikeUp: false }, CRASH1000: { spread: 1.05, spikeUp: false },
};
const MAXBARS = 48;

function sim(S, spikeUp, spread, slAtrMul, tpAtrMul, pessimistic) {
  let pos = null, since = 0, bal = 10000, peak = 10000, maxDD = 0, worst = 0; const R = [];
  for (let i = 60; i < S.N - 1; i++) {
    if (pos) {
      since++;
      const o = S.o[i], h = S.h[i], l = S.l[i], c = S.c[i];
      let exit = null, stopped = false;
      if (pos.side > 0) {
        if (o <= pos.sl) { exit = o; stopped = true; }
        else if (o >= pos.tp) exit = o;
        else if (l <= pos.sl) { exit = pessimistic ? l : pos.sl; stopped = true; } // pessimistic: fill at the low (spike bottom)
        else if (h >= pos.tp) exit = pos.tp;
      } else {
        if (o >= pos.sl) { exit = o; stopped = true; }
        else if (o <= pos.tp) exit = o;
        else if (h >= pos.sl) { exit = pessimistic ? h : pos.sl; stopped = true; } // pessimistic: fill at the high (spike peak)
        else if (l <= pos.tp) exit = pos.tp;
      }
      if (exit == null && since >= MAXBARS) exit = c;
      if (exit != null) {
        const rr = (pos.side > 0 ? exit - pos.entry : pos.entry - exit) / pos.riskDist;
        R.push(rr); bal += rr * bal * 0.01; if (bal > peak) peak = bal; const dd = (peak - bal) / peak; if (dd > maxDD) maxDD = dd; if (rr < worst) worst = rr;
        pos = null;
      }
    }
    if (!pos) {
      const a = S.atr(14)[i]; if (!(a > 0)) continue;
      const side = spikeUp ? -1 : 1; // short-drift: ride the drift, opposite the spike
      const fill = S.o[i + 1], eff = side > 0 ? fill + spread : fill - spread, riskDist = slAtrMul * a;
      pos = { side, entry: eff, riskDist, sl: side > 0 ? eff - riskDist : eff + riskDist, tp: side > 0 ? eff + tpAtrMul * a : eff - tpAtrMul * a }; since = 0;
    }
  }
  const n = R.length, m = n ? R.reduce((s, x) => s + x, 0) / n : 0, sd = n ? Math.sqrt(R.reduce((s, x) => s + (x - m) ** 2, 0) / n) : 0, t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  return { n, exp: m, t, net: (bal - 10000) / 100, maxDD: maxDD * 100, worst };
}

console.log(`\n=== CRASH/BOOM "short-drift" STRESS (spread sweep × clean-vs-pessimistic stop fills) ===`);
console.log(`slAtr=3 tpAtr=1.5. Clean = stop fills at stop price; Pessimistic = stop fills at the bar's spike extreme.\n`);
for (const sym of ["BOOM500", "BOOM1000", "CRASH500", "CRASH1000"]) {
  const raw = loadBars(dir, sym); if (!raw) continue;
  const S = makeInd(raw); const base = SPEC[sym].spread, up = SPEC[sym].spikeUp;
  const atrMed = medianAtr(S);
  console.log(`${sym}  (median ATR14 ≈ ${atrMed.toFixed(2)} price units; base spread ${base}):`);
  for (const [lbl, pess] of [["CLEAN stop", false], ["PESSIMISTIC stop", true]]) {
    const cells = [1, 1.36, 2, 3].map((mult) => {
      const r = sim(S, up, base * mult, 3, 1.5, pess);
      return `${(base * mult).toFixed(2)}sp: exp ${r.exp.toFixed(4)}R t=${r.t.toFixed(1)} net ${r.net.toFixed(0)}% DD${r.maxDD.toFixed(0)}% worst${r.worst.toFixed(1)}R`;
    });
    console.log(`   ${lbl.padEnd(17)} | ${cells.join("  |  ")}`);
  }
}
function medianAtr(S) { const a = []; for (let i = 20; i < S.N; i += 50) { const v = S.atr(14)[i]; if (v > 0) a.push(v); } a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)] || 0; }
console.log(`\n(Real tick fills sit between CLEAN and PESSIMISTIC. If the edge needs CLEAN fills at min spread, it isn't real — M5 candles just hid the spike slippage.)`);
