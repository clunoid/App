/**
 * Market-data adapters. REAL DATA ONLY — every bar comes from a provider
 * response; on any gap or failure we return what we verifiably have (or throw),
 * never an estimate.
 *
 * Provider selection (evaluated live before this was built):
 *   • Yahoo Finance chart API — primary. No key, all 5 majors, verified depth:
 *     15m/30m × 60 days, 1h × ~2 years (17.5k bars), 1d × decades; ~1-2s latency.
 *     Unofficial API: mitigated with retries, a strict validator, and a clean
 *     adapter seam below so a keyed provider can replace it without touching
 *     strategies. Internal, admin-only analysis use.
 *   • TwelveData adapter — optional, activates automatically when
 *     TWELVEDATA_API_KEY is set (800 req/day free tier); same Bar contract.
 *   • ForexFactory weekly calendar JSON — economic events (verified live, ~300ms).
 *
 * All fetches are server-side only.
 */
import { FUTURES_MARKETS, type Bar, type EconomicEvent, type Pair, type Timeframe } from "./types";
import { isMarketOpenFor } from "./sessions";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" };

const YAHOO_SYMBOL: Record<Pair, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  USDCHF: "USDCHF=X",
  AUDUSD: "AUDUSD=X",
  NZDUSD: "NZDUSD=X",
  USDCAD: "USDCAD=X",
  EURGBP: "EURGBP=X",
  EURJPY: "EURJPY=X",
  GBPJPY: "GBPJPY=X",
  AUDJPY: "AUDJPY=X",
  AUDCAD: "AUDCAD=X",
  // CME/NYMEX futures — verified live: Yahoo 404s spot metals (XAUUSD=X) and
  // the cash indices (^NDX/^GSPC) are :30-stamped with <1/3 the bars, so the
  // hour-alignment guard would reject them. Futures are the clean 23h feeds.
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  USOIL: "CL=F",
  NATGAS: "NG=F",
  SPX500: "ES=F",
  NAS100: "NQ=F",
  US30: "YM=F",
};

/** Timeframes fetched natively from the provider. 2h/4h are RESAMPLED from the
 *  1h feed (Yahoo has no native 2h/4h) — see resampleBars / fetchBars. */
type NativeTimeframe = Exclude<Timeframe, "2h" | "4h">;
const YAHOO_INTERVAL: Record<NativeTimeframe, string> = { "15m": "15m", "30m": "30m", "1h": "60m" };
/** Max range Yahoo serves per interval (verified live). 2h/4h ride the 1h feed. */
const MAX_RANGE: Record<Timeframe, string> = { "15m": "60d", "30m": "60d", "1h": "730d", "2h": "730d", "4h": "730d" };
/** Bar interval in ms — the ONLY reliable way to tell a closed bar from Yahoo's
 *  trailing forming-bar + live-quote pseudo-rows. */
export const INTERVAL_MS: Record<Timeframe, number> = { "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000 };

async function fetchJsonRetry(url: string, tries = 3, timeoutMs = 15_000): Promise<unknown> {
  let lastErr: unknown;
  for (let a = 0; a < tries; a++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { headers: UA, signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status === 404 || res.status === 400) break; // won't fix on retry
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400 * (a + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type YahooChart = {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
};

/** Strict validation: a bar is kept ONLY if all four prices are finite, positive,
 *  and internally consistent (h ≥ max(o,c), l ≤ min(o,c)). Anything else is
 *  dropped — never patched or interpolated. */
function toBars(j: YahooChart): Bar[] {
  const r = j.chart?.result?.[0];
  const ts = r?.timestamp;
  const q = r?.indicators?.quote?.[0];
  if (!ts || !q) throw new Error(j.chart?.error?.description || "empty chart payload");
  const out: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    if (!(isFinite(o) && isFinite(h) && isFinite(l) && isFinite(c))) continue;
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) continue;
    if (h < Math.max(o, c) - 1e-9 || l > Math.min(o, c) + 1e-9) continue;
    out.push({ t: ts[i] * 1000, o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  // strictly increasing time (Yahoo occasionally duplicates the live bar)
  const dedup: Bar[] = [];
  for (const b of out) {
    if (dedup.length && b.t <= dedup[dedup.length - 1].t) continue;
    dedup.push(b);
  }
  return dedup;
}

async function yahooBars(pair: Pair, tf: NativeTimeframe, range?: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${YAHOO_SYMBOL[pair]}?interval=${YAHOO_INTERVAL[tf]}&range=${range || MAX_RANGE[tf]}`;
  const bars = toBars((await fetchJsonRetry(url)) as YahooChart);
  if (bars.length < 30) throw new Error(`too few bars for ${pair} ${tf} (${bars.length})`);
  return bars;
}

const TD_INTERVAL: Record<NativeTimeframe, string> = { "15m": "15min", "30m": "30min", "1h": "1h" };

async function twelveDataBars(pair: Pair, tf: NativeTimeframe, key: string): Promise<Bar[]> {
  const sym = `${pair.slice(0, 3)}/${pair.slice(3)}`;
  // &timezone=UTC so the datetime is UTC — the "Z" append below is then correct.
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${TD_INTERVAL[tf]}&outputsize=5000&timezone=UTC&apikey=${key}`;
  const j = (await fetchJsonRetry(url)) as { values?: { datetime: string; open: string; high: string; low: string; close: string }[]; status?: string };
  if (j.status === "error" || !j.values) throw new Error("twelvedata error");
  const bars: Bar[] = [];
  for (const v of j.values) {
    const o = Number(v.open);
    const h = Number(v.high);
    const l = Number(v.low);
    const c = Number(v.close);
    if (![o, h, l, c].every((x) => isFinite(x) && x > 0)) continue;
    // SAME strict OHLC-consistency check as the Yahoo path — never patch, just drop
    if (h < Math.max(o, c) - 1e-9 || l > Math.min(o, c) + 1e-9) continue;
    bars.push({ t: new Date(v.datetime.replace(" ", "T") + "Z").getTime(), o, h, l, c, v: 0 });
  }
  bars.sort((a, b) => a.t - b.t);
  if (bars.length < 30) throw new Error(`twelvedata: too few bars for ${pair} ${tf} (${bars.length})`);
  return bars;
}

/**
 * Keep ONLY fully-closed bars. Yahoo appends up to two non-closed trailing rows
 * during market hours — the forming interval bar AND a live-quote pseudo-row
 * stamped at the current second — either of which would be look-ahead / bad data
 * for a decision. A bar with open time `t` closes at `t + interval`; we keep it
 * only once that has passed, and require `t` to be aligned to the interval grid
 * (the quote pseudo-row is not). This is the single guard that makes "closed
 * bar" mean the same thing live as in the backtest.
 */
export function closedBars(bars: Bar[], tf: Timeframe, now = Date.now()): Bar[] {
  const iv = INTERVAL_MS[tf];
  return bars.filter((b) => b.t % iv === 0 && b.t + iv <= now);
}

/**
 * Resample 1h bars into aligned 2h/4h bars — the ONE resample code path shared
 * by research and the live scanner, so an H2/H4 champion is validated on exactly
 * the bars it will trade. Buckets align to the UTC interval grid (4h → 00/04/08/
 * 12/16/20). Non-hour-aligned rows (Yahoo's live-quote pseudo-row) are dropped
 * before bucketing.
 *
 * COMPLETENESS RULE (drop, never patch): a bucket is emitted only when it holds
 * a constituent 1h bar for EVERY hour the market was open inside its window —
 * judged by the MARKET'S OWN clock (isMarketOpenFor): FX 24/5 vs the Globex
 * futures day with its daily maintenance halt. Session-edge stubs (FX Friday
 * 20:00, futures Sunday open) are structural — the market really traded only
 * those hours — and are kept; a bucket missing an hour the market DID trade
 * (a feed drop, a validator-rejected row, an unmodeled holiday) is incomplete
 * evidence and is dropped entirely. `got >= expected` makes extra bars (e.g.
 * a futures halt-hour that DID trade in the other DST regime) harmless. This
 * also drops the trailing still-forming bucket (its later hours have no bars
 * yet), which call sites would exclude via closedBars() anyway.
 *
 * `expected` uses the CONSERVATIVE both-DST clock deliberately: the exactly-
 * correct per-regime count needs a US-DST calendar the quant core doesn't carry,
 * and the conservative choice's failure mode is far milder than the alternatives.
 * Residual (documented, not hidden): on a futures halt-spanning bucket a feed
 * drop landing exactly on the one halt-window hour that traded THIS regime can
 * pass `got >= expected` and yield a bucket missing that hour's high/low — one
 * slightly-narrow wick among thousands of bars. It is IDENTICAL in research and
 * live (same code), introduces no look-ahead, and is bounded to that one bar.
 * The two rejected alternatives are worse: the permissive union count would drop
 * every valid halt-spanning bucket, and a naive `expected+1` would wrongly drop
 * the legitimate Friday end-of-week EDT stub.
 */
export function resampleBars(h1: Bar[], tf: "2h" | "4h", pair: Pair): Bar[] {
  const iv = INTERVAL_MS[tf];
  const hoursPerBucket = iv / 3_600_000;
  type Acc = { bar: Bar; got: number };
  const acc: Acc[] = [];
  let cur: Acc | null = null;
  for (const b of h1) {
    if (b.t % 3_600_000 !== 0) continue;
    const bucket = Math.floor(b.t / iv) * iv;
    if (!cur || cur.bar.t !== bucket) {
      if (cur) acc.push(cur);
      cur = { bar: { t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }, got: 1 };
    } else {
      if (b.h > cur.bar.h) cur.bar.h = b.h;
      if (b.l < cur.bar.l) cur.bar.l = b.l;
      cur.bar.c = b.c;
      cur.bar.v += b.v;
      cur.got++;
    }
  }
  if (cur) acc.push(cur);
  const out: Bar[] = [];
  for (const a of acc) {
    let expected = 0;
    for (let k = 0; k < hoursPerBucket; k++) if (isMarketOpenFor(pair, a.bar.t + k * 3_600_000)) expected++;
    if (expected > 0 && a.got >= expected) out.push(a.bar);
  }
  return out;
}

/** Public entry: latest bars for a pair/timeframe. Yahoo primary; TwelveData is
 *  used automatically as FALLBACK when configured and Yahoo fails. 2h/4h are
 *  resampled from the 1h feed (`range` then means the 1h range fetched). */
export async function fetchBars(pair: Pair, tf: Timeframe, range?: string): Promise<Bar[]> {
  if (tf === "2h" || tf === "4h") {
    const h1 = await fetchBars(pair, "1h", range);
    return resampleBars(h1, tf, pair);
  }
  try {
    return await yahooBars(pair, tf, range);
  } catch (e) {
    // TwelveData's symbol grammar (EUR/USD) covers FX only; a spot fallback for
    // a futures market would splice a DIFFERENT instrument into the series —
    // worse than failing. Futures markets fail honestly and retry next scan.
    const key = process.env.TWELVEDATA_API_KEY;
    if (key && !FUTURES_MARKETS.has(pair)) return await twelveDataBars(pair, tf, key);
    throw e;
  }
}

/* ── economic calendar (ForexFactory weekly JSON, no key) ─────────────────── */

type FFEvent = { title?: string; country?: string; date?: string; impact?: string; forecast?: string; previous?: string };

export async function fetchCalendar(): Promise<EconomicEvent[]> {
  const j = (await fetchJsonRetry("https://nfs.faireconomy.media/ff_calendar_thisweek.json")) as FFEvent[];
  if (!Array.isArray(j)) return [];
  const out: EconomicEvent[] = [];
  for (const e of j) {
    const at = e.date ? Date.parse(e.date) : NaN;
    if (!isFinite(at) || !e.title || !e.country) continue;
    out.push({ title: e.title, currency: e.country, impact: e.impact || "Low", at, forecast: e.forecast, previous: e.previous });
  }
  return out.sort((a, b) => a.at - b.at);
}
