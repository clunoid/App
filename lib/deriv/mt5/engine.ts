/**
 * DERIV MT5 — signal orchestrator (server).
 *
 * The single entry point the API route (and a future cron) call: fetch candles
 * for the requested basket, run ARDE per symbol, apply the correlation/open-risk
 * governor, and return the tradable signals plus a "standing aside" list (so the
 * UI can show WHY nothing fired on a symbol — honesty over a blank screen).
 */
import { fetchCandlesBatch } from "./feed";
import { evaluate } from "./strategy";
import { selectByRisk } from "./risk";
import { FOREX, marketsByCategory } from "./markets";
import { PROFILES } from "./profiles";
import type { EngineOutput, MarketCategory, RiskProfile, Signal } from "./types";
import { isSignal } from "./types";

export type EngineResult = {
  profile: RiskProfile;
  generatedAt: number;
  granularitySec: number;
  signals: Signal[]; // pass the risk governor — the EA should act on these
  standAside: { symbol: string; name: string; regime: string; reason: string }[];
  meta: { evaluated: number; withData: number };
};

/** Markets the engine trades today (forex). Category can narrow it further. */
function basket(category?: MarketCategory) {
  if (!category || category === "forex") return FOREX;
  const m = marketsByCategory(category);
  return m.length ? m : FOREX;
}

export async function runEngine(
  profileKey: RiskProfile,
  category: MarketCategory | undefined,
  granularitySec = 300,
  bars = 250,
): Promise<EngineResult> {
  const profile = PROFILES[profileKey] ?? PROFILES.moderate;
  const markets = basket(category);
  const now = Math.floor(Date.now() / 1000);

  const candlesBySym = await fetchCandlesBatch(markets.map((m) => m.ws), granularitySec, bars);

  const outputs: { out: EngineOutput; market: (typeof markets)[number] }[] = [];
  let withData = 0;
  for (const m of markets) {
    const candles = candlesBySym.get(m.ws) || [];
    if (candles.length) withData++;
    outputs.push({ out: evaluate(candles, m, profile, now), market: m });
  }

  const candidates = outputs
    .filter((o) => isSignal(o.out))
    .map((o) => ({ sig: o.out as Signal, market: o.market }));
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
    generatedAt: now,
    granularitySec,
    signals,
    standAside,
    meta: { evaluated: markets.length, withData },
  };
}
