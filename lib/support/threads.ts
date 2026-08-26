import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * SUPPORT THREADS — the join between a visitor and a Telegram message.
 *
 * There is no account behind a support conversation. The only thing that
 * identifies the person is the random id their own browser minted, and the only
 * thing that connects the owner's reply to them is the id of the Telegram
 * message they were replying to. Both live in one table.
 *
 * Every function here degrades quietly. Support is the thing people reach for
 * when something is already broken, so a database that is unreachable must
 * never turn a support form into a second failure: the message still goes to
 * Telegram, the reply simply cannot be routed back automatically.
 */

const TABLE = "trading_support_messages";

export type OutboundReply = { id: string; body: string; createdAt: string };

/** Record a message the visitor sent, against the Telegram message it became. */
export async function recordInbound(m: {
  visitorId: string;
  body: string;
  tgMessageId: number | null;
  email?: string | null;
  name?: string | null;
  source?: string | null;
  page?: string | null;
}): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db || !m.visitorId) return;

  const { error } = await db.from(TABLE).insert({
    visitor_id: m.visitorId,
    direction: "in",
    body: m.body.slice(0, 4000),
    tg_message_id: m.tgMessageId || null,
    email: m.email ?? null,
    name: m.name ?? null,
    source: m.source ?? null,
    page: m.page ?? null,
  });
  if (error) console.error("[support] could not record inbound:", error.message);
}

/**
 * Which visitor does this Telegram message belong to?
 *
 * Returns null when the owner replies to something that was never a support
 * message — a status line, or one of the bot's own answers. That is a normal
 * thing to do, not an error.
 */
export async function visitorForTelegramMessage(tgMessageId: number): Promise<{ visitorId: string; email: string | null } | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from(TABLE)
    .select("visitor_id, email")
    .eq("tg_message_id", tgMessageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[support] reply lookup failed:", error.message);
    return null;
  }
  return data ? { visitorId: data.visitor_id as string, email: (data.email as string) ?? null } : null;
}

/** Park the owner's reply for the visitor to collect. */
export async function recordReply(visitorId: string, body: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;

  const { error } = await db.from(TABLE).insert({
    visitor_id: visitorId,
    direction: "out",
    body: body.slice(0, 4000),
  });
  if (error) {
    console.error("[support] could not record reply:", error.message);
    return false;
  }
  return true;
}

/**
 * Everything waiting for this visitor, oldest first, marked as collected.
 *
 * Marking happens here rather than on a separate call because the bubble has
 * already rendered them by the time it could confirm, and a reply shown twice
 * is worse than one whose delivery receipt is optimistic.
 */
export async function collectReplies(visitorId: string): Promise<OutboundReply[]> {
  const db = getSupabaseAdmin();
  if (!db || !visitorId) return [];

  const { data, error } = await db
    .from(TABLE)
    .select("id, body, created_at")
    .eq("visitor_id", visitorId)
    .eq("direction", "out")
    .is("seen_at", null)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("[support] collect failed:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const ids = data.map((r) => r.id as string);
  const { error: markErr } = await db.from(TABLE).update({ seen_at: new Date().toISOString() }).in("id", ids);
  if (markErr) console.error("[support] could not mark seen:", markErr.message);

  return data.map((r) => ({ id: r.id as string, body: r.body as string, createdAt: r.created_at as string }));
}

/**
 * What has already been said to this person, oldest first.
 *
 * Attached to their next message so the answer can be written without
 * remembering them. With enough people asking at once, the difference between
 * "who is this and what did I tell them" and simply reading down the screen is
 * the difference between support that works and support that stalls.
 *
 * Capped: Telegram refuses a message over 4096 characters, and a thread that
 * long is not being read anyway.
 */
export async function historyFor(visitorId: string, limit = 10): Promise<{ from: "them" | "us"; body: string; at: string }[]> {
  const db = getSupabaseAdmin();
  if (!db || !visitorId) return [];

  const { data, error } = await db
    .from(TABLE)
    .select("direction, body, created_at")
    .eq("visitor_id", visitorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[support] history failed:", error.message);
    return [];
  }

  // Newest-first from the query so the LIMIT keeps the most recent, then
  // reversed so it reads like a conversation.
  return (data ?? [])
    .reverse()
    .map((r) => ({
      from: r.direction === "out" ? ("us" as const) : ("them" as const),
      body: r.body as string,
      at: r.created_at as string,
    }));
}
