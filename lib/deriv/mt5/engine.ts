/**
 * DERIV MT5 — signal orchestrator (server), v2 post-backtest overhaul.
 *
 * The single entry point the API route calls: fetch candles for the requested
 * market categories, run ARDE per symbol, apply the correlation/open-risk
 * governor across the WHOLE basket, and return the tradable signals plus a
 * "standing aside" list (so the UI can show WHY nothing fired — honesty over a
 * blank screen).
 *
 * v2 changes (measured in the backtest campaign):
 *  - Signal timeframe is M30 for 24/5 markets (M5 stops couldn't pay retail
 *    spread; M30 stops make the spread ~8-9% of risk instead of ~25%). The EA
 *    still polls every ~30s — scan cadence and signal granularity are
 *    independent.
 *  - The FORMING bar is dropped before evaluation: signals fire on closed bars
 *    only, killing the tick-poke/repaint entries that churned live accounts.
 *  - Trend entries are gated by the H4 EMA regime (one extra candle fetch).
 *  - Multiple categories can run in one call (the universal EA trades whatever
 *    the user selected on clunoid.com).
 */
import { fetchCandlesBatch } from "./feed";
import { evaluate, htfDirection } from "./strategy";
import { selectByRisk } from "./risk";
import { marketsByCategory, LIVE_CATEGORIES } from "./markets";
import { PROFILES } from "./profiles";
import type { EngineOutput, MarketCategory, MarketDef, RiskProfile, Signal, Side } from "./types";
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

/** Signal timeframe per category: 24/5 markets run M30 (cost arithmetic); the
 *  24/7 synthetics will pick their own when they come online. */
const GRANULARITY: Partial<Record<MarketCategory, number>> = {
  forex: 1800,
};
const DEFAULT_GRAN = 1800;
const H4 = 14400;

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
    // signal-TF candles + H4 candles for the higher-timeframe gate
    const [candlesBySym, h4BySym] = await Promise.all([
      fetchCandlesBatch(syms, gran, bars),
      fetchCandlesBatch(syms, H4, 120),
    ]);

    for (const m of markets) {
      evaluated++;
      const candles = closedOnly(candlesBySym.get(m.ws), gran, now);
      if (candles.length) withData++;
      const htf: Side | null = htfDirection(closedOnly(h4BySym.get(m.ws), H4, now));
      const out = evaluate(candles, m, profile, now, htf);
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
