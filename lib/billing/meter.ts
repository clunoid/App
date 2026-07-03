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

export type Charge =
  // fromBalance/fromPurchased = how much this charge drained from each bucket, so a
  // later failure can refund EXACTLY what was spent into the RIGHT bucket (via
  // refundSplit). Admin charges spend nothing → both 0.
  | { ok: true; balance: number; fromBalance: number; fromPurchased: number }
  | { ok: false; status: 402 | 429; balance: number };

/**
 * ADMIN accounts (the owner / testers) bypass credit gating entirely so every feature
 * is reachable without spending tokens. Identified by their IMMUTABLE Supabase user id
 * (ADMIN_USER_IDS, comma-separated, defaulting to the owner). Keyed on the id from the
 * server-VERIFIED session (supabase.auth.getUser) — never client-supplied — so it can't
 * be spoofed; and because a user id is unique and never reissued, it can't be squatted
 * even if the account were ever deleted (unlike an email, which could be re-registered).
 */
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "5191f3cf-f0e5-4187-9c08-8921eb57a64c")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_CREDITS = 1_000_000_000; // effectively unlimited
export const isAdmin = (user: User | null) => !!user?.id && ADMIN_USER_IDS.includes(user.id.toLowerCase());

/** The instant the monthly grant refills — `period_start + 1 calendar month` (UTC,
 *  clamped to the month's last day, exactly like Postgres `interval '1 month'`). This
 *  mirrors the authoritative `now() >= period_start + interval '1 month'` inside
 *  consume_credits, so the read-only pre-check below agrees with the atomic charge that
 *  follows — never optimistically passing (which would show a "verified" tick then 402)
 *  nor falsely blocking a user the real charge would actually serve. */
function refillBoundaryMs(periodMs: number): number {
  const d = new Date(periodMs);
  const day = d.getUTCDate();
  d.setUTCDate(1); // step to the 1st first so advancing the month can't overflow
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.getTime();
}

/** Read the current user's spendable credits (monthly balance + purchased),
 *  accounting for a due monthly refill. Read-only — for a PRE-CHECK before an
 *  expensive action so we never run heavy compute a user can't pay for. Returns
 *  null when unauthenticated. The refill boundary matches consume_credits EXACTLY
 *  (1 calendar month) so this never disagrees with the binding atomic charge. */
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
  if (isAdmin(user)) return ADMIN_CREDITS; // owner/tester → unlimited, never blocked by a pre-check
  const { data } = await supabase
    .from("credit_balances")
    .select("balance, purchased, monthly_grant, period_start")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return 0;
  const periodMs = new Date(data.period_start as string).getTime();
  // Refill is "due" on the exact same calendar-month boundary consume_credits uses, so
  // this pre-check and the atomic charge never disagree (no false "verified" then 402).
  const refillDue = Number.isFinite(periodMs) && Date.now() >= refillBoundaryMs(periodMs);
  const monthly = refillDue ? (data.monthly_grant as number) : (data.balance as number);
  return (monthly || 0) + ((data.purchased as number) || 0);
}

/** Rate-limit + atomically pre-charge the CURRENT user (call after auth). Pass the
 *  already-authenticated `user` so an ADMIN (owner/tester) is charged nothing — this
 *  keeps the admin bypass free of an extra auth round-trip on the hot path. */
export async function chargeCredits(action: string, amount: number, meta: Record<string, unknown> = {}, user: User | null = null): Promise<Charge> {
  const supabase = await getSupabaseServer();
  // Resolve the user for the admin check when the caller didn't pass one (brain, games,
  // tts). One cheap auth read on paths that already make heavy AI calls — negligible.
  if (!user) {
    try {
      ({
        data: { user },
      } = await supabase.auth.getUser());
    } catch {
      user = null;
    }
  }
  if (isAdmin(user)) return { ok: true, balance: ADMIN_CREDITS, fromBalance: 0, fromPurchased: 0 };
  const limit = RATE_LIMITS[action];
  if (limit) {
    const { data: allowed } = await supabase.rpc("rate_check", { p_action: action, p_max: limit[0], p_window_secs: limit[1] });
    if (allowed === false) return { ok: false, status: 429, balance: -1 };
  }
  const { data, error } = await supabase.rpc("consume_credits", { p_amount: amount, p_action: action, p_meta: meta });
  const d = (data ?? null) as { ok: boolean; balance: number; from_balance?: number; from_purchased?: number } | null;
  if (error || !d || !d.ok) return { ok: false, status: 402, balance: d?.balance ?? 0 };
  return { ok: true, balance: d.balance, fromBalance: d.from_balance ?? amount, fromPurchased: d.from_purchased ?? 0 };
}

export type CappedCharge =
  | { ok: true; balance: number; charged: number }
  | { ok: false; status: 402 | 429; balance: number; charged: 0 };

/**
 * GENEROUS atomic charge: deduct up to `cap`, but ONLY if the user holds at least `min`
 * (else 402, charges nothing). When they hold between `min` and `cap` it drains them to
 * exactly 0; at/above `cap` it takes `cap`. Returns the EXACT `charged` so a later failure
 * can refund precisely that amount. Non-negative + race-free — the cap is computed inside
 * the DB's single guarded UPDATE (consume_credits_capped), never from a stale read.
 */
export async function chargeCapped(action: string, cap: number, min: number, meta: Record<string, unknown> = {}, user: User | null = null): Promise<CappedCharge> {
  const supabase = await getSupabaseServer();
  if (!user) {
    try {
      ({
        data: { user },
      } = await supabase.auth.getUser());
    } catch {
      user = null;
    }
  }
  if (isAdmin(user)) return { ok: true, balance: ADMIN_CREDITS, charged: 0 };
  const limit = RATE_LIMITS[action];
  if (limit) {
    const { data: allowed } = await supabase.rpc("rate_check", { p_action: action, p_max: limit[0], p_window_secs: limit[1] });
    if (allowed === false) return { ok: false, status: 429, balance: -1, charged: 0 };
  }
  const { data, error } = await supabase.rpc("consume_credits_capped", { p_cap: cap, p_min: min, p_action: action, p_meta: meta });
  const d = (data ?? null) as { ok: boolean; balance: number; charged: number } | null;
  if (error || !d || !d.ok) return { ok: false, status: 402, balance: d?.balance ?? 0, charged: 0 };
  return { ok: true, balance: d.balance, charged: d.charged };
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
  if (isAdmin(user)) return { ok: true, userId: user.id, balance: ADMIN_CREDITS }; // owner/tester → no charge, no rate limit

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
 *  role; no-ops (logs nothing) if SUPABASE_SERVICE_ROLE_KEY isn't configured.
 *  Restores the MONTHLY bucket — prefer refundSplit() when you hold the charge's
 *  per-bucket split, so a purchased-funded charge is refunded to purchased. */
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

/** Refund a failed charge into the EXACT buckets it drained (from a successful
 *  Charge's fromBalance/fromPurchased). This is the correct refund — it never
 *  launders expiring monthly allowance into permanent purchased credits, and never
 *  loses purchased credits by refunding them to the expiring bucket. */
export async function refundSplit(userId: string, fromBalance: number, fromPurchased: number, action: string): Promise<void> {
  const b = Math.max(0, Math.round(fromBalance || 0));
  const p = Math.max(0, Math.round(fromPurchased || 0));
  if (b === 0 && p === 0) return; // admin / nothing charged → nothing to refund
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.rpc("refund_credits_split", { p_user: userId, p_to_balance: b, p_to_purchased: p, p_action: action });
  } catch {
    /* best-effort — never block the response on a refund */
  }
}
