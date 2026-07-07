import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PAIRS, type LiveSignal, type Pair, type Timeframe } from "@/lib/trading/types";
import { runScan, resolveOpenSignals, CONFIDENCE_THRESHOLD, type ResolveInput } from "@/lib/trading/engine";
import { annotateSignal } from "@/lib/trading/ai";

export const runtime = "nodejs";
export const maxDuration = 300; // worst-case provider retries + per-signal annotation

/**
 * THE SCANNER — one full analysis cycle. Invoked two ways (belt and braces, so
 * the system keeps running regardless of hosting-plan cron granularity):
 *   • Vercel Cron (vercel.json — daily baseline on Hobby, every-15-min on Pro) —
 *     authorized by CRON_SECRET (Vercel sends it as the Bearer token automatically)
 *   • the trading terminal's self-healing loop while an admin has it open
 *     (session-authorized) — the true continuous 24/5 driver today
 *   • any external scheduler POSTing with `Authorization: Bearer $CRON_SECRET`
 *
 * A cycle: market clock → fetch fresh bars per pair → resolve open signals
 * (tp/sl/expiry, backtest-identical touch rules) → run validated champions →
 * filter + confidence-score candidates → AI-annotate passers → persist →
 * heartbeat. Correctness over speed: a pair's data failure records an error and
 * is skipped; nothing is ever estimated to keep a scan "complete".
 */
// Vercel Cron invokes GET; the terminal uses POST. Same handler, same auth.
export async function GET(req: NextRequest) {
  return handleScan(req);
}
export async function POST(req: NextRequest) {
  return handleScan(req);
}

async function handleScan(req: NextRequest) {
  // ── auth: cron secret OR admin session ──
  const bearer = req.headers.get("authorization") || "";
  const cronOk = !!process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const user = await requireUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no service role" }, { status: 500 });

  const t0 = Date.now();

  // Open signals are read BEFORE the scan so their timeframes' bars are fetched
  // even if a research re-run retired that champion — a signal is never orphaned.
  let open: Record<string, unknown>[] = [];
  let openErr: string | null = null;
  {
    const q = await db
      .from("trading_signals")
      .select("id,pair,timeframe,direction,entry,stop,targets,bar_time,max_bars")
      .eq("status", "open");
    // supabase-js reports failures via `error`, it does not throw — a silent
    // miss here would freeze ALL outcome resolution with zero observability
    if (q.error) openErr = `open-select: ${q.error.message}`;
    open = q.data ?? [];
  }
  const extraTfs: Partial<Record<Pair, Timeframe[]>> = {};
  for (const o of open) {
    const list = (extraTfs[o.pair as Pair] ??= []);
    const tf = o.timeframe as Timeframe;
    if (!list.includes(tf)) list.push(tf);
  }

  const { result, barsByPair } = await runScan(PAIRS, Date.now(), extraTfs);

  let resolved = 0;
  let inserted = 0;
  const notes: string[] = result.errors.map((e) => `${e.pair}: ${e.message}`);
  if (openErr) notes.push(openErr);

  if (result.marketOpen) {
    // 1 ── resolve open signals against the fresh bars
    try {
      if (open?.length) {
        const inputs: ResolveInput[] = open.map((o) => ({
          id: o.id as string,
          pair: o.pair as ResolveInput["pair"],
          timeframe: o.timeframe as ResolveInput["timeframe"],
          direction: o.direction as ResolveInput["direction"],
          entry: o.entry as number,
          stop: o.stop as number,
          targets: (o.targets as number[]) || [],
          barTime: o.bar_time as string,
          maxBars: o.max_bars as number | null,
        }));
        // closedness is judged at the time the bars were FETCHED (scan start),
        // never at resolve time — a bar whose boundary falls inside the scan
        // would otherwise be treated as closed with its tail minutes missing
        for (const r of resolveOpenSignals(inputs, barsByPair, Date.parse(result.startedAt))) {
          const { error } = await db
            .from("trading_signals")
            .update({ status: r.status, result_r: r.resultR, resolved_at: r.resolvedAt })
            .eq("id", r.id)
            .eq("status", "open");
          if (!error) resolved++;
        }
      }
    } catch (e) {
      notes.push(`resolve: ${e instanceof Error ? e.message : e}`);
    }

    // 2 ── persist new candidates. Insert FIRST (the unique index rejects repeats
    //      cheaply) → only annotate with Sonnet when the row is genuinely new →
    //      update it in place. This never spends AI on a duplicate.
    for (const pairScan of result.pairs) {
      for (const sig of pairScan.candidates) {
        if (sig.status !== "open" || sig.confidence < CONFIDENCE_THRESHOLD) continue; // suppressed → not persisted
        // one open position per champion — mirrors the backtester's busyUntil
        // rule, so the live R stream contains only trades the validation would
        // also have taken (overlapping re-fires are skipped, not stacked)
        if (open.some((o) => o.pair === sig.pair && o.strategy === sig.strategy && o.timeframe === sig.timeframe)) continue;
        try {
          const { data: row, error } = await db.from("trading_signals").insert(toRow(sig)).select("id").single();
          if (error) {
            if (!/duplicate|unique/i.test(error.message)) notes.push(`insert ${sig.pair}: ${error.message}`);
            continue; // already known → skip AI
          }
          inserted++;
          const ai = await annotateSignal(sig, result.events); // best-effort, new signals only
          if (ai) await db.from("trading_signals").update({ ai_narrative: ai }).eq("id", (row as { id: string }).id);
        } catch (e) {
          notes.push(`persist ${sig.pair}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  // 3 ── heartbeat (observability; pruned server-side)
  try {
    await db.from("trading_scans").insert({
      duration_ms: Date.now() - t0,
      market_open: result.marketOpen,
      pairs_ok: result.pairs.length,
      pairs_err: result.errors.length,
      new_signals: inserted,
      resolved,
      notes,
    });
    if (Math.random() < 0.05) await db.rpc("prune_trading_scans");
  } catch {
    /* heartbeat must never fail a scan */
  }

  return NextResponse.json({
    ok: true,
    marketOpen: result.marketOpen,
    durationMs: Date.now() - t0,
    pairs: result.pairs.length,
    errors: result.errors,
    newSignals: inserted,
    resolved,
  });
}

function toRow(s: LiveSignal) {
  return {
    pair: s.pair,
    timeframe: s.timeframe,
    direction: s.direction,
    entry: s.entry,
    stop: s.stop,
    targets: s.targets,
    rr: s.rr,
    confidence: s.confidence,
    strategy: s.strategy,
    factors: s.factors,
    structure: s.structure,
    vol_regime: s.volRegime,
    session: s.session,
    news_risk: s.newsRisk,
    warnings: s.warnings,
    status: "open",
    max_bars: s.maxBars ?? null,
    bar_time: s.barTime ?? new Date().toISOString(),
  };
}
