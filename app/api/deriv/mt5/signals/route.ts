import { NextRequest, NextResponse } from "next/server";
import { runEngine, type EngineResult } from "@/lib/deriv/mt5/engine";
import { PROFILES } from "@/lib/deriv/mt5/profiles";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MarketCategory, RiskProfile } from "@/lib/deriv/mt5/types";

/**
 * GET /api/deriv/mt5/signals
 *   ?bot=<botId>                — the universal EA: profile + market selection
 *                                 come from the user's saved config on clunoid.com
 *   ?profile=&categories=a,b    — explicit override (dashboard preview)
 *   &format=csv                 — EA feed (MQL5 has no JSON parser)
 *
 * The single source of truth for both the dashboard and the EA. Node runtime
 * (opens a Deriv WebSocket via `ws`). A short in-memory cache keeps EA polling
 * from re-fetching candles more than every ~25s.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PROFILES = new Set<RiskProfile>(["conservative", "moderate", "aggressive"]);
const VALID_CATEGORIES = new Set<MarketCategory>(["forex", "volatility", "crash_boom", "step", "metals", "crypto"]);
const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const CACHE_MS = 25_000;
const cache = new Map<string, { at: number; data: EngineResult }>();
// Bot configs change rarely; cache lookups briefly so EA polls don't hammer the DB.
const botCache = new Map<string, { at: number; profile: RiskProfile; categories: MarketCategory[] }>();
const BOT_CACHE_MS = 60_000;

async function botConfig(id: string): Promise<{ profile: RiskProfile; categories: MarketCategory[] }> {
  const hit = botCache.get(id);
  if (hit && Date.now() - hit.at < BOT_CACHE_MS) return hit;
  let profile: RiskProfile = "aggressive";
  let categories: MarketCategory[] = ["forex"];
  const db = getSupabaseAdmin();
  if (db) {
    const { data } = await db.from("mt5_bot_configs").select("profile, categories").eq("bot_id", id).maybeSingle();
    if (data) {
      if (VALID_PROFILES.has(data.profile as RiskProfile)) profile = data.profile as RiskProfile;
      const cats = (data.categories || []).filter((c: string) => VALID_CATEGORIES.has(c as MarketCategory));
      if (cats.length) categories = cats as MarketCategory[];
    }
  }
  const cfg = { at: Date.now(), profile, categories };
  botCache.set(id, cfg);
  return cfg;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const bot = sp.get("bot") || "";

  let profile: RiskProfile;
  let categories: MarketCategory[];
  if (bot && ID_RE.test(bot)) {
    ({ profile, categories } = await botConfig(bot));
  } else {
    profile = (sp.get("profile") || "aggressive") as RiskProfile;
    if (!VALID_PROFILES.has(profile)) {
      return NextResponse.json({ error: "invalid profile" }, { status: 400 });
    }
    const raw = (sp.get("categories") || sp.get("category") || "forex").split(",");
    categories = raw.filter((c) => VALID_CATEGORIES.has(c as MarketCategory)) as MarketCategory[];
    if (!categories.length) categories = ["forex"];
  }

  const key = `${profile}:${[...categories].sort().join("+")}`;
  const format = sp.get("format"); // "csv" for the MT5 EA

  const hit = cache.get(key);
  let data: EngineResult;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    data = hit.data;
  } else {
    try {
      data = await runEngine(profile, categories);
      cache.set(key, { at: Date.now(), data });
    } catch (e) {
      if (hit) data = hit.data;
      else return NextResponse.json({ error: e instanceof Error ? e.message : "engine error" }, { status: 502 });
    }
  }

  if (format === "csv") return new NextResponse(toCsv(data), { headers: { "content-type": "text/plain; charset=utf-8" } });
  return NextResponse.json({ ...data, cached: !!(hit && Date.now() - hit.at < CACHE_MS) });
}

/**
 * EA-friendly feed: one line per signal. Columns:
 *   SYMBOL,SIDE,ENTRY,SL,TP,RISKPCT,CONF,DIGITS,TRAILATR,PARTIALS,ADDS,CLUSTER
 * PARTIALS = "price:closePct;…" (or "-"); ADDS = "price:sizePct;…" (winner-side,
 * above entry); CLUSTER = correlation group. The `# caps:` header carries the
 * profile's aggregate limits; `ts=` lets the EA discard stale feeds.
 */
function toCsv(d: EngineResult): string {
  const p = PROFILES[d.profile] ?? PROFILES.moderate;
  const head =
    `# clunoid mt5 | profile=${d.profile} | ts=${d.generatedAt} | signals=${d.signals.length} | cats=${d.categories.join("+")}\n` +
    `# caps: maxOpenRisk=${p.maxOpenRiskPct} corrCap=${p.corrClusterCap}\n` +
    `# cols: SYMBOL,SIDE,ENTRY,SL,TP,RISKPCT,CONF,DIGITS,TRAILATR,PARTIALS(p:c;..),ADDS(p:s;..),CLUSTER`;
  const rows = d.signals.map((s) =>
    [
      s.symbol, s.side, s.entry, s.stopLoss, s.takeProfit, s.riskPct, s.confidence, s.digits,
      s.trailAtr,
      s.partials.map((pp) => `${pp.price}:${pp.closePct}`).join(";") || "-",
      s.adds.map((a) => `${a.price}:${a.sizePct}`).join(";") || "-",
      s.corr || "-",
    ].join(","),
  );
  return [head, ...rows].join("\n") + "\n";
}
