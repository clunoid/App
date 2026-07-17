import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * MT5 BOT CONFIG — pairs the user's website choices with their EA.
 *
 * The user sets the EA up ONCE in MT5 with a Bot ID (a random code the page
 * generates). On clunoid.com they pick the risk profile and which markets the
 * bot trades (one or many); the EA polls the signal feed with that Bot ID and
 * the server applies the saved selection. No account/sign-in — the Bot ID is
 * the (bearer) key, which is why it's long and random.
 *
 *   GET  /api/deriv/mt5/bot?id=<botId>          → { profile, categories }
 *   POST /api/deriv/mt5/bot { id, profile, categories } → save
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const PROFILES = new Set(["conservative", "moderate", "aggressive"]);
const CATEGORIES = new Set(["forex", "volatility", "crash_boom", "step", "metals", "crypto"]);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!ID_RE.test(id)) return NextResponse.json({ error: "invalid bot id" }, { status: 400 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  const { data, error } = await db.from("mt5_bot_configs").select("profile, categories").eq("bot_id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Unknown id → sensible defaults (the EA works before the first save).
  return NextResponse.json(data ?? { profile: "aggressive", categories: ["forex"] });
}

export async function POST(req: NextRequest) {
  let body: { id?: string; profile?: string; categories?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const id = body.id || "";
  if (!ID_RE.test(id)) return NextResponse.json({ error: "invalid bot id" }, { status: 400 });
  const profile = PROFILES.has(body.profile || "") ? (body.profile as string) : "aggressive";
  const categories = (body.categories || []).filter((c) => CATEGORIES.has(c));
  if (!categories.length) categories.push("forex");

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  const { error } = await db.from("mt5_bot_configs").upsert({
    bot_id: id, profile, categories, updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profile, categories });
}
