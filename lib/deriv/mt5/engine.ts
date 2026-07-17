/**
 * DERIV MT5 — signal orchestrator (server), CONTINUOUS build (v2.11 trading
 * behaviour on the universal one-EA plumbing).
 *
 * The single entry point the API route calls: fetch candles for the requested
 * market categories, run the ARDE strategy per symbol, apply the correlation/
 * open-risk governor across the WHOLE basket, and return the tradable signals
 * plus a "standing aside" list (so the UI shows WHY nothing fired).
 *
 * Trading cadence is restored to v2.11 (continuous): the signal timeframe is M5,
 * there is NO higher-timeframe gate, and the aggressive profile trades the
 * transitional regime (reduced size) — so the basket produces entries
 * continuously, the way it did before the v3 "survival" throttle. The forming
 * bar is still dropped (signals fire on closed bars — a correctness fix, not a
 * frequency throttle). The per-trade + per-cluster + daily-loss risk caps stay
 * ON so continuous activity can't blow the account in a single session.
 *
 * The universal Bot-ID plumbing (one EA, profile + markets chosen on the site)
 * is unchanged — this only affects how often and how the strategy fires.
 */
import { fetchCandlesBatch } from "./feed";
import { evaluate } from "./strategy";
import { selectByRisk } from "./risk";
import { marketsByCategory, LIVE_CATEGORIES } from "./markets";
import { PROFILES } from "./profiles";
import type { EngineOutput, MarketCategory, MarketDef, RiskProfile, Signal } from "./types";
import { isSignal } from "./types";

export type EngineResult = {
  profile: RiskProfile;
  categories: MarketCategory[];
  generatedAt: number;
  granularitySec: number;
  signals: Signal[]; // pass the risk governor — the EA should act on these
  standAside: { symbol: string; name: string; regime: string; reason: string }[];
  meta: { evaluated: number; withData: number };
};

/** Signal timeframe per category: M5 for 24/5 markets (v2.11 continuous cadence). */
const GRANULARITY: Partial<Record<MarketCategory, number>> = {
  forex: 300,
};
const DEFAULT_GRAN = 300;

/** Drop the still-forming last candle so signals fire on CLOSED bars only. */
function closedOnly(candles: { t: number }[] | undefined, granularitySec: number, now: number) {
  if (!candles?.length) return [] as never[];
  const last = candles[candles.length - 1];
  return (last.t > now - granularitySec ? candles.slice(0, -1) : candles) as never[];
}

export async function runEngine(
  profileKey: RiskProfile,
  categoriesIn: MarketCategory[] | MarketCategory | undefined,
  bars = 250,
): Promise<EngineResult> {
  const profile = PROFILES[profileKey] ?? PROFILES.moderate;
  const wanted = (Array.isArray(categoriesIn) ? categoriesIn : [categoriesIn ?? "forex"]).filter(Boolean) as MarketCategory[];
  // Only categories whose engine is validated go live; the rest are ignored
  // until they come online (the UI labels them "soon").
  const categories = wanted.filter((c) => LIVE_CATEGORIES.includes(c));
  if (!categories.length) categories.push("forex");
  const now = Math.floor(Date.now() / 1000);

  const outputs: { out: EngineOutput; market: MarketDef }[] = [];
  let evaluated = 0, withData = 0;
  const candidates: { sig: Signal; market: MarketDef }[] = [];

  for (const category of categories) {
    const markets = marketsByCategory(category);
    if (!markets.length) continue;
    const gran = GRANULARITY[category] ?? DEFAULT_GRAN;
    const syms = markets.map((m) => m.ws);
    const candlesBySym = await fetchCandlesBatch(syms, gran, bars);

    for (const m of markets) {
      evaluated++;
      const candles = closedOnly(candlesBySym.get(m.ws), gran, now);
      if (candles.length) withData++;
      const out = evaluate(candles, m, profile, now);
      outputs.push({ out, market: m });
      if (isSignal(out)) candidates.push({ sig: out, market: m });
    }
  }

  // One governor pass across every category — correlation and open-risk caps
  // apply to the whole basket, not per market class.
  const signals = selectByRisk(candidates, profile);
  const chosen = new Set(signals.map((s) => s.symbol));

  const standAside = outputs
    .filter((o) => !isSignal(o.out) || !chosen.has((o.out as Signal).symbol))
    .map((o) => ({
      symbol: o.market.mt5,
      name: o.market.name,
      regime: o.out.regime,
      reason: isSignal(o.out) ? "held back by the risk cap (correlation / open-risk budget)" : o.out.reason,
    }));

  return {
    profile: profileKey,
    categories,
    generatedAt: now,
    granularitySec: GRANULARITY[categories[0]] ?? DEFAULT_GRAN,
    signals,
    standAside,
    meta: { evaluated, withData },
  };
}
