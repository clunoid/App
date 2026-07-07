/**
 * LIVE SCAN ENGINE — turns validated playbooks into monitored signals.
 *
 * One scan (invoked by cron and by the terminal while open):
 *   1. market clock — outside 24/5 FX hours the scan is a cheap no-op heartbeat
 *   2. per pair: fetch fresh bars for each champion's timeframe (REAL data only)
 *   3. resolve OPEN signals against the newest highs/lows (tp / sl / expiry)
 *   4. run each champion strategy on closed bars; a setup on the LAST CLOSED bar
 *      becomes a candidate signal
 *   5. filters & confidence: news blackout, volatility regime, session, spread
 *      sanity → a 0–100 score; below threshold → no signal (by design)
 *   6. AI annotation (Sonnet) explains the PASSING signal — it never decides
 *
 * Everything a signal claims (entry/stop/targets/factors) comes from the same
 * strategy code path the walk-forward validated.
 */
import type { Bar, EconomicEvent, LiveSignal, Pair, PairPlaybook, Setup, Timeframe } from "./types";
import { PIP, SLIPPAGE_PIPS, SPREAD_PIPS, fmtPrice } from "./types";
import { closedBars, fetchBars, fetchCalendar, INTERVAL_MS } from "./data";
import { atr, ema, percentileRank, swings } from "./indicators";
import { isMarketOpen, newsRiskAt, sessionLabel } from "./sessions";
import { strategyById } from "./strategies";
import playbookFile from "./research/playbooks.json";

export const CONFIDENCE_THRESHOLD = 65;
const SIGNAL_TTL_BARS: Record<Timeframe, number> = { "15m": 60, "30m": 60, "1h": 60, "2h": 60, "4h": 60 };

/** Live fetch window per timeframe — sized so the VOL_WINDOW=400 ATR-percentile
 *  regime gate sees the same trailing depth it saw in validation. 2h/4h windows
 *  are 1h ranges (the data layer resamples). */
const FETCH_RANGE: Record<Timeframe, string> = { "15m": "10d", "30m": "10d", "1h": "30d", "2h": "100d", "4h": "200d" };

// via `unknown`: the JSON literal's inferred type shifts with every research run
// (param keys differ per champion), but the runtime shape is always PairPlaybook[].
export const playbooks: PairPlaybook[] = (playbookFile as unknown as { playbooks: PairPlaybook[] }).playbooks;

export type PairScan = {
  pair: Pair;
  price: number;
  changePct: number;
  atrPips: number;
  volRegime: LiveSignal["volRegime"];
  session: string;
  barsAgeMin: number;
  candidates: LiveSignal[];
  error?: string;
};

export type ResolveInput = { id: string; pair: Pair; timeframe: Timeframe; direction: "long" | "short"; entry: number; stop: number; targets: number[]; barTime: string; maxBars?: number | null };
export type Resolution = { id: string; status: "tp" | "sl" | "expired"; resultR: number; resolvedAt: string };

const volRegimeOf = (p: number): LiveSignal["volRegime"] => (p < 0.25 ? "low" : p < 0.75 ? "normal" : p < 0.93 ? "high" : "extreme");

/** Market-structure one-liner from recent swings + EMA slope (evidence, not signal). */
function structureLine(bars: Bar[]): string {
  const closes = bars.map((b) => b.c);
  const e50 = ema(closes, 50);
  const i = bars.length - 1;
  const sw = swings(bars.slice(-160), 2);
  const hh = sw.highs.length >= 2 && bars.slice(-160)[sw.highs[sw.highs.length - 1]].h > bars.slice(-160)[sw.highs[sw.highs.length - 2]].h;
  const hl = sw.lows.length >= 2 && bars.slice(-160)[sw.lows[sw.lows.length - 1]].l > bars.slice(-160)[sw.lows[sw.lows.length - 2]].l;
  const slope = !Number.isNaN(e50[i]) && !Number.isNaN(e50[i - 10]) ? e50[i] - e50[i - 10] : 0;
  if (hh && hl) return "Bullish structure: higher highs & higher lows" + (slope > 0 ? ", EMA50 rising" : "");
  if (!hh && !hl) return "Bearish structure: lower highs & lower lows" + (slope < 0 ? ", EMA50 falling" : "");
  return slope > 0 ? "Mixed structure, EMA50 drifting up" : slope < 0 ? "Mixed structure, EMA50 drifting down" : "Rangebound structure";
}

/** Confidence: starts from the champion's OOS evidence, then adds/removes for
 *  live context. Deterministic and fully explained in `warnings`/factors. */
function confidenceFor(setup: Setup, pb: PairPlaybook, volP: number, news: ReturnType<typeof newsRiskAt>, tf: Timeframe): { score: number; warnings: string[] } {
  const champ = pb.champions.find((c) => c.strategy === setup.strategy && c.timeframe === tf);
  const warnings: string[] = [];
  // base 55..75 from OOS profit factor (1.15 → ~57, 1.5 → ~68, 2.0+ → 75)
  const pf = champ?.oosProfitFactor ?? 1.15;
  let score = Math.min(75, 55 + (pf - 1.15) * 24);
  // sample-size credibility
  if ((champ?.oosTrades ?? 0) >= 60) score += 4;
  // volatility regime fit
  if (volP >= 0.3 && volP <= 0.8) score += 6;
  if (volP > 0.93) {
    score -= 18;
    warnings.push("Extreme volatility regime — spreads and slippage widen");
  }
  // timeframe evidence depth: sub-hourly champions validate on a 60-day
  // micro-sample only; 2h/4h validate on the same ~2y depth as 1h (no penalty)
  if (tf === "15m" || tf === "30m") {
    score -= 6;
    warnings.push("Sub-hourly setup: validated on 60-day micro-sample only");
  }
  // news proximity
  if (news.level === "blackout") {
    score -= 100; // hard suppress
    warnings.push("High-impact event within blackout window — signal suppressed");
  } else if (news.level === "caution") {
    score -= 10;
    warnings.push(`High-impact event nearby: ${news.events[0]?.title ?? ""}`);
  }
  // risk sanity: stop distance must clear the spread comfortably
  const riskPips = Math.abs(setup.entry - setup.stop) / PIP[setup.pair];
  if (riskPips < SPREAD_PIPS[setup.pair] * 4) {
    score -= 25;
    warnings.push("Stop too tight relative to typical spread");
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), warnings };
}

/** Resolve open signals against fresh bars using the EXACT backtester math:
 *  entry = published price + costs, exits pay costs and clamp gaps to the bar
 *  open, stop checked before target intrabar. This is what makes live outcome R
 *  comparable to the OOS R the strategy was validated on.
 *  `now` MUST be the time the bars were FETCHED (runScan's start), never the
 *  time of resolution — a bar whose interval boundary falls between fetch and
 *  resolve would otherwise pass the closed filter with its tail minutes of
 *  price action missing, and a tp booked on that truncated bar is permanent. */
export function resolveOpenSignals(open: ResolveInput[], barsByPair: Partial<Record<Pair, Partial<Record<Timeframe, Bar[]>>>>, now = Date.now()): Resolution[] {
  const out: Resolution[] = [];
  for (const s of open) {
    const raw = barsByPair[s.pair]?.[s.timeframe];
    if (!raw?.length) continue;
    // CLOSED bars only — the backtest never sees a forming bar, so the resolver
    // must not either (a forming bar's provisional high could book a tp the
    // completed bar would book as sl under the stop-first rule, and Yahoo's
    // live-quote pseudo-row would inflate the expiry bar count).
    const bars = closedBars(raw, s.timeframe, now);
    if (!bars.length) continue;
    const dir = s.direction === "long" ? 1 : -1;
    const cost = (SPREAD_PIPS[s.pair] / 2 + SLIPPAGE_PIPS) * PIP[s.pair];
    const entry = s.entry + dir * cost;
    const target = s.targets[s.targets.length - 1];
    const risk = Math.abs(entry - s.stop);
    if (!(risk > 0)) continue;
    // resolve only against bars STRICTLY AFTER the signal bar's open (the signal
    // bar is where the setup fired; the trade is live from its close onward).
    const after = Date.parse(s.barTime);
    let barsSeen = 0;
    for (const b of bars) {
      if (b.t <= after) continue;
      barsSeen++;
      const hitStop = dir === 1 ? b.l <= s.stop : b.h >= s.stop;
      const hitTp = dir === 1 ? b.h >= target : b.l <= target;
      if (hitStop) {
        const fill = (dir === 1 ? Math.min(b.o, s.stop) : Math.max(b.o, s.stop)) - dir * cost;
        out.push({ id: s.id, status: "sl", resultR: Number(((dir * (fill - entry)) / risk).toFixed(2)), resolvedAt: new Date(b.t).toISOString() });
        break;
      }
      if (hitTp) {
        const fill = (dir === 1 ? Math.max(b.o, target) : Math.min(b.o, target)) - dir * cost;
        out.push({ id: s.id, status: "tp", resultR: Number(((dir * (fill - entry)) / risk).toFixed(2)), resolvedAt: new Date(b.t).toISOString() });
        break;
      }
      if (barsSeen >= (s.maxBars ?? SIGNAL_TTL_BARS[s.timeframe])) {
        const fill = b.c - dir * cost;
        out.push({ id: s.id, status: "expired", resultR: Number(((dir * (fill - entry)) / risk).toFixed(2)), resolvedAt: new Date(b.t).toISOString() });
        break;
      }
    }
  }
  return out;
}

/** Scan one pair: fetch data, build live context, run its champions.
 *  `extraTfs` = timeframes of still-open signals (possibly from a RETIRED
 *  champion after a research re-run) — their bars must keep flowing so every
 *  open signal always resolves; a signal may never be orphaned. */
export async function scanPair(pair: Pair, events: EconomicEvent[], now = Date.now(), extraTfs: Timeframe[] = []): Promise<{ scan: PairScan; bars: Partial<Record<Timeframe, Bar[]>> }> {
  const pb = playbooks.find((p) => p.pair === pair);
  const tfs = new Set<Timeframe>(["1h", ...extraTfs]);
  for (const c of pb?.champions ?? []) tfs.add(c.timeframe);
  const bars: Partial<Record<Timeframe, Bar[]>> = {};
  for (const tf of tfs) bars[tf] = await fetchBars(pair, tf, FETCH_RANGE[tf]);

  const h1 = bars["1h"]!;
  const a = atr(h1, 14);
  const i = h1.length - 1;
  const volP = percentileRank(a, i, Math.min(400, i));
  const price = h1[i].c;
  const dayAgoIdx = Math.max(0, i - 24);
  const scan: PairScan = {
    pair,
    price,
    changePct: Number((((price - h1[dayAgoIdx].c) / h1[dayAgoIdx].c) * 100).toFixed(2)),
    atrPips: Number((a[i] / PIP[pair]).toFixed(1)),
    volRegime: volRegimeOf(volP),
    session: sessionLabel(now),
    barsAgeMin: Math.round((now - h1[i].t) / 60000),
    candidates: [],
  };
  if (!pb?.champions.length) return { scan, bars }; // monitor-only pair

  for (const champ of pb.champions) {
    const strat = strategyById(champ.strategy);
    const tfBars = bars[champ.timeframe];
    if (!strat || !tfBars || tfBars.length < 60) continue;
    // CLOSED bars only, selected by TIME — Yahoo appends a forming bar AND a
    // live-quote pseudo-row during market hours; slicing one off is not enough.
    const closed = closedBars(tfBars, champ.timeframe, now);
    if (closed.length < 60) continue;
    // a champion whose warmup exceeds the live window must fail LOUDLY, not
    // silently produce zero setups forever
    if (strat.warmupBars && closed.length < strat.warmupBars) {
      scan.error = [scan.error, `${champ.strategy}@${champ.timeframe}: ${closed.length} live bars < ${strat.warmupBars} warmup`].filter(Boolean).join("; ");
      continue;
    }
    // FRESHNESS: the newest closed bar must be recent (guards provider staleness
    // and DST session-boundary drift) — a stale setup is never actionable.
    if (now - (closed[closed.length - 1].t + INTERVAL_MS[champ.timeframe]) > 2 * INTERVAL_MS[champ.timeframe]) continue;
    const setups = strat.run(closed, champ.params, pair, champ.timeframe);
    const last = setups[setups.length - 1];
    if (!last || last.barIndex !== closed.length - 1) continue; // must fire on the newest closed bar
    const news = newsRiskAt(pair, now, events);
    const { score, warnings } = confidenceFor(last, pb, volP, news, champ.timeframe);
    const risk = Math.abs(last.entry - last.stop);
    const finalTarget = last.targets[last.targets.length - 1];
    const sig: LiveSignal = {
      pair,
      timeframe: champ.timeframe,
      direction: last.direction,
      entry: last.entry,
      stop: last.stop,
      targets: last.targets,
      rr: Number((Math.abs(finalTarget - last.entry) / risk).toFixed(2)),
      confidence: score,
      strategy: champ.strategy,
      factors: last.factors,
      structure: structureLine(closed),
      volRegime: scan.volRegime,
      session: scan.session,
      newsRisk: { level: news.level, events: news.events.slice(0, 3).map((e) => ({ title: e.title, currency: e.currency, at: new Date(e.at).toISOString(), impact: e.impact })) },
      warnings,
      status: score >= CONFIDENCE_THRESHOLD ? "open" : "suppressed",
      maxBars: last.maxBars,
      barTime: new Date(closed[closed.length - 1].t).toISOString(),
    };
    scan.candidates.push(sig);
  }
  return { scan, bars };
}

export type ScanResult = {
  marketOpen: boolean;
  startedAt: string;
  durationMs: number;
  pairs: PairScan[];
  errors: { pair: Pair; message: string }[];
  events: EconomicEvent[];
};

export async function runScan(pairs: Pair[], now = Date.now(), extraTfsByPair: Partial<Record<Pair, Timeframe[]>> = {}, providedEvents?: EconomicEvent[]): Promise<{ result: ScanResult; barsByPair: Partial<Record<Pair, Partial<Record<Timeframe, Bar[]>>>> }> {
  const started = Date.now();
  const open = isMarketOpen(now);
  const result: ScanResult = { marketOpen: open, startedAt: new Date(started).toISOString(), durationMs: 0, pairs: [], errors: [], events: [] };
  const barsByPair: Partial<Record<Pair, Partial<Record<Timeframe, Bar[]>>>> = {};
  // Market closed → cheap heartbeat: no data fetches, no signals, no resolution.
  if (!open) {
    result.durationMs = Date.now() - started;
    return { result, barsByPair };
  }
  // Calendar: use the events the caller supplies (the scan route reads/refreshes
  // the cached copy — one fetch per cycle, not one per page load). Only fetch
  // here as a fallback (e.g. the smoke test calls runScan directly).
  let events: EconomicEvent[] = providedEvents ?? [];
  if (!providedEvents) {
    try {
      events = await fetchCalendar();
    } catch {
      /* calendar is an enhancement — a fetch miss must never stop price analysis */
    }
  }
  result.events = events.filter((e) => e.impact === "High" && e.at > now - 3600_000 && e.at < now + 48 * 3600_000);

  // pairs scan sequentially-ish (3 at a time) to stay polite to the provider
  // while keeping a 12-pair sweep well inside the route's time budget
  const queue = [...pairs];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const pair = queue.shift()!;
      try {
        const { scan, bars } = await scanPair(pair, events, now, extraTfsByPair[pair] ?? []);
        result.pairs.push(scan);
        barsByPair[pair] = bars;
      } catch (e) {
        result.errors.push({ pair, message: e instanceof Error ? e.message : String(e) });
      }
    }
  });
  await Promise.all(workers);
  result.pairs.sort((a, b) => a.pair.localeCompare(b.pair));
  result.durationMs = Date.now() - started;
  return { result, barsByPair };
}

/** Human line used by notifications & the AI prompt. */
export function signalHeadline(s: LiveSignal): string {
  return `${s.pair} ${s.direction.toUpperCase()} @ ${fmtPrice(s.pair, s.entry)} · SL ${fmtPrice(s.pair, s.stop)} · TP ${s.targets.map((t) => fmtPrice(s.pair, t)).join(" / ")} · ${s.rr}R · ${s.confidence}%`;
}
