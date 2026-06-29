import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { RATE_LIMITS } from "./costs";

/**
 * Server-side metering. The flow for every expensive route:
 *   1. verify the session (401 if absent — never trust the client),
 *   2. rate-limit the user (429 if bursting),
 *   3. PRE-CHARGE the credits atomically (402 if insufficient; can't go negative).
 * If the work later fails, call refund() so the user keeps their credits.
 *
 * `gate()` does all three for routes that are entirely chargeable.
 * For routes with a cheap free path (e.g. /api/stats default data), use
 * requireUser() for auth, then chargeCredits()/chargeError() right before the
 * expensive call.
 */

export type Charge = { ok: true; balance: number } | { ok: false; status: 402 | 429; balance: number };

/** Read the current user's spendable credits (monthly balance + purchased),
 *  accounting for a due monthly refill. Read-only — for a PRE-CHECK before an
 *  expensive action so we never run heavy compute a user can't pay for. Returns
 *  null when unauthenticated. Lenient on the refill boundary (never false-blocks). */
export async function creditsAvailable(): Promise<number | null> {
  const supabase = await getSupabaseServer();
  let user: User | null = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    user = null;
  }
  if (!user) return null;
  const { data } = await supabase
    .from("credit_balances")
    .select("balance, purchased, monthly_grant, period_start")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return 0;
  const periodMs = new Date(data.period_start as string).getTime();
  // ~1 month, slightly lenient so a user about to refill is never blocked.
  const refillDue = Number.isFinite(periodMs) && Date.now() - periodMs >= 27 * 24 * 3600 * 1000;
  const monthly = refillDue ? (data.monthly_grant as number) : (data.balance as number);
  return (monthly || 0) + ((data.purchased as number) || 0);
}

/** Rate-limit + atomically pre-charge the CURRENT user (call after auth). */
export async function chargeCredits(action: string, amount: number, meta: Record<string, unknown> = {}): Promise<Charge> {
  const supabase = await getSupabaseServer();
  const limit = RATE_LIMITS[action];
  if (limit) {
    const { data: allowed } = await supabase.rpc("rate_check", { p_action: action, p_max: limit[0], p_window_secs: limit[1] });
    if (allowed === false) return { ok: false, status: 429, balance: -1 };
  }
  const { data, error } = await supabase.rpc("consume_credits", { p_amount: amount, p_action: action, p_meta: meta });
  const d = (data ?? null) as { ok: boolean; balance: number } | null;
  if (error || !d || !d.ok) return { ok: false, status: 402, balance: d?.balance ?? 0 };
  return { ok: true, balance: d.balance };
}

/** The standard JSON Response for a failed charge (429 rate / 402 out of credits). */
export function chargeError(c: Extract<Charge, { ok: false }>): NextResponse {
  return NextResponse.json(c.status === 429 ? { error: "rate" } : { error: "credits", balance: c.balance }, { status: c.status });
}

export type Gate = { ok: true; userId: string; balance: number } | { ok: false; res: NextResponse };

/** Full gate (auth + rate + pre-charge) for routes that are entirely chargeable. */
export async function gate(action: string, amount: number, meta: Record<string, unknown> = {}): Promise<Gate> {
  const supabase = await getSupabaseServer();
  let user: User | null = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    user = null;
  }
  if (!user) return { ok: false, res: NextResponse.json({ error: "auth" }, { status: 401 }) };

  const limit = RATE_LIMITS[action];
  if (limit) {
    const { data: allowed } = await supabase.rpc("rate_check", { p_action: action, p_max: limit[0], p_window_secs: limit[1] });
    if (allowed === false) return { ok: false, res: NextResponse.json({ error: "rate" }, { status: 429 }) };
  }
  const { data, error } = await supabase.rpc("consume_credits", { p_amount: amount, p_action: action, p_meta: meta });
  const d = (data ?? null) as { ok: boolean; balance: number } | null;
  if (error || !d || !d.ok) return { ok: false, res: NextResponse.json({ error: "credits", balance: d?.balance ?? 0 }, { status: 402 }) };
  return { ok: true, userId: user.id, balance: d.balance };
}

/** Best-effort refund of an already-charged action that failed. Needs the service
 *  role; no-ops (logs nothing) if SUPABASE_SERVICE_ROLE_KEY isn't configured. */
export async function refund(userId: string, amount: number, action: string): Promise<void> {
  if (amount <= 0) return;
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.rpc("refund_credits", { p_user: userId, p_amount: amount, p_action: action });
  } catch {
    /* best-effort — never block the response on a refund */
  }
}
