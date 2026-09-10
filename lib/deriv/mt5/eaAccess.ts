import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * MT5 EA ACCESS — the request, the decision, and the code.
 *
 * The General EA is free but not public: it runs on signals from clunoid.com's
 * own engine, and that goes to the trading community rather than to anyone who
 * finds the page. So the download asks first, the owner checks the MT5 login
 * against the partner list on Deriv, and an approval mints a code.
 *
 * A code is bound to the visitor it was issued to. That binding is the reason
 * it exists: an approved code that worked for anyone who was sent it would be a
 * public download again by the end of the week.
 *
 * Every function degrades quietly when the database is unreachable, in the same
 * way support does — a person asking for a file should never meet a stack
 * trace. The one exception is verification, which fails CLOSED: no database
 * means no way to prove a code, and an unprovable code is not a valid one.
 */

const TABLE = "trading_ea_requests";

/** Deriv's partner id — the list an MT5 login has to appear under. */
export const PARTNER_ID = "019cafdd-b40f-7552-83a9-a0d5d69125d5";

/** Where somebody without an account is sent to open one under us. */
export const DERIV_SIGNUP = "https://t.deriv.link?t=8FJ7FBEALQBP";

/**
 * Where the client ID is copied from.
 *
 * Plain, with no token on it. This is a page somebody already signed in is
 * being sent to look something up on — attribution belongs on the step 1
 * signup link, which is the click that actually counts.
 */
export const DERIV_PROFILE = "https://home.deriv.com/dashboard/profile";

/** What one looks like, so nobody has to guess which number we mean. */
export const EXAMPLE_CLIENT_ID = "019cafdd-b40f-7552-83a9-a0d5d69125d5";

/** The file itself, which now lives outside public/ like every gated EA. */
export const EA_FILE = "ClunoidMT5.mq5";

export type EaRequest = {
  id: string;
  visitorId: string;
  mt5Login: string;
  name: string;
  email: string;
  status: "pending" | "approved" | "declined";
  code: string | null;
};

/**
 * A code that is easy to read off a phone and type into a box.
 *
 * No I, O, 1 or 0: the alphabet is the one used for anything a human has to
 * copy by eye, because a code that is rejected for being a five instead of an S
 * becomes a support message, which is the thing this is supposed to save.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function mintCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `CLU-${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Codes are compared with the shape stripped, so spacing never decides it. */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Record a new request. Returns its id, or null if it could not be stored. */
export async function createRequest(r: {
  visitorId: string;
  mt5Login: string;
  name: string;
  email: string;
  page?: string | null;
}): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from(TABLE)
    .insert({
      visitor_id: r.visitorId,
      mt5_login: r.mt5Login,
      name: r.name,
      email: r.email,
      page: r.page ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ea] could not record request:", error.message);
    return null;
  }
  return (data?.id as string) ?? null;
}

/** Tie the request to the Telegram message it became, so a reply can find it. */
export async function attachTelegramMessage(id: string, tgMessageId: number): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  const { error } = await db.from(TABLE).update({ tg_message_id: tgMessageId }).eq("id", id);
  if (error) console.error("[ea] could not attach telegram id:", error.message);
}

/** The request a swipe-reply is pointing at, or null if it points elsewhere. */
export async function requestForTelegramMessage(tgMessageId: number): Promise<EaRequest | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from(TABLE)
    .select("id, visitor_id, mt5_login, name, email, status, code")
    .eq("tg_message_id", tgMessageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ea] request lookup failed:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    visitorId: data.visitor_id as string,
    mt5Login: data.mt5_login as string,
    name: data.name as string,
    email: data.email as string,
    status: data.status as EaRequest["status"],
    code: (data.code as string) ?? null,
  };
}

/**
 * Approve a request and mint its code.
 *
 * Approving one that already has a code returns the SAME code rather than a new
 * one. The owner tapping /approve twice is not a decision to invalidate what
 * the person was already told, and it is the kind of thing that happens when a
 * reply looks like it did not send.
 */
export async function approveRequest(id: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data: existing } = await db.from(TABLE).select("code").eq("id", id).maybeSingle();
  if (existing?.code) return existing.code as string;

  // Unique by index; a collision at eight characters is remote but retrying is
  // cheaper than reasoning about whether it can happen.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintCode();
    const { error } = await db
      .from(TABLE)
      .update({ code, status: "approved", decided_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) return code;
    if (!/duplicate|unique/i.test(error.message)) {
      console.error("[ea] approve failed:", error.message);
      return null;
    }
  }
  return null;
}

export async function declineRequest(id: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const { error } = await db
    .from(TABLE)
    .update({ status: "declined", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[ea] decline failed:", error.message);
    return false;
  }
  return true;
}

export type CodeCheck =
  | { ok: true; name: string }
  | { ok: false; why: "unknown" | "not-yours" | "unavailable" };

/**
 * Is this code good, and does it belong to the person holding it?
 *
 * Fails closed. "unknown" is deliberately returned for both a code that does
 * not exist and one that exists but was issued to somebody else's browser —
 * telling the difference would let somebody test codes until one came back with
 * a different answer. The distinct "not-yours" case is only reached when the
 * code matches a request whose visitor is known AND different, which is the
 * situation worth explaining to an honest person who changed browsers.
 */
export async function checkCode(code: string, visitorId: string): Promise<CodeCheck> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, why: "unavailable" };

  const wanted = normaliseCode(code);
  if (wanted.length < 8) return { ok: false, why: "unknown" };

  const { data, error } = await db
    .from(TABLE)
    .select("id, visitor_id, name, status, code, code_used_at")
    .eq("status", "approved")
    .not("code", "is", null)
    .limit(500);

  if (error) {
    console.error("[ea] code check failed:", error.message);
    return { ok: false, why: "unavailable" };
  }

  const row = (data ?? []).find((r) => normaliseCode((r.code as string) ?? "") === wanted);
  if (!row) return { ok: false, why: "unknown" };
  if ((row.visitor_id as string) !== visitorId) return { ok: false, why: "not-yours" };

  // First use is worth knowing; later ones are the same person fetching it
  // again, which is not something to punish.
  if (!row.code_used_at) {
    const { error: markErr } = await db
      .from(TABLE)
      .update({ code_used_at: new Date().toISOString() })
      .eq("id", row.id as string);
    if (markErr) console.error("[ea] could not mark code used:", markErr.message);
  }

  return { ok: true, name: (row.name as string) ?? "" };
}

/**
 * Everything still waiting for a decision, newest first.
 *
 * Needed because a swipe-reply is not the only way the owner answers. Tapping
 * the /approve shown in the request sends it as its OWN message with no reply
 * attached — Telegram works that way — so there is nothing pointing at the
 * request and the reply had nowhere to land. With one request outstanding
 * there is no ambiguity to resolve, and that is the ordinary case.
 */
export async function pendingRequests(limit = 20): Promise<EaRequest[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from(TABLE)
    .select("id, visitor_id, mt5_login, name, email, status, code")
    .eq("status", "pending")
    /* Answered by hand is not waiting. Replying to somebody puts their request
       in your hands without deciding it, and the queue has to agree or it keeps
       offering back people you have already dealt with. */
    .is("answered_at", null)
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (error) {
    console.error("[ea] pending lookup failed:", error.message);
    return [];
  }

  /* Somebody who already holds a code is NOT waiting for a decision.
   *
   * They were listed, because the row they sent afterwards is still marked
   * pending — and it is easy to send another: the form does not know it has
   * already been answered, so a second visit fills it in again. The queue then
   * offered a person who was approved an hour ago as somebody to decide about,
   * and asked which of two to act on when only one was real.
   *
   * The fix is on the way out rather than in the query, because "approved" is a
   * fact about the PERSON and pending is a fact about the ROW. */
  const rows = (data ?? []) as Record<string, unknown>[];
  const visitors = [...new Set(rows.map((d) => d.visitor_id as string).filter(Boolean))];

  const settled = new Set<string>();
  if (visitors.length) {
    const { data: done } = await db
      .from(TABLE)
      .select("visitor_id")
      .eq("status", "approved")
      .not("code", "is", null)
      .in("visitor_id", visitors);
    for (const d of done ?? []) settled.add(d.visitor_id as string);
  }

  return rows
    .filter((d) => !settled.has(d.visitor_id as string))
    .slice(0, limit)
    .map((d) => ({
      id: d.id as string,
      visitorId: d.visitor_id as string,
      mt5Login: d.mt5_login as string,
      name: d.name as string,
      email: d.email as string,
      status: d.status as EaRequest["status"],
      code: (d.code as string) ?? null,
    }));
}

/**
 * Take this person's open requests out of the decision queue.
 *
 * Called when the owner answers somebody by hand, or shuts the door on them.
 * Either way the request is dealt with: it is no longer a thing sitting there
 * waiting to be decided, and leaving it in the queue meant the same people were
 * offered again every time a decision was made about anybody.
 *
 * It does NOT decide anything — the status is untouched, so /approve and
 * /decline still work on them afterwards and still say what happened. Returns
 * how many rows it covered, which is what lets the reply say so out loud.
 */
export async function markAnswered(visitorId: string): Promise<number> {
  const db = getSupabaseAdmin();
  if (!db || !visitorId) return 0;
  const { data, error } = await db
    .from(TABLE)
    .update({ answered_at: new Date().toISOString() })
    .eq("visitor_id", visitorId)
    .eq("status", "pending")
    .is("answered_at", null)
    .select("id");
  if (error) {
    console.error("[ea] could not mark answered:", error.message);
    return 0;
  }
  return (data ?? []).length;
}

/**
 * This person's request, found from the PERSON rather than the message.
 *
 * A swipe-reply is addressed to one Telegram message, and only the request
 * message itself carries a request. Reply to anything else in a thread — their
 * last question, an answer you sent, a message from three days ago — and the
 * pointer led nowhere, so /approve reported that the request was never
 * recorded. It always had been; the reply was simply aimed at a different
 * message in the same conversation.
 *
 * A decision is about a person, not about which message you happened to have on
 * screen. So: their oldest still-pending request, and failing that their most
 * recent one of any status, which is what makes re-approving or re-declining
 * after the fact work.
 */
export async function requestForVisitor(visitorId: string): Promise<EaRequest | null> {
  const db = getSupabaseAdmin();
  if (!db || !visitorId) return null;

  const pick = async (pendingOnly: boolean) => {
    let q = db
      .from(TABLE)
      .select("id, visitor_id, mt5_login, name, email, status, code")
      .eq("visitor_id", visitorId);
    if (pendingOnly) q = q.eq("status", "pending");
    const { data, error } = await q
      .order("created_at", { ascending: pendingOnly })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[ea] visitor request lookup failed:", error.message);
      return null;
    }
    return data ?? null;
  };

  const d = (await pick(true)) ?? (await pick(false));
  if (!d) return null;

  return {
    id: d.id as string,
    visitorId: d.visitor_id as string,
    mt5Login: d.mt5_login as string,
    name: d.name as string,
    email: d.email as string,
    status: d.status as EaRequest["status"],
    code: (d.code as string) ?? null,
  };
}

/**
 * The live code this browser already holds, if any.
 *
 * Asked before a new request is recorded: somebody who has been approved does
 * not need a second decision, they need the code they were already given. It is
 * the same question the queue asks, from the other end.
 */
export async function approvedCodeFor(visitorId: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db || !visitorId) return null;
  const { data, error } = await db
    .from(TABLE)
    .select("code")
    .eq("visitor_id", visitorId)
    .eq("status", "approved")
    .not("code", "is", null)
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ea] approved lookup failed:", error.message);
    return null;
  }
  return (data?.code as string) ?? null;
}

/**
 * How many times this browser has been declined, this decision included.
 *
 * A second decline should not repeat the first word for word. Somebody who
 * checked their ID, wrote to Deriv and came back to the same paragraph has no
 * way to tell whether anything happened — so the count decides which message
 * they get, and the repeat one says plainly that it is still not found.
 */
export async function declineCount(visitorId: string): Promise<number> {
  const db = getSupabaseAdmin();
  if (!db) return 0;
  const { count, error } = await db
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("visitor_id", visitorId)
    .eq("status", "declined");
  if (error) {
    console.error("[ea] decline count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** How many times this browser has asked recently — a spam brake, not a rule. */
export async function recentRequestCount(visitorId: string, withinMinutes = 60): Promise<number> {
  const db = getSupabaseAdmin();
  if (!db) return 0;
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const { count, error } = await db
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("visitor_id", visitorId)
    .gte("created_at", since);
  if (error) {
    console.error("[ea] rate check failed:", error.message);
    return 0;
  }
  return count ?? 0;
}
