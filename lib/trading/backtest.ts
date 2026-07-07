/**
 * Bar-replay backtester — matched to the LIVE engine so validation == production:
 *   • entry fills at the SIGNAL BAR's close + half-spread + slippage (exactly the
 *     price the live engine publishes and resolves from — types.ts:31),
 *   • every exit pays half-spread + slippage too; a bar that OPENS past the stop
 *     or target fills at the (worse/actual) open, not the level — weekend gaps
 *     are booked honestly, never censored,
 *   • when one bar touches stop AND target, the STOP fills first (conservative),
 *   • one open position per pair (overlapping setups skipped, as live),
 *   • trades still open after `maxBars` exit at that bar's close ("expiry").
 * Results are R-multiples so metrics are account-size agnostic and the identical
 * cost + exit math powers live signal outcome tracking (see resolveOpenSignals).
 */
import type { Bar, Metrics, Pair, Setup, SimTrade } from "./types";
import { PIP, SLIPPAGE_PIPS, SPREAD_PIPS } from "./types";

export type BacktestOpts = { maxBars?: number };

export function simulate(bars: Bar[], setups: Setup[], pair: Pair, opts: BacktestOpts = {}): SimTrade[] {
  const maxBars = opts.maxBars ?? 60;
  const cost = (SPREAD_PIPS[pair] / 2 + SLIPPAGE_PIPS) * PIP[pair]; // per side, price units
  const trades: SimTrade[] = [];
  const byBar = new Map<number, Setup[]>();
  for (const s of setups) {
    const list = byBar.get(s.barIndex) || [];
    list.push(s);
    byBar.set(s.barIndex, list);
  }
  let busyUntil = -1; // bar index the current position occupies through
  for (let i = 0; i < bars.length - 1; i++) {
    if (i <= busyUntil) continue;
    const here = byBar.get(i);
    if (!here?.length) continue;
    const s = here[0]; // one position per pair — first setup on the bar wins
    const dir = s.direction === "long" ? 1 : -1;
    // fill at the signal bar's close + costs — the exact price the live engine
    // publishes; by strategy construction the stop is always on the far side of
    // the close, so the entry can never gap past its own stop.
    const entry = s.entry + dir * cost;
    const stop = s.stop;
    const target = s.targets[s.targets.length - 1]; // simulate to the FINAL target
    const risk = Math.abs(entry - stop);
    if (!(risk > 0) || !isFinite(risk)) continue;

    let exit = NaN;
    let exitTime = 0;
    let outcome: SimTrade["outcome"] = "expiry";
    let barsHeld = 0;
    // per-setup time-boxed exit (session strategies) — same expiry path, shorter
    // leash; the live resolver honors the identical bar count (engine TTL logic)
    const ttl = s.maxBars ?? maxBars;
    const lastJ = Math.min(bars.length, i + 1 + ttl) - 1;
    for (let j = i + 1; j <= lastJ; j++) {
      barsHeld = j - i;
      const b = bars[j];
      const hitStop = dir === 1 ? b.l <= stop : b.h >= stop;
      const hitTp = dir === 1 ? b.h >= target : b.l <= target;
      if (hitStop) {
        // a bar that OPENS beyond the stop fills at the (worse) open, not the level
        const stopFill = dir === 1 ? Math.min(b.o, stop) : Math.max(b.o, stop);
        exit = stopFill - dir * cost;
        exitTime = b.t;
        outcome = "sl";
        break;
      }
      if (hitTp) {
        const tpFill = dir === 1 ? Math.max(b.o, target) : Math.min(b.o, target);
        exit = tpFill - dir * cost;
        exitTime = b.t;
        outcome = "tp";
        break;
      }
      if (j === lastJ) {
        exit = b.c - dir * cost;
        exitTime = b.t;
        outcome = "expiry";
      }
    }
    if (!isFinite(exit)) continue;
    const r = (dir * (exit - entry)) / risk;
    trades.push({ pair, direction: s.direction, strategy: s.strategy, entryTime: bars[i].t, exitTime, entry, stop, target, exit, r, outcome, bars: barsHeld });
    busyUntil = i + barsHeld;
  }
  return trades;
}

export function computeMetrics(trades: SimTrade[]): Metrics {
  const n = trades.length;
  const rs = trades.map((t) => t.r);
  const wins = rs.filter((r) => r > 0).length;
  const grossW = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossL = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  const totalR = rs.reduce((a, b) => a + b, 0);
  const mean = n ? totalR / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, r) => a + (r - mean) * (r - mean), 0) / (n - 1)) : 0;
  let peak = 0;
  let dd = 0;
  let eq = 0;
  const equityCurve: number[] = [];
  let streak = 0;
  let maxStreak = 0;
  const byMonth: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  for (const t of trades) {
    eq += t.r;
    equityCurve.push(Number(eq.toFixed(3)));
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
    if (t.r < 0) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else streak = 0;
    const d = new Date(t.exitTime);
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    byMonth[mk] = Number(((byMonth[mk] || 0) + t.r).toFixed(3));
    const yk = String(d.getUTCFullYear());
    byYear[yk] = Number(((byYear[yk] || 0) + t.r).toFixed(3));
  }
  return {
    trades: n,
    wins,
    winRate: n ? wins / n : 0,
    profitFactor: grossL > 0 ? grossW / grossL : grossW > 0 ? Infinity : 0,
    expectancyR: mean,
    totalR: Number(totalR.toFixed(3)),
    maxDrawdownR: Number(dd.toFixed(3)),
    maxLossStreak: maxStreak,
    avgBarsHeld: n ? trades.reduce((a, t) => a + t.bars, 0) / n : 0,
    sharpeLike: sd > 0 ? mean / sd : 0,
    byMonth,
    byYear,
    equityCurve,
  };
}
