/**
 * FX session clock — UTC-based, DST-approximate (fixed UTC windows; the ±1h DST
 * drift is acceptable for session FILTERS and is exactly how the strategies were
 * validated, so live behavior matches the backtest by construction).
 */
import type { EconomicEvent, Pair } from "./types";

export type SessionName = "sydney" | "tokyo" | "london" | "newyork" | "closed";

/** UTC hour windows [start, end) — overlapping by nature. */
const WINDOWS: { name: SessionName; start: number; end: number }[] = [
  { name: "sydney", start: 21, end: 6 },
  { name: "tokyo", start: 0, end: 9 },
  { name: "london", start: 7, end: 16 },
  { name: "newyork", start: 12, end: 21 },
];

export function sessionsAt(tMs: number): SessionName[] {
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
};
export const pairCurrencies = (pair: Pair): [string, string] => CCY[pair];

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
