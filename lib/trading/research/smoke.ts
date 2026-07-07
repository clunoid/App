/**
 * SMOKE TEST — one real scan cycle against live markets (no DB, no AI):
 *   npx tsx lib/trading/research/smoke.ts
 * Exercises: data fetch → indicators → champions → filters → confidence, plus
 * the resolver math on a synthetic open signal over real bars, plus the MIRROR
 * ASSERTION: the same planted setup run through the backtester and the live
 * resolver over identical bars must produce the same outcome and R (to the
 * resolver's 2dp rounding) — with and without a time-boxed maxBars exit. This
 * is the regression tripwire for any change to either loop.
 */
import { PAIRS, type Setup } from "../types";
import { closedBars } from "../data";
import { simulate } from "../backtest";
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

  // ── MIRROR ASSERTION: simulate() ≡ resolveOpenSignals() on identical bars ──
  const raw = barsByPair.USDJPY?.["1h"];
  if (raw && raw.length > 80) {
    const bars = closedBars(raw, "1h");
    for (const maxBars of [undefined, 3]) {
      // 71 bars of history follow the plant so the 60-bar TTL elapses inside the
      // series — simulate's end-of-data censoring (a research-only convention)
      // must not be confused with a live still-open signal.
      const i = bars.length - 71;
      const sig = bars[i];
      const setup: Setup = {
        pair: "USDJPY", timeframe: "1h", direction: "long",
        entry: sig.c, stop: sig.c - 0.35, targets: [sig.c + 0.7],
        strategy: "mirrorTest", factors: [], barIndex: i,
        ...(maxBars !== undefined ? { maxBars } : {}),
      };
      const sim = simulate(bars, [setup], "USDJPY")[0];
      const live = resolveOpenSignals(
        [{ id: "m", pair: "USDJPY", timeframe: "1h", direction: "long", entry: setup.entry, stop: setup.stop, targets: setup.targets, barTime: new Date(sig.t).toISOString(), maxBars: maxBars ?? null }],
        { USDJPY: { "1h": bars } }
      )[0];
      const simStatus = sim ? (sim.outcome === "expiry" ? "expired" : sim.outcome) : "open";
      const liveStatus = live?.status ?? "open";
      const rMatch = !sim || !live || Math.abs(sim.r - live.resultR) <= 0.005 + 1e-9;
      console.log(`mirror(maxBars=${maxBars ?? "-"}): sim=${simStatus} r=${sim?.r.toFixed(3) ?? "-"} · live=${liveStatus} r=${live?.resultR ?? "-"} · ${simStatus === liveStatus && rMatch ? "MATCH" : "MISMATCH"}`);
      if (simStatus !== liveStatus || !rMatch) throw new Error(`MIRROR BROKEN (maxBars=${maxBars}): sim ${simStatus}/${sim?.r} vs live ${liveStatus}/${live?.resultR}`);
    }
  }
  console.log("\nSMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
