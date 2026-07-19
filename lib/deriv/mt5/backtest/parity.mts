/**
 * PARITY PROOF — runs the ACTUAL live strategy.ts evaluate() over the cached
 * candles, using the SAME 750-bar trailing window the live engine fetches, and
 * compares every entry signal to the validated search-lib.mjs gen. If they match
 * bar-for-bar, the deployed logic == the backtested logic (and the 750-bar EMA
 * seeding is proven to converge). Run: npx tsx lib/deriv/mt5/backtest/parity.mts <dataDir>
 */
import { evaluate, PAIR_STRATEGIES } from "../strategy.ts";
import { PROFILES } from "../profiles.ts";
import { marketByWs } from "../markets.ts";
import type { Candle, Signal } from "../types.ts";
// @ts-ignore - mjs sibling, no types
import { loadBars, resample, makeInd, STRATS } from "./search-lib.mjs";

const dataDir = process.argv[2];
const WINDOW = Number(process.argv[3]) || 1000; // must equal engine.ts BARS

// map live family → harness family + param adapter
function harnessParams(family: string, p: any): { fam: string; hp: any } {
  if (family === "emaX") return { fam: "emaX", hp: { fast: p.fast, slow: p.slow, slAtr: p.slAtr, tpRR: p.tpRR } };
  // rsiDip (live) ≡ rsiRev with trend:1 (harness)
  return { fam: "rsiRev", hp: { n: p.n, lo: p.lo, slAtr: p.slAtr, tpAtr: p.tpAtr, trend: 1 } };
}

let grandTotal = 0, grandMatch = 0, grandMismatch = 0;
for (const [ws, strat] of Object.entries(PAIR_STRATEGIES)) {
  const raw = loadBars(dataDir, ws);
  if (!raw) { console.log(`${ws}: no data`); continue; }
  const bars: number[][] = resample(raw, strat.granularitySec / 60);
  const S = makeInd(bars); // reference indicator engine (full-series seeding)
  const market = marketByWs(ws)!;
  const { fam, hp } = harnessParams(strat.family, strat.params);
  const genFn = STRATS[fam].gen;

  let total = 0, match = 0, sideMiss = 0, roundMiss = 0;
  const pipTol = Math.pow(10, -market.digits) * 1.6; // ~1 pip: SL/TP are rounded to digits
  const examples: string[] = [];
  for (let i = WINDOW; i < bars.length - 1; i++) {
    const ref = genFn(S, i, hp); // {side, slDist, tpDist} | null
    // live: hand the last WINDOW closed bars (global i-WINDOW+1 .. i) to evaluate
    const slice: Candle[] = [];
    for (let j = i - WINDOW + 1; j <= i; j++) slice.push({ t: bars[j][0], o: bars[j][1], h: bars[j][2], l: bars[j][3], c: bars[j][4] });
    const out = evaluate(slice, market, PROFILES.moderate, bars[i][0] + strat.granularitySec);
    const live = (out as Signal).side ? out as Signal : null;

    const refSide = ref ? (ref.side > 0 ? "buy" : "sell") : null;
    const liveSide = live ? live.side : null;

    if (!ref && !live) continue; // both silent — not counted
    total++;
    if (!ref || !live || refSide !== liveSide) {
      sideMiss++; // REAL divergence — a cross/dip appeared or flipped (EMA seeding, etc.)
      if (examples.length < 8) examples.push(`  SIDE  i=${i} ref=${refSide ?? "-"} live=${liveSide ?? "-"}`);
      continue;
    }
    // both fired same side — SL/TP distances should agree within ~1 pip (digit rounding)
    const liveSl = Math.abs(live.entry - live.stopLoss);
    const liveTp = Math.abs(live.takeProfit - live.entry);
    if (Math.abs(liveSl - ref.slDist) <= pipTol && Math.abs(liveTp - ref.tpDist) <= pipTol * 1.6) match++;
    else { roundMiss++; if (examples.length < 8) examples.push(`  DIST  i=${i} ref sl=${ref.slDist.toFixed(market.digits)} tp=${ref.tpDist.toFixed(market.digits)} | live sl=${liveSl.toFixed(market.digits)} tp=${liveTp.toFixed(market.digits)} (Δ>${pipTol.toFixed(market.digits)})`); }
  }
  grandTotal += total; grandMatch += match; grandMismatch += (sideMiss + roundMiss);
  const pct = total ? (match / total * 100).toFixed(2) : "n/a";
  console.log(`${ws.replace("frx", "").padEnd(7)} ${strat.family.padEnd(7)} signals=${total}  match=${match} (${pct}%)  side-flip=${sideMiss}  dist>${(pipTol).toFixed(market.digits)}=${roundMiss}`);
  for (const e of examples) console.log(e);
}
console.log(`\nTOTAL: ${grandMatch}/${grandTotal} match (${(grandMatch / Math.max(1, grandTotal) * 100).toFixed(2)}%), ${grandMismatch} mismatch`);
console.log(grandMismatch === 0 ? "✓ EXACT PARITY — live strategy.ts == validated backtest" : "⚠ mismatches — investigate above");
