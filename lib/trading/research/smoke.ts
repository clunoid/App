/**
 * SMOKE TEST — one real scan cycle against live markets (no DB, no AI):
 *   npx tsx lib/trading/research/smoke.ts
 * Exercises: data fetch → indicators → champions → filters → confidence, plus
 * the resolver math on a synthetic open signal over real bars.
 */
import { PAIRS } from "../types";
import { runScan, resolveOpenSignals, playbooks } from "../engine";

async function main() {
  console.log("playbooks:", playbooks.map((p) => `${p.pair}:${p.champions.map((c) => c.strategy).join("+") || "monitor"}`).join("  "));
  const { result, barsByPair } = await runScan(PAIRS);
  console.log(`\nmarketOpen=${result.marketOpen}  duration=${result.durationMs}ms  errors=${result.errors.length}`);
  for (const e of result.errors) console.log("  ERR", e.pair, e.message);
  for (const p of result.pairs) {
    console.log(`  ${p.pair}  ${p.price}  ${p.changePct}%  ATR ${p.atrPips}p  ${p.volRegime}  age ${p.barsAgeMin}m  candidates=${p.candidates.length}`);
    for (const c of p.candidates) console.log(`     → ${c.strategy} ${c.direction} conf=${c.confidence} status=${c.status} rr=${c.rr} warnings=[${c.warnings.join("; ")}]`);
  }
  console.log(`  high-impact events ahead: ${result.events.length}`);

  // resolver sanity on real bars: plant a signal 30 bars back and resolve it
  const jp = barsByPair.USDJPY?.["1h"];
  if (jp && jp.length > 40) {
    const b = jp[jp.length - 31];
    const entry = b.o;
    const stop = entry - 0.4;
    const target = entry + 0.8;
    const res = resolveOpenSignals(
      [{ id: "test", pair: "USDJPY", timeframe: "1h", direction: "long", entry, stop, targets: [target], barTime: new Date(b.t - 1).toISOString() }],
      { USDJPY: { "1h": jp } }
    );
    console.log(`\nresolver: planted USDJPY long @${entry.toFixed(3)} sl ${stop.toFixed(3)} tp ${target.toFixed(3)} →`, res[0] ?? "(still open — plausible)");
  }
  console.log("\nSMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
