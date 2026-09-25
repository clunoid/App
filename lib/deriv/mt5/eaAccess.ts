import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * MT5 EA ACCESS — the request, the decision, and the code.
 *
 * The General EA is free but not public: it runs on signals from clunoid.com's
 * own engine, and that goes to the trading community rather than to anyone who
 * finds the page. So the download asks first, the owner checks the MT5 login
 * against the partner list on Headway, and an approval mints a code.
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

/* The broker moved from Deriv to Headway. The Deriv values are kept here,
   commented, so the switch back is a matter of swapping the constants:
     PARTNER_ID        "019cafdd-b40f-7552-83a9-a0d5d69125d5"
     DERIV_SIGNUP      "https://t.deriv.link?t=8FJ7FBEALQBP"
     DERIV_PROFILE     "https://home.deriv.com/dashboard/profile"
     EXAMPLE_CLIENT_ID "019cafdd-b40f-7552-83a9-a0d5d69125d5"
   The names stayed so nothing that imports them had to change. */
/** Our Headway Partner ID — the group an account has to sit under. The
    sign-up link carries a different token (hwp=8abf6d); that one is the
    link's, this one is what Headway support asks for. */
export const PARTNER_ID = "6078336";

/** Where somebody without an account is sent to open one under us. */
export const DERIV_SIGNUP = "https://headway.partners/user/signup?hwp=8abf6d";

/** Kept for the imports; the Headway flow matches by name and email, not by ID. */
export const DERIV_PROFILE = "your Headway personal area";

/** What one looks like, so nobody has to guess which number we mean. */
export const EXAMPLE_CLIENT_ID = "1234567";

/** The file itself, which now lives outside public/ like every gated EA. */
export const EA_FILE = "ClunoidMT5.mq5";
/** A code is good for this many downloads, then it has to be issued again. */
export const MAX_CODE_USES = 3;

/** Every UNSUCCESSFUL answer — a decline, a deposit asked for — ends with this:
 *  a wrong decision is a screenshot away from being fixed. A code is not an
 *  answer that can be wrong, so it never carries it. */
export const MISTAKE_LINE = "If we made a mistake, reply here with a screenshot of your Headway account and we will fix it right away.";

/** What somebody is told when their account is under us but not funded yet. */
export function depositMessage(email: string): string {
  return [
    `Your Headway account (${email}) is under our community — but it has no deposit yet, and the EA is for accounts ready to trade.`,
    "",
    "Deposit any amount you want to start with in your Headway personal area — Headway adds a 50% bonus — then reply here and we send your code right away.",
    "",
    MISTAKE_LINE,
  ].join("\n");
}

/** The words that go with a code, wherever it is issued. The bubble draws
 *  the code line green and the ⚠ line red — those two conventions are what
 *  make them stand out, so keep each on a line of its own. */
export function codeMessage(code: string, mt5Login: string, lead: string): string {
  return [
    lead,
    "", code, "",
    `Paste it into step 6 on the bot's page to unlock the download. It works only on this browser, ${MAX_CODE_USES} times.`,
    `⚠ Works only on Headway, on the approved account. Any other broker or account receives wrong data.`,
  ].join("\n");
}

export type EaRequest = {
  id: string;
  visitorId: string;
  mt5Login: string;
  name: string;
  email: string;
  phone: string;
  contact: string;
  country: string;
  status: "pending" | "approved" | "declined";
  code: string | null;
  /** When it was sent — what the waiting list orders by and shows. */
  createdAt?: string | null;
};

/** One entry of the waiting list: a person, with everything open of theirs folded in. */
export type WaitingPerson = EaRequest & { requests: number; otherEmails: string[]; firstAt: string | null };

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
  phone?: string | null;
  contact?: string | null;
  country?: string | null;
}): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from(TABLE)
    .insert({
      visitor_id: r.visitorId,
      mt5_login: r.mt5Login || r.phone || "",
      name: r.name,
      email: r.email,
      page: r.page ?? null,
      phone: r.phone || null,
      contact: r.contact || null,
      country: r.country || null,
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
    .select("id, visitor_id, mt5_login, name, email, phone, contact, country, status, code, created_at")
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
    phone: (data.phone as string | null) ?? "",
    contact: (data.contact as string | null) ?? "",
    country: (data.country as string | null) ?? "",
    status: data.status as EaRequest["status"],
    code: (data.code as string) ?? null,
    createdAt: (data.created_at as string | null) ?? null,
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
  | { ok: true; name: string; usesLeft: number }
  | { ok: false; why: "unknown" | "not-yours" | "unavailable" | "exhausted" };

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
    .select("id, visitor_id, name, status, code, code_used_at, code_uses")
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

  /* Three downloads, counted on the row. The increment is conditional on the
     count it read, so two downloads landing together cannot both pass as the
     third: the second one finds the row already moved on and is refused. */
  const used = (row.code_uses as number | null) ?? 0;
  if (used >= MAX_CODE_USES) return { ok: false, why: "exhausted" };
  const { data: marked, error: markErr } = await db
    .from(TABLE)
    .update({ code_uses: used + 1, code_used_at: (row.code_used_at as string | null) ?? new Date().toISOString() })
    .eq("id", row.id as string)
    .eq("code_uses", used)
    .select("id");
  if (markErr) { console.error("[ea] could not count the download:", markErr.message); return { ok: false, why: "unavailable" }; }
  if (!marked?.length) return { ok: false, why: "exhausted" };

  return { ok: true, name: (row.name as string) ?? "", usesLeft: MAX_CODE_USES - used - 1 };
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
    .select("id, visitor_id, mt5_login, name, email, phone, contact, country, status, code, created_at")
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
      phone: (d.phone as string | null) ?? "",
      contact: (d.contact as string | null) ?? "",
      country: (d.country as string | null) ?? "",
      status: d.status as EaRequest["status"],
      code: (d.code as string) ?? null,
      createdAt: (d.created_at as string | null) ?? null,
    }));
}

/**
 * The waiting list, one entry per PERSON.
 *
 * A decision settles every open row of a person, so listing their rows one by
 * one would show the same decision several times. Each entry is their newest
 * request, with how many are open and any other email they sent under —
 * a typo they corrected is still the same person. Longest waiting first,
 * so the person at the back of the queue is the one at the top.
 */
export async function waitingPeople(): Promise<WaitingPerson[]> {
  const rows = await pendingRequests(200);
  const people: WaitingPerson[] = [];
  const byVisitor = new Map<string, WaitingPerson>();
  for (const r of rows) {
    const key = r.visitorId || r.id;
    let p = byVisitor.get(key);
    if (!p) {
      p = { ...r, requests: 1, otherEmails: [], firstAt: r.createdAt ?? null };
      byVisitor.set(key, p); people.push(p);
      continue;
    }
    p.requests += 1;
    p.firstAt = r.createdAt ?? p.firstAt;
    const e = (r.email || "").toLowerCase();
    if (e && e !== (p.email || "").toLowerCase() && !p.otherEmails.includes(r.email)) p.otherEmails.push(r.email);
    if (!p.phone && r.phone) { p.phone = r.phone; p.contact = r.contact; }
  }
  return people.sort((a, b) => (a.firstAt || "").localeCompare(b.firstAt || ""));
}

/**
 * The request a typed ID points at: a visitor ID first — the one shown in
 * the request and in the waiting list — then an email, a phone or a login,
 * matched against what is waiting. A visitor ID that is not on the waiting
 * list still finds that person's request (asked to deposit, say), because
 * /approve on it is exactly how they get their code when they come back.
 */
export async function requestForKey(key: string, waiting?: WaitingPerson[]): Promise<EaRequest | null> {
  const k = (key || "").trim();
  if (!k) return null;
  const low = k.toLowerCase();
  const list = waiting ?? (await waitingPeople());
  const hit = list.find((w) => (w.visitorId || "").toLowerCase() === low)
    ?? list.find((w) => (w.email && w.email.toLowerCase() === low) || (w.phone && w.phone === k) || w.mt5Login === k);
  if (hit) return hit;
  if (!k.includes("@") && /^[A-Za-z0-9-]{6,64}$/.test(k)) {
    // Case is whatever they typed; the stored id is what the site made.
    const exact = await requestForVisitor(k);
    if (exact) return exact;
    if (k !== k.toUpperCase()) return requestForVisitor(k.toUpperCase());
  }
  return null;
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
      .select("id, visitor_id, mt5_login, name, email, phone, contact, country, status, code, created_at")
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
    phone: (d.phone as string | null) ?? "",
    contact: (d.contact as string | null) ?? "",
    country: (d.country as string | null) ?? "",
    status: d.status as EaRequest["status"],
    code: (d.code as string) ?? null,
    createdAt: (d.created_at as string | null) ?? null,
  };
}

/**
 * The live code this browser already holds, if any.
 *
 * Asked before a new request is recorded: somebody who has been approved does
 * not need a second decision, they need the code they were already given. It is
 * the same question the queue asks, from the other end.
 */
export type ApprovedCode = { code: string; usesLeft: number; mt5Login: string; email: string; phone: string };
export async function approvedCodeFor(visitorId: string): Promise<ApprovedCode | null> {
  const db = getSupabaseAdmin();
  if (!db || !visitorId) return null;
  const { data, error } = await db
    .from(TABLE)
    .select("code, code_uses, mt5_login, email, phone")
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
  if (!data?.code) return null;
  return {
    code: data.code as string,
    usesLeft: Math.max(0, MAX_CODE_USES - ((data.code_uses as number | null) ?? 0)),
    mt5Login: (data.mt5_login as string) ?? "",
    email: (data.email as string) ?? "",
    phone: (data.phone as string | null) ?? "",
  };
}

/**
 * Was this exact email and phone approved before, on any browser?
 *
 * The automatic re-approval: somebody whose code is spent, or who is on a new
 * device, sends the form again with the same email and the same phone they
 * were approved with, and gets a fresh code without waiting. The phone is
 * compared exactly (E.164); the email without regard to case.
 */
export async function approvedMatch(email: string, phone: string, name = ""): Promise<{ id: string; visitorId: string } | null> {
  const db = getSupabaseAdmin();
  if (!db || !email || (!phone && !name)) return null;
  // With a phone, email + phone must both match; without one, email + the exact name.
  let q = db
    .from(TABLE)
    .select("id, visitor_id")
    .eq("status", "approved")
    .not("code", "is", null)
    .ilike("email", email);
  q = phone ? q.eq("phone", phone) : q.ilike("name", name);
  const { data, error } = await q
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error("[ea] match lookup failed:", error.message); return null; }
  return data ? { id: data.id as string, visitorId: data.visitor_id as string } : null;
}

/**
 * Where this browser stands with the EA — for the moment somebody says "I have
 * downloaded it": approved (and when, and whether the code was actually used),
 * still waiting, declined, or never asked. Read from the rows, not from what
 * the person claims, because the button is easy to press by mistake.
 */
export type AccessStatus =
  | { state: "unknown" | "none" }
  | { state: "approved"; code: string; uses: number; usedAt: string | null; at: string | null }
  | { state: "pending" | "declined"; at: string | null };
export async function accessStatusFor(visitorId: string): Promise<AccessStatus> {
  const db = getSupabaseAdmin();
  if (!db || !visitorId) return { state: "unknown" };
  const ok = await db.from(TABLE).select("code, code_uses, code_used_at, decided_at")
    .eq("visitor_id", visitorId).eq("status", "approved").not("code", "is", null)
    .order("decided_at", { ascending: false }).limit(1).maybeSingle();
  const a = ok.data;
  if (a?.code) return { state: "approved", code: a.code as string, uses: (a.code_uses as number | null) ?? 0, usedAt: (a.code_used_at as string | null) ?? null, at: (a.decided_at as string | null) ?? null };
  const last = await db.from(TABLE).select("status, created_at, decided_at")
    .eq("visitor_id", visitorId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const d = last.data;
  if (!d) return { state: "none" };
  return { state: d.status === "declined" ? "declined" : "pending", at: ((d.decided_at || d.created_at) as string | null) ?? null };
}

/** One line the owner can act on: was this browser approved, and did it download? */
export function accessStatusLine(s: AccessStatus): string {
  const when = (iso: string | null) => (iso ? String(iso).replace("T", " ").slice(0, 16) + " UTC" : "?");
  if (s.state === "unknown") return "";
  if (s.state === "approved") {
    return s.uses > 0
      ? `<b>🤖 EA access:</b> ✅ approved ${when(s.at)} · code <code>${s.code}</code> used ${s.uses}/${MAX_CODE_USES} (downloaded ${when(s.usedAt)})`
      : `<b>🤖 EA access:</b> 🟡 approved ${when(s.at)} · code <code>${s.code}</code> NOT used yet — nothing downloaded on this browser`;
  }
  if (s.state === "pending") return `<b>🤖 EA access:</b> ⚠️ NOT approved — request still waiting since ${when(s.at)}. Pressed too early?`;
  if (s.state === "declined") return `<b>🤖 EA access:</b> ⛔ declined ${when(s.at)} — no code was issued`;
  return "<b>🤖 EA access:</b> ⚠️ no request from this browser — not approved";
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

/**
 * Just the state, in ONE query — what the "I have downloaded" button asks
 * before it writes to support, so it has to answer quickly. Same rule as
 * accessStatusFor: any approved row with a code is approved; otherwise the
 * newest row says declined or waiting; no rows is never asked. A failed
 * lookup is "unknown", never a guess.
 */
export type AccessState = "approved" | "pending" | "declined" | "none" | "unknown";
export async function accessState(visitorId: string): Promise<AccessState> {
  const db = getSupabaseAdmin();
  if (!db || !visitorId) return "unknown";
  const { data, error } = await db.from(TABLE).select("status, code")
    .eq("visitor_id", visitorId).order("created_at", { ascending: false }).limit(100);
  if (error) { console.error("[ea] access state lookup failed:", error.message); return "unknown"; }
  const rows = (data ?? []) as { status: string; code: string | null }[];
  if (!rows.length) return "none";
  if (rows.some((r) => r.status === "approved" && r.code)) return "approved";
  return rows[0].status === "declined" ? "declined" : "pending";
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
