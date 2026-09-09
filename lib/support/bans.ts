import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * BANS — the door on the support window and the EA form.
 *
 * Matched on either the browser id or the email, because neither survives on
 * its own: a visitor id is gone the moment somebody opens a private window, and
 * an email is whatever they typed into the box. Together they stop a nuisance,
 * which is what this is for. It is not a security boundary and should not be
 * described as one.
 *
 * Every function fails OPEN — a database that cannot be reached means nobody is
 * treated as banned. That is the right way round: the failure of a nuisance
 * filter should be a nuisance getting through, never a real person locked out
 * of the only way they have to reach us.
 */

const TABLE = "trading_support_bans";

export type BanRow = {
  id: string;
  visitorId: string | null;
  email: string | null;
  name: string | null;
  reason: string | null;
  active: boolean;
  bannedAt: string;
  unbannedAt: string | null;
};

const row = (d: Record<string, unknown>): BanRow => ({
  id: d.id as string,
  visitorId: (d.visitor_id as string) ?? null,
  email: (d.email as string) ?? null,
  name: (d.name as string) ?? null,
  reason: (d.reason as string) ?? null,
  active: !!d.active,
  bannedAt: d.banned_at as string,
  unbannedAt: (d.unbanned_at as string) ?? null,
});

/** Is this person barred? Either identifier matching an active ban is enough. */
export async function isBanned(visitorId?: string | null, email?: string | null): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  if (!visitorId && !email) return false;

  const ors: string[] = [];
  if (visitorId) ors.push(`visitor_id.eq.${visitorId}`);
  if (email) ors.push(`email.ilike.${email}`);

  const { data, error } = await db
    .from(TABLE)
    .select("id")
    .eq("active", true)
    .or(ors.join(","))
    .limit(1);

  if (error) {
    console.error("[bans] check failed:", error.message);
    return false; // fail open — see the header
  }
  return (data ?? []).length > 0;
}

/**
 * Ban somebody. Returns what was written, or null if it could not be.
 *
 * Re-banning an already-banned person is not an error and does not stack: the
 * existing row is refreshed. The owner tapping /ban twice is not a decision to
 * keep two rows about one person.
 */
export async function banPerson(p: {
  visitorId?: string | null;
  email?: string | null;
  name?: string | null;
  reason?: string | null;
}): Promise<BanRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  if (!p.visitorId && !p.email) return null;

  const existing = await findBan(p.visitorId, p.email, true);
  if (existing) {
    const { data, error } = await db
      .from(TABLE)
      .update({
        active: true,
        unbanned_at: null,
        reason: p.reason ?? existing.reason,
        name: p.name ?? existing.name,
        email: p.email ?? existing.email,
        visitor_id: p.visitorId ?? existing.visitorId,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      console.error("[bans] refresh failed:", error.message);
      return null;
    }
    return row(data as Record<string, unknown>);
  }

  const { data, error } = await db
    .from(TABLE)
    .insert({
      visitor_id: p.visitorId ?? null,
      email: p.email ?? null,
      name: p.name ?? null,
      reason: p.reason ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[bans] insert failed:", error.message);
    return null;
  }
  return row(data as Record<string, unknown>);
}

/** Lift a ban. The row stays — `active` goes false and the date is stamped. */
export async function unbanPerson(key: string): Promise<BanRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const found = await findBan(key, key, true);
  if (!found) return null;

  const { data, error } = await db
    .from(TABLE)
    .update({ active: false, unbanned_at: new Date().toISOString() })
    .eq("id", found.id)
    .select("*")
    .single();

  if (error) {
    console.error("[bans] unban failed:", error.message);
    return null;
  }
  return row(data as Record<string, unknown>);
}

/** One ban row by visitor id or email. `onlyActive` narrows it to a live ban. */
export async function findBan(
  visitorId?: string | null,
  email?: string | null,
  onlyActive = false,
): Promise<BanRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  if (!visitorId && !email) return null;

  const ors: string[] = [];
  if (visitorId) ors.push(`visitor_id.eq.${visitorId}`);
  if (email) ors.push(`email.ilike.${email}`);

  let q = db.from(TABLE).select("*").or(ors.join(","));
  if (onlyActive) q = q.eq("active", true);

  const { data, error } = await q.order("banned_at", { ascending: false }).limit(1);
  if (error) {
    console.error("[bans] lookup failed:", error.message);
    return null;
  }
  const first = (data ?? [])[0];
  return first ? row(first as Record<string, unknown>) : null;
}

/** The list, newest first. Banned and unbanned together — the history is the point. */
export async function listBans(limit = 50): Promise<BanRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .order("banned_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[bans] list failed:", error.message);
    return [];
  }
  return (data ?? []).map((d) => row(d as Record<string, unknown>));
}

/**
 * Empty the list.
 *
 * "lifted" removes only the rows already unbanned — the tidy-up you want when
 * the list is long but the live bans still matter. "all" removes everything,
 * which unbans everyone as a side effect, so it is worth saying so out loud
 * when confirming it.
 */
export async function clearBans(which: "lifted" | "all"): Promise<number> {
  const db = getSupabaseAdmin();
  if (!db) return 0;

  let q = db.from(TABLE).delete();
  q = which === "lifted" ? q.eq("active", false) : q.not("id", "is", null);

  const { data, error } = await q.select("id");
  if (error) {
    console.error("[bans] clear failed:", error.message);
    return 0;
  }
  return (data ?? []).length;
}
