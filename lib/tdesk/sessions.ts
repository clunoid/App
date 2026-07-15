/**
 * FX session clock — UTC-based, DST-approximate (fixed UTC windows; the ±1h DST
 * drift is acceptable for session FILTERS and is exactly how the strategies were
 * validated, so live behavior matches the backtest by construction).
 */
import { FUTURES_MARKETS, type EconomicEvent, type Pair } from "./types";

type SessionName = "sydney" | "tokyo" | "london" | "newyork" | "closed";

/** UTC hour windows [start, end) — overlapping by nature. */
const WINDOWS: { name: SessionName; start: number; end: number }[] = [
  { name: "sydney", start: 21, end: 6 },
  { name: "tokyo", start: 0, end: 9 },
  { name: "london", start: 7, end: 16 },
  { name: "newyork", start: 12, end: 21 },
];

function sessionsAt(tMs: number): SessionName[] {
  if (!isMarketOpen(tMs)) return ["closed"];
  const h = new Date(tMs).getUTCHours();
  const active = WINDOWS.filter((w) => (w.start < w.end ? h >= w.start && h < w.end : h >= w.start || h < w.end)).map((w) => w.name);
  return active.length ? active : ["closed"];
}

export function sessionLabel(tMs: number): string {
  const s = sessionsAt(tMs);
  if (s[0] === "closed") return "Market closed";
  if (s.includes("london") && s.includes("newyork")) return "London–NY overlap";
  return s.map((x) => x[0].toUpperCase() + x.slice(1)).join(" + ");
}

/** FX runs 24/5: opens Sun 21:00 UTC (Sydney), closes Fri 21:00 UTC (NY). */
export function isMarketOpen(tMs: number): boolean {
  const d = new Date(tMs);
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const h = d.getUTCHours();
  if (day === 6) return false;
  if (day === 0) return h >= 21;
  if (day === 5) return h < 21;
  return true;
}

/**
 * Per-market clock. FX uses the 24/5 clock above. CME/NYMEX futures run Globex:
 * Sun ~22:00 → Fri ~21:00 UTC with a DAILY maintenance halt whose UTC hour
 * shifts with US DST (21:00–22:00 in EDT, 22:00–23:00 in EST). This predicate is
 * deliberately CONSERVATIVE — it returns true only for hours the market trades
 * in BOTH DST regimes — because its consumer is the resample completeness rule
 * (data.resampleBars), where the `got >= expected` comparison makes extra bars
 * harmless but a phantom "expected" hour would wrongly drop every bucket
 * spanning the halt. Not used for the scan-cycle gate (the FX clock is a
 * superset there; a closed futures market simply yields no fresh bars).
 */
export function isMarketOpenFor(pair: Pair, tMs: number): boolean {
  if (!FUTURES_MARKETS.has(pair)) return isMarketOpen(tMs);
  const d = new Date(tMs);
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  if (day === 6) return false;
  if (day === 0) return h === 23; // Sunday open is 22:00 (EDT) or 23:00 (EST) — only 23 is certain
  if (h === 21 || h === 22) return false; // daily halt window across both DST regimes
  if (day === 5) return h < 21;
  return true;
}

/** Is ANY desk market open — the scan-cycle gate. The FX clock is a superset of
 *  the futures clock at every hour EXCEPT Friday 21:00-22:00 UTC, when CME/NYMEX
 *  still trade in US winter (EST close 22:00) after FX has closed (21:00). Adding
 *  that hour closes the only window where a ready futures signal could go
 *  unscanned. Safe for FX: their last closed bar there was already evaluated at
 *  the 21:00 scan, so the dedupe index yields no new/duplicate FX signals. */
export function isAnyMarketOpen(tMs: number): boolean {
  if (isMarketOpen(tMs)) return true;
  const d = new Date(tMs);
  return d.getUTCDay() === 5 && d.getUTCHours() === 21; // futures-only tail of the week
}

/** Bar hour helper for strategy session filters (UTC hour of bar open). */
export const utcHour = (tMs: number): number => new Date(tMs).getUTCHours();

/** Is this UTC hour inside [start,end) with wrap support? */
export function hourIn(h: number, start: number, end: number): boolean {
  return start < end ? h >= start && h < end : h >= start || h < end;
}

const CCY: Record<Pair, [string, string]> = {
  EURUSD: ["EUR", "USD"],
  GBPUSD: ["GBP", "USD"],
  USDJPY: ["USD", "JPY"],
  USDCHF: ["USD", "CHF"],
  AUDUSD: ["AUD", "USD"],
  NZDUSD: ["NZD", "USD"],
  USDCAD: ["USD", "CAD"],
  EURGBP: ["EUR", "GBP"],
  EURJPY: ["EUR", "JPY"],
  GBPJPY: ["GBP", "JPY"],
  AUDJPY: ["AUD", "JPY"],
  AUDCAD: ["AUD", "CAD"],
  // metals/energies/US indices react to USD high-impact events (FOMC, CPI, NFP)
  XAUUSD: ["USD", "USD"],
  XAGUSD: ["USD", "USD"],
  USOIL: ["USD", "USD"],
  NATGAS: ["USD", "USD"],
  SPX500: ["USD", "USD"],
  NAS100: ["USD", "USD"],
  US30: ["USD", "USD"],
};
const pairCurrencies = (pair: Pair): [string, string] => CCY[pair];

/** News proximity for a pair at time t: blackout inside ±blackoutMin of a
 *  high-impact event on either currency; caution inside ±cautionMin. */
export function newsRiskAt(
  pair: Pair,
  tMs: number,
  events: EconomicEvent[],
  blackoutMin = 45,
  cautionMin = 120
): { level: "clear" | "caution" | "blackout"; events: EconomicEvent[] } {
  const ccys = pairCurrencies(pair);
  const near = events.filter(
    (e) => e.impact === "High" && ccys.includes(e.currency) && Math.abs(e.at - tMs) <= cautionMin * 60_000
  );
  if (!near.length) return { level: "clear", events: [] };
  const black = near.some((e) => Math.abs(e.at - tMs) <= blackoutMin * 60_000);
  return { level: black ? "blackout" : "caution", events: near.sort((a, b) => Math.abs(a.at - tMs) - Math.abs(b.at - tMs)) };
}
