import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/requireUser";

/**
 * CREATOR PROGRAM — finding and identifying a creator.
 *
 * Registering does not create a Clunoid account, so a creator is identified by a
 * secret token minted at registration and kept by their browser. If they also
 * happen to be signed in, their row is findable by user_id too, so clearing site
 * data does not lock them out.
 *
 * Every read and write goes through the service role: the tables have RLS on
 * with no policies, so nothing reaches them from the browser directly.
 */

export const PAYOUT_METHODS = ["usdt", "paypal", "venmo", "cashapp", "mpesa", "wise", "payoneer"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export function isPayoutMethod(v: unknown): v is PayoutMethod {
  return typeof v === "string" && (PAYOUT_METHODS as readonly string[]).includes(v.toLowerCase());
}

const MAX = 120;
export const trim = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX) : "");

/**
 * Reduce whatever someone pastes to one canonical handle.
 *
 * People give us a handle, an @handle, or the whole address bar — all of them are
 * the same account, and all three must reduce to the same stored value or the
 * uniqueness index stops catching one person taking two seats.
 *
 *   https://www.tiktok.com/@JaneDoe?lang=en  ->  janedoe
 *   youtube.com/channel/UC123/               ->  uc123
 *   @JaneDoe                                 ->  janedoe
 */
export function normaliseHandle(v: unknown): string | null {
  let s = trim(v);
  if (!s) return null;

  s = s.split(/[?#]/)[0];                                     // drop query and fragment
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");   // drop scheme and www
  s = s.replace(/^[^/\s]+\.[a-z]{2,}\//i, "");                 // drop the domain, keep the path
  s = s.replace(/^(@|c\/|channel\/|user\/)+/i, "");            // youtube path styles, and the @
  s = s.replace(/\/+$/, "").trim();

  if (!s) return null;
  return s.toLowerCase();
}

export function newAccessToken(): string {
  return randomBytes(24).toString("hex");
}

/** Columns the creator is allowed to see about themselves. Never selects the token. */
export const CREATOR_FIELDS =
  "id, name, email, country, tiktok, instagram, facebook, youtube, payout_method, new_accounts, status, applied_at, started_at, first_post_at";

export type CreatorRow = {
  id: string;
  name: string;
  email: string;
  country: string;
  tiktok: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  payout_method: string | null;
  new_accounts: boolean;
  status: string;
  applied_at: string;
  started_at: string | null;
  first_post_at: string | null;
};

export type Db = SupabaseClient;

/**
 * Resolve the creator making this request: token first, then the signed-in user
 * as a fallback. Returns null when neither identifies a row.
 */
export async function findCreator(db: Db, token: unknown): Promise<CreatorRow | null> {
  const t = typeof token === "string" ? token.trim() : "";

  if (t.length >= 32) {
    const { data } = await db
      .from("trading_creator_applications")
      .select(CREATOR_FIELDS)
      .eq("access_token", t)
      .maybeSingle();
    if (data) return data as CreatorRow;
  }

  // No token, or a token that no longer matches — fall back to the session.
  const user = await requireUser().catch(() => null);
  if (!user) return null;

  const { data } = await db
    .from("trading_creator_applications")
    .select(CREATOR_FIELDS)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as CreatorRow) ?? null;
}

/** The admin client, or null when Supabase is not configured on this deployment. */
export function db(): Db | null {
  return getSupabaseAdmin();
}

/** Every handle present — the gate on starting the clock and on payout. */
export function hasAllHandles(c: Pick<CreatorRow, "tiktok" | "instagram" | "facebook" | "youtube">): boolean {
  return !!(c.tiktok && c.instagram && c.facebook && c.youtube);
}
