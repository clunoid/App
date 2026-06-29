import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { MIN_TOPUP_CENTS } from "@/lib/billing/costs";

export const runtime = "nodejs";

/** Read the current user's auto-reload settings (RLS select-own). */
export async function GET() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const { data } = await supabase.from("auto_reload").select("enabled, threshold, amount_cents").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({
    configured: !!data,
    enabled: !!data?.enabled,
    threshold: data?.threshold ?? 100,
    amountCents: data?.amount_cents ?? 10000,
  });
}

/** Save the current user's auto-reload preferences (server clamps amount/threshold;
 *  the lock + the actual off-session charge are managed server-side, never here). */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  let body: { enabled?: boolean; threshold?: number; amountCents?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* defaults below */
  }
  const enabled = !!body.enabled;
  const threshold = Math.max(0, Math.round(Number(body.threshold) || 0));
  const amountCents = Math.max(MIN_TOPUP_CENTS, Math.round(Number(body.amountCents) || MIN_TOPUP_CENTS));

  const { error } = await supabase.rpc("set_auto_reload", {
    p_enabled: enabled,
    p_threshold: threshold,
    p_amount_cents: amountCents,
  });
  if (error) return NextResponse.json({ error: "save-failed" }, { status: 500 });

  // Return the values as the DB stored them (it clamps to the $5 min / sanity caps).
  const { data } = await supabase.from("auto_reload").select("enabled, threshold, amount_cents").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({
    ok: true,
    enabled: !!data?.enabled,
    threshold: data?.threshold ?? threshold,
    amountCents: data?.amount_cents ?? amountCents,
  });
}
