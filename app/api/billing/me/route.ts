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

  const [{ data: sub }, { data: bal }, { data: ar }] = await Promise.all([
    supabase.from("subscriptions").select("plan, status, current_period_end").eq("user_id", userId).maybeSingle(),
    supabase.from("credit_balances").select("balance, monthly_grant, purchased, period_start").eq("user_id", userId).maybeSingle(),
    supabase.from("auto_reload").select("enabled, threshold, amount_cents").eq("user_id", userId).maybeSingle(),
  ]);

  const monthly = bal?.balance ?? 0;
  const purchased = bal?.purchased ?? 0;
  return NextResponse.json({
    authed: true,
    plan: (sub?.plan as string) ?? "free",
    status: (sub?.status as string) ?? "active",
    periodEnd: sub?.current_period_end ?? null,
    balance: monthly + purchased, // total spendable (monthly allowance + purchased)
    purchased,
    monthlyGrant: bal?.monthly_grant ?? 0,
    autoReload: {
      configured: !!ar, // false until the user has saved their auto-reload prefs
      enabled: !!ar?.enabled,
      threshold: ar?.threshold ?? 100,
      amountCents: ar?.amount_cents ?? 10000,
    },
  });
}
