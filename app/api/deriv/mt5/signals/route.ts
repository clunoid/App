import { NextRequest, NextResponse } from "next/server";
import { runEngine, type EngineResult } from "@/lib/deriv/mt5/engine";
import type { MarketCategory, RiskProfile } from "@/lib/deriv/mt5/types";

/**
 * GET /api/deriv/mt5/signals?profile=moderate&category=forex
 *
 * The single source of truth for both the dashboard and the EA. Computes ARDE
 * signals for the requested basket + risk profile. Node runtime (opens a Deriv
 * WebSocket via `ws`). A short in-memory cache keeps EA polling from re-fetching
 * candles more than every ~25s (signals carry their own ttl).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILES = new Set<RiskProfile>(["conservative", "moderate", "aggressive"]);
const CACHE_MS = 25_000;
const cache = new Map<string, { at: number; data: EngineResult }>();

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const profile = (sp.get("profile") || "moderate") as RiskProfile;
  if (!PROFILES.has(profile)) {
    return NextResponse.json({ error: "invalid profile" }, { status: 400 });
  }
  const category = (sp.get("category") || "forex") as MarketCategory;
  const key = `${profile}:${category}`;

  const format = sp.get("format"); // "csv" for the MT5 EA (no JSON parser in MQL5)

  const hit = cache.get(key);
  let data: EngineResult;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    data = hit.data;
  } else {
    try {
      data = await runEngine(profile, category);
      cache.set(key, { at: Date.now(), data });
    } catch (e) {
      if (hit) data = hit.data;
      else return NextResponse.json({ error: e instanceof Error ? e.message : "engine error" }, { status: 502 });
    }
  }

  if (format === "csv") return new NextResponse(toCsv(data), { headers: { "content-type": "text/plain; charset=utf-8" } });
  return NextResponse.json({ ...data, cached: !!(hit && Date.now() - hit.at < CACHE_MS) });
}

/** EA-friendly feed: one line per signal — SYMBOL,SIDE,ENTRY,SL,TP,RISKPCT,CONF,DIGITS. */
function toCsv(d: EngineResult): string {
  const head = `# clunoid mt5 | profile=${d.profile} | ts=${d.generatedAt} | signals=${d.signals.length}`;
  const rows = d.signals.map((s) =>
    [s.symbol, s.side, s.entry, s.stopLoss, s.takeProfit, s.riskPct, s.confidence, s.digits].join(","),
  );
  return [head, ...rows].join("\n") + "\n";
}
