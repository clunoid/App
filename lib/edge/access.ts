import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/billing/meter";

/**
 * Edge is a PAID feature — usable by Pro/Max subscribers or anyone holding
 * purchased credits (admins bypass, same as every metered route). This mirrors the
 * Motion-Graphics access gate and is SERVER-AUTHORITATIVE: it reads the plan from
 * the user's own DB rows keyed on the verified session id, so the client can't
 * bypass it. Returns a 402 `{error:"plan"}` response when the user isn't entitled,
 * else null (caller proceeds to charge credits).
 */
export async function edgeDenied(user: User): Promise<NextResponse | null> {
  if (isAdmin(user)) return null;
  const supabase = await getSupabaseServer();
  const [sub, bal] = await Promise.all([
    supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle(),
    supabase.from("credit_balances").select("purchased").eq("user_id", user.id).maybeSingle(),
  ]);
  const plan = (sub.data?.plan as string) || "free";
  const purchased = (bal.data?.purchased as number) || 0;
  if (plan === "pro" || plan === "max" || purchased > 0) return null;
  return NextResponse.json({ error: "plan", feature: "edge" }, { status: 402 });
}
