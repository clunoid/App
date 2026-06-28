import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** The current user's plan + credit balance (RLS-scoped, read-your-own). Returns
 *  { authed:false } for signed-out visitors so the UI just hides the credit chip. */
export async function GET() {
  const supabase = await getSupabaseServer();
  let userId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ authed: false });

  const [{ data: sub }, { data: bal }] = await Promise.all([
    supabase.from("subscriptions").select("plan, status, current_period_end").eq("user_id", userId).maybeSingle(),
    supabase.from("credit_balances").select("balance, monthly_grant, period_start").eq("user_id", userId).maybeSingle(),
  ]);

  return NextResponse.json({
    authed: true,
    plan: (sub?.plan as string) ?? "free",
    status: (sub?.status as string) ?? "active",
    periodEnd: sub?.current_period_end ?? null,
    balance: bal?.balance ?? 0,
    monthlyGrant: bal?.monthly_grant ?? 0,
  });
}
