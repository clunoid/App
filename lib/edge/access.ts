import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/billing/meter";

/**
 * Edge is a PAID feature — usable by Pro/Max subscribers or anyone holding
 * purchased credits (admins bypass, same as every metered route). This is
 * SERVER-AUTHORITATIVE: it reads the plan from the user's own DB rows keyed on the
 * verified session id, so the client can never bypass it. `edgeEntitled` is the
 * single source of truth, used both by the on-open UI check (/api/edge/access) and
 * the per-action gate (edgeDenied) — so the visible gate and the real enforcement
 * can never disagree.
 */
export async function edgeEntitled(user: User): Promise<boolean> {
  if (isAdmin(user)) return true;
  const supabase = await getSupabaseServer();
  const [sub, bal] = await Promise.all([
    supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle(),
    supabase.from("credit_balances").select("purchased").eq("user_id", user.id).maybeSingle(),
  ]);
  const plan = (sub.data?.plan as string) || "free";
  const purchased = (bal.data?.purchased as number) || 0;
  return plan === "pro" || plan === "max" || purchased > 0;
}

/** 402 `{error:"plan"}` response when the user isn't entitled to use Edge, else null
 *  (caller proceeds to charge credits). Enforced on every paid action route. */
export async function edgeDenied(user: User): Promise<NextResponse | null> {
  return (await edgeEntitled(user)) ? null : NextResponse.json({ error: "plan", feature: "edge" }, { status: 402 });
}
