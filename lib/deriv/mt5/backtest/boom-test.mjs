/**
 * DERIV MT5 — CRASH/BOOM structural edge test.
 *
 * Boom = slow DOWN drift + periodic large UP spikes; Crash = mirror. The retail
 * belief is that this asymmetry is exploitable. Independent 15M-tick work says
 * no (spike timing memoryless; post-spike drift insignificant; ~1430pt spread).
 * We test the plausible structural plays directly on our own candles, at ZERO
 * cost (does ANY structure exist?) and at realistic spread.
 *
 * Strategies (Boom; Crash is mirrored automatically by spike direction):
 *   fade-spike      — after an up-spike, SHORT (bet on drift-back-down)
 *   ride-spike      — after an up-spike, LONG (momentum continuation)
 *   short-drift     — always short (ride the down-drift), capped stop for spikes
 *   long-for-spike  — always long (wait for the up-spike), small stop
 *
 *   node lib/deriv/mt5/backtest/boom-test.mjs <dataDir>
 */
import { makeInd, loadBars } from "./search-lib.mjs";

const dir = process.argv[2];
const SPEC = {
  BOOM500: { spread: 0.4, spikeUp: true }, BOOM1000: { spread: 1.05, spikeUp: true },
  CRASH500: { spread: 0.4, spikeUp: false }, CRASH1000: { spread: 1.05, spikeUp: false },
};
const MAXBARS = 48;
const SPIKE_K = 4; // a "spike" candle: |close-open| > K × ATR

const stats = (R) => { const n = R.length; if (!n) return { n: 0, exp: 0, t: 0, pf: 0, win: 0 }; const m = R.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(R.reduce((s, x) => s + (x - m) ** 2, 0) / n); const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0; const w = R.filter((x) => x > 0).length; const gw = R.filter((x) => x > 0).reduce((s, x) => s + x, 0), gl = -R.filter((x) => x <= 0).reduce((s, x) => s + x, 0); return { n, exp: m, t, pf: gl > 0 ? gw / gl : 9, win: w / n * 100 }; };
const flag = (t, n) => !n ? "no data" : t > 2 ? "✓ EDGE" : t < -2 ? "✗ neg" : "· noise";

/** Generic structural sim. `entryRule(S,i,spikeUp)` → side or 0. */
function sim(S, spikeUp, mode, spread, slAtrMul, tpAtrMul) {
  let pos = null, since = 0; const R = [];
  for (let i = 60; i < S.N - 1; i++) {
    if (pos) {
      since++;
      const o = S.o[i], h = S.h[i], l = S.l[i], c = S.c[i];
      let exit = null;
      if (pos.side > 0) { if (o <= pos.sl) exit = o; else if (o >= pos.tp) exit = o; else if (l <= pos.sl) exit = pos.sl; else if (h >= pos.tp) exit = pos.tp; }
      else { if (o >= pos.sl) exit = o; else if (o <= pos.tp) exit = o; else if (h >= pos.sl) exit = pos.sl; else if (l <= pos.tp) exit = pos.tp; }
      if (exit == null && since >= MAXBARS) exit = c;
      if (exit != null) { R.push((pos.side > 0 ? exit - pos.entry : pos.entry - exit) / pos.riskDist); pos = null; }
    }
    if (!pos) {
      const a = S.atr(14)[i]; if (!(a > 0)) continue;
      const body = S.c[i] - S.o[i];
      const isSpike = Math.abs(body) > SPIKE_K * a && (spikeUp ? body > 0 : body < 0); // spike in the known direction
      let side = 0;
      if (mode === "fade-spike" && isSpike) side = spikeUp ? -1 : 1;      // fade the spike
      else if (mode === "ride-spike" && isSpike) side = spikeUp ? 1 : -1; // ride the spike
      else if (mode === "short-drift") side = spikeUp ? -1 : 1;           // ride the drift (opposite the spike)
      else if (mode === "long-for-spike") side = spikeUp ? 1 : -1;        // sit in the spike direction
      if (!side) continue;
      const fill = S.o[i + 1];
      const eff = side > 0 ? fill + spread : fill - spread;
      const riskDist = slAtrMul * a;
      pos = { side, entry: eff, riskDist, sl: side > 0 ? eff - riskDist : eff + riskDist, tp: side > 0 ? eff + tpAtrMul * a : eff - tpAtrMul * a }; since = 0;
    }
  }
  return R;
}

console.log(`\n=== CRASH/BOOM structural edge test (zero-cost proof + realistic spread) ===`);
console.log(`spike = |body| > ${SPIKE_K}×ATR in the known spike direction. If asymmetry were exploitable, some mode shows ZERO-cost t>2.\n`);
const MODES = [
  ["fade-spike", 2, 3], ["ride-spike", 2, 3], ["short-drift", 3, 1.5], ["long-for-spike", 1.5, 4],
];
for (const sym of ["BOOM500", "BOOM1000", "CRASH500", "CRASH1000"]) {
  const raw = loadBars(dir, sym); if (!raw) { console.log(`${sym}: no data`); continue; }
  const S = makeInd(raw); const spec = SPEC[sym];
  console.log(`${sym}:`);
  for (const [mode, sl, tp] of MODES) {
    const R0 = sim(S, spec.spikeUp, mode, 0, sl, tp);
    const Rc = sim(S, spec.spikeUp, mode, spec.spread, sl, tp);
    const s0 = stats(R0), sc = stats(Rc);
    console.log(`   ${mode.padEnd(15)} ZERO: exp ${s0.exp.toFixed(4)}R t=${s0.t.toFixed(2).padStart(6)} ${flag(s0.t, s0.n).padEnd(7)} | cost: exp ${sc.exp.toFixed(4)}R t=${sc.t.toFixed(2).padStart(6)} PF ${sc.pf.toFixed(2)} ${flag(sc.t, sc.n)} (n=${sc.n})`);
  }
}
console.log(`\n(A real structural edge needs ZERO-cost t>2 on some mode. Otherwise the asymmetry is a martingale in disguise — no free money.)`);
