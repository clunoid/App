import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/requireUser";
import { DEFAULT_PLATFORMS, PLATFORMS_REQUIRED } from "./platforms";

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
  "id, name, email, country, payout_method, new_accounts, status, applied_at, started_at, first_post_at, referral_code, referred_by, deriv_loginid";

export type CreatorRow = {
  id: string;
  name: string;
  email: string;
  country: string;
  payout_method: string | null;
  new_accounts: boolean;
  status: string;
  applied_at: string;
  started_at: string | null;
  first_post_at: string | null;
  referral_code: string | null;
  referred_by: string | null;
  deriv_loginid: string | null;
};

/** What one creator earns for each person they bring who gets paid. */
export const TEAM_BONUS_USD = 20;

export type Db = SupabaseClient;

/**
 * Resolve the creator making this request.
 *
 * Three ways, in order of how strong they are: the token this browser holds, the
 * Deriv account they are connected to (verified with Deriv, not taken on trust),
 * and finally a signed-in Clunoid session. The middle one is what lets somebody
 * pick up a different phone and still be recognised.
 */
export async function findCreator(db: Db, token: unknown, derivAccess?: unknown): Promise<CreatorRow | null> {
  const t = typeof token === "string" ? token.trim() : "";

  if (t.length >= 32) {
    const { data } = await db
      .from("trading_creator_applications")
      .select(CREATOR_FIELDS)
      .eq("access_token", t)
      .maybeSingle();
    if (data) return data as CreatorRow;
  }

  // No token, or one that no longer matches. Try the Deriv account: ask Deriv
  // which accounts this access token actually reaches, then look for a creator
  // recorded against one of them. Possession of a working token is the proof.
  if (typeof derivAccess === "string" && derivAccess.length > 20) {
    const { derivAccountIds } = await import("./derivIdentity");
    const ids = await derivAccountIds(derivAccess);
    if (ids.length > 0) {
      const { data } = await db
        .from("trading_creator_applications")
        .select(CREATOR_FIELDS)
        .in("deriv_loginid", ids)
        .maybeSingle();
      if (data) return data as CreatorRow;
    }
  }

  // Last of all, a signed-in Clunoid session.
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

/** One row per platform the creator picked, handle filled in or not yet. */
export type HandleRow = { platform: string; handle: string | null };

/**
 * Read a creator's platform choice. Always returns the picked set — falling back
 * to the recommended three for a row written before the picker existed, so an
 * old creator never lands on a dashboard with no platforms at all.
 */
export async function loadHandles(db: Db, applicationId: string): Promise<HandleRow[]> {
  const { data } = await db
    .from("trading_creator_handles")
    .select("platform, handle")
    .eq("application_id", applicationId);

  const rows = (data ?? []) as HandleRow[];
  if (rows.length > 0) return rows;
  return DEFAULT_PLATFORMS.map((platform) => ({ platform, handle: null }));
}

/**
 * Replace a creator's platform choice, keeping the handle of any platform that
 * survives the change. Dropping a platform drops its handle with it — that is
 * the point, since they are no longer posting there.
 */
export async function setPlatforms(db: Db, applicationId: string, platforms: string[]): Promise<void> {
  const existing = await loadHandles(db, applicationId);
  const keep = new Map(existing.map((r) => [r.platform, r.handle]));

  await db.from("trading_creator_handles").delete().eq("application_id", applicationId).not("platform", "in", `(${platforms.join(",")})`);

  const rows = platforms.map((platform) => ({
    application_id: applicationId,
    platform,
    handle: keep.get(platform) ?? null,
  }));
  await db.from("trading_creator_handles").upsert(rows, { onConflict: "application_id,platform" });
}

/** Every chosen platform has a handle — the gate on starting the clock and on payout. */
export function hasAllHandles(rows: HandleRow[]): boolean {
  return rows.length >= PLATFORMS_REQUIRED && rows.every((r) => !!r.handle);
}
