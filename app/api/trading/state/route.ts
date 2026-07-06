import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PAIRS, type Pair } from "@/lib/trading/types";
import { fetchBars, fetchCalendar } from "@/lib/trading/data";
import { atr, percentileRank } from "@/lib/trading/indicators";
import { PIP } from "@/lib/trading/types";
import { isMarketOpen, sessionLabel } from "@/lib/trading/sessions";
import { playbooks } from "@/lib/trading/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * TERMINAL STATE — everything the /trading dashboard renders in one call:
 * watchlist quotes + regimes, open & historical signals (RLS-guarded), rolling
 * performance, scan heartbeats, this week's high-impact calendar, playbook
 * summary and a compact H1 candle series per pair for the charts.
 * Admin-only: verified server-side on every request.
 */
export async function GET() {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = await getSupabaseServer(); // RLS as the admin user
  const now = Date.now();

  const [signalsQ, scansQ, calendar, quotes] = await Promise.all([
    supabase.from("trading_signals").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("trading_scans").select("*").order("id", { ascending: false }).limit(20),
    fetchCalendar().catch(() => []),
    Promise.all(
      PAIRS.map(async (pair) => {
        try {
          const bars = await fetchBars(pair, "1h", "10d");
          const i = bars.length - 1;
          const a = atr(bars, 14);
          const volP = percentileRank(a, i, Math.min(400, i));
          const dayAgo = Math.max(0, i - 24);
          return {
            pair,
            price: bars[i].c,
            changePct: Number((((bars[i].c - bars[dayAgo].c) / bars[dayAgo].c) * 100).toFixed(2)),
            atrPips: Number((a[i] / PIP[pair]).toFixed(1)),
            volRegime: volP < 0.25 ? "low" : volP < 0.75 ? "normal" : volP < 0.93 ? "high" : "extreme",
            ageMin: Math.round((now - bars[i].t) / 60000),
            candles: bars.slice(-140).map((b) => ({ t: Math.floor(b.t / 1000), o: b.o, h: b.h, l: b.l, c: b.c })),
          };
        } catch (e) {
          return { pair, error: e instanceof Error ? e.message : "data unavailable" };
        }
      })
    ),
  ]);

  const signals = signalsQ.data ?? [];
  const closed = signals.filter((s) => s.status !== "open" && s.status !== "suppressed" && typeof s.result_r === "number");
  const wins = closed.filter((s) => (s.result_r as number) > 0);
  const grossW = wins.reduce((a, s) => a + (s.result_r as number), 0);
  const grossL = -closed.filter((s) => (s.result_r as number) < 0).reduce((a, s) => a + (s.result_r as number), 0);

  return NextResponse.json({
    now: new Date(now).toISOString(),
    marketOpen: isMarketOpen(now),
    session: sessionLabel(now),
    quotes,
    signals,
    stats: {
      closed: closed.length,
      open: signals.filter((s) => s.status === "open").length,
      winRate: closed.length ? wins.length / closed.length : null,
      netR: Number(closed.reduce((a, s) => a + (s.result_r as number), 0).toFixed(2)),
      profitFactor: grossL > 0 ? Number((grossW / grossL).toFixed(2)) : null,
    },
    scans: scansQ.data ?? [],
    calendar: (calendar || [])
      .filter((e) => e.impact === "High" && e.at > now - 2 * 3600_000)
      .slice(0, 12)
      .map((e) => ({ title: e.title, currency: e.currency, at: new Date(e.at).toISOString(), forecast: e.forecast, previous: e.previous })),
    playbooks: playbooks.map((p) => ({ pair: p.pair, champions: p.champions, monitorOnly: !p.champions.length })),
  });
}
