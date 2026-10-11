import { NextRequest, NextResponse } from "next/server";
import { visitorForTelegramMessage, visitorById, recordReply, listPeople, historyFor, unansweredChats, closeChat, type OpenChat } from "@/lib/support/threads";
import { isBanned, banPerson, unbanPerson, listBans, clearBans, findBan } from "@/lib/support/bans";
import { saveTelegramFile, type Attachment } from "@/lib/support/files";
import {
  requestForTelegramMessage, requestForVisitor, waitingPeople, requestForKey, eaStandingFor, approveRequest, declineRequest,
  markAnswered, PARTNER_ID, codeMessage, depositMessage, MISTAKE_LINE,
  DERIV_PROFILE, EXAMPLE_CLIENT_ID, DERIV_SIGNUP, declineCount,
  type EaRequest, type EaStanding, type WaitingPerson,
} from "@/lib/deriv/mt5/eaAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SUPPORT — the bot, and the way back to the person who asked.
 *
 * Support messages arrive in Telegram. To answer one, swipe-reply to it: the
 * reply is delivered to that visitor in the support bubble on the site, usually
 * within seconds. Telegram tells us which message was replied to, and that id
 * is what identifies the visitor — so the swipe is not a nicety, it is the
 * addressing. A message typed into the chat without replying to anything has no
 * recipient, and the bot says so rather than swallowing it.
 *
 * Telegram will POST to this from the open internet, so the shared secret it
 * was registered with is checked on every call. Without that anyone who guesses
 * the path can make the bot say things. Only the owner's chat is listened to —
 * its messages, and the buttons under the bot's own.
 *
 * Two replies mean something more than "send this on". Swipe-reply /approve to
 * a request for the General MT5 EA and it mints that person a code and posts it
 * into their support window; /decline tells them no, with the reason typed
 * after it. Both are addressed the same way as any other answer — by the
 * message they reply to — so there is nothing new to remember.
 */

const API = "https://api.telegram.org";
let lastRefusal = "";

type Json = Record<string, unknown>;

/** One Bot API call: its result, or null. Telegram answers "too many" with how
 *  long to wait — the waiting list is many messages in a row — and a short
 *  wait is honoured once. */
async function tg(method: string, payload: Json): Promise<Json | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: Json; description?: string; parameters?: { retry_after?: number } } | null;
      if (j && j.ok) return (j.result ?? {}) as Json;
      const wait = j?.parameters?.retry_after;
      if (attempt === 0 && wait && wait <= 8) { await new Promise((done) => setTimeout(done, wait * 1000 + 250)); continue; }
      lastRefusal = String(j?.description || r.status);
      console.error(`[support] telegram ${method} refused:`, lastRefusal);
      return null;
    } catch (e) {
      lastRefusal = String(e);
      console.error(`[support] telegram ${method} failed:`, e);
      return null;
    }
  }
  return null;
}

/** A message to the owner — as a reply when there is something to reply to.
 *  Returns the message sent, or null. Words Telegram cannot read as HTML (a
 *  stray "<" in somebody's name) go again as plain text rather than not at all. */
async function say(chatId: number, text: string, replyTo?: number | null, extra?: Json): Promise<Json | null> {
  const payload: Json = { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(extra ?? {}) };
  if (replyTo) payload.reply_parameters = { message_id: replyTo, allow_sending_without_reply: true };
  const sent = await tg("sendMessage", payload);
  if (sent || !/parse entities/i.test(lastRefusal)) return sent;
  delete payload.parse_mode;
  payload.text = text.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return tg("sendMessage", payload);
}

const esc = (s: unknown) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const countryName = (iso: string) => { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(iso) || iso; } catch { return iso; } };
const prettyPhone = (p: string) => (p || "").replace(/^(\+\d{1,3})(\d{3})(\d{3})(\d+)$/, "$1 $2 $3 $4");
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "18 Sep 14:41 UTC · 3 days ago" — when it was sent, and how long it has waited. */
function when(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return "";
  const stamp = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  const ago = mins < 2 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 2880 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  return `${stamp} · ${ago}`;
}
/** "18 Sep 14:41" — a time inside a list, where the UTC and the age would be noise. */
const stamp = (iso: string | null | undefined) => when(iso).split(" UTC")[0];
/** At most n characters of somebody's words. */
const clip = (s: string, n: number) => {
  const t = String(s || "").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

/* ── the waiting list ────────────────────────────────────────────────────────
 * Everyone still owed something, one entry per person: an EA request waiting
 * for a decision, messages with no reply after them — a question, "I have
 * downloaded it", a screenshot — or both. Longest waiting first.
 *
 * Each entry is its own message, sent as a reply to that person's NEWEST
 * message in this chat: tapping the quote jumps there, and scrolling up from
 * it is the whole conversation. 📜 History puts all of it in one place. The
 * buttons under it act on that person and ask before anything is sent;
 * swipe-replying to the entry answers them like any of their own messages.
 * Telegram stops at 4096 characters and a burst of messages gets throttled,
 * so the list comes a page at a time. */

const PAGE = 8;
const BUTTON_ID = /^[A-Za-z0-9_-]{1,40}$/;

type Waiting = {
  visitorId: string;
  ea: WaitingPerson | null;
  chat: OpenChat | null;
  standing: EaStanding | null;
  request: Partial<EaRequest>;
  name: string;
  email: string;
  since: string;
  jump: number | null;
};

async function everyoneWaiting(): Promise<Waiting[]> {
  const [requests, chats, bans] = await Promise.all([waitingPeople(), unansweredChats(), listBans(1000)]);
  // Banned people stay off it: nothing of theirs reaches here any more.
  const banned = new Set<string>();
  for (const b of bans) if (b.active) { if (b.visitorId) banned.add(b.visitorId); if (b.email) banned.add(b.email.toLowerCase()); }

  const by = new Map<string, Waiting>();
  const of = (id: string) => {
    let p = by.get(id);
    if (!p) { p = { visitorId: id, ea: null, chat: null, standing: null, request: {}, name: "", email: "", since: "", jump: null }; by.set(id, p); }
    return p;
  };
  for (const r of requests) of(r.visitorId || String(r.id)).ea = r;
  for (const c of chats) of(c.visitorId).chat = c;
  const people = [...by.values()].filter((p) => {
    const email = String(p.ea?.email || p.chat?.email || "").toLowerCase();
    return !banned.has(p.visitorId) && !(email && banned.has(email));
  });

  // Somebody who only wrote in is shown beside their EA request, if they ever sent one.
  const standing = await eaStandingFor(people.filter((p) => !p.ea).map((p) => p.visitorId));
  for (const p of people) {
    const { ea, chat } = p;
    p.standing = ea ? null : standing.get(p.visitorId) ?? null;
    const any: Partial<EaRequest> = ea || p.standing?.pending || p.standing?.approved || p.standing?.latest || {};
    p.request = any;
    p.name = any.name || chat?.name || "";
    p.email = any.email || chat?.email || "";
    p.since = [ea ? (ea.firstAt || ea.createdAt) : null, chat?.firstAt].filter(Boolean).sort()[0] || "";
    // Their newest message in this chat, wherever it came from: the jump.
    const eaAt = ea ? String(ea.createdAt || "") : "", chatAt = chat ? String(chat.lastAt || "") : "";
    p.jump = (chat?.tgMessageId && chatAt >= eaAt ? chat.tgMessageId : null) || ea?.tgMessageId || chat?.tgMessageId || null;
  }
  return people.sort((a, b) => a.since.localeCompare(b.since));
}

/** Can a decision still be made — an open request, or a declined one to think again about? */
const decidable = (p: Waiting) => !!(p.ea || (p.standing && !p.standing.approved && (p.standing.pending || p.standing.latest?.status === "declined")));

function eaLine(p: Waiting): string {
  if (p.ea) return `🧾 <b>EA request — waiting for your decision</b>${p.ea.requests > 1 ? ` · sent ${p.ea.requests} times, one decision settles all` : ""}`;
  const s = p.standing;
  if (!s) return "";
  if (s.approved) return `🧾 EA approved ${stamp(s.approved.decidedAt)} · code <code>${esc(s.approved.code)}</code>`;
  if (s.pending) return `🧾 <b>EA request still open</b> — ${s.pending.answeredAt ? `answered ${stamp(s.pending.answeredAt)}, ` : ""}no decision yet`;
  if (s.latest?.status === "declined") return `🧾 EA request declined ${stamp(s.latest.decidedAt)}`;
  return "";
}

function entryText(p: Waiting, n: number, total: number): string {
  const r = p.request, chat = p.chat;
  const lines = [
    `<b>${n}/${total} · ${esc(p.name || "(no name)")}</b>`,
    `✉️ ${esc(p.email || "(no email)")}${p.ea && p.ea.otherEmails.length ? ` (also sent as ${p.ea.otherEmails.map(esc).join(", ")})` : ""}`,
    r.phone ? `📱 ${esc(prettyPhone(r.phone))}${CHANNEL[r.contact || ""] ? ` · ${CHANNEL[r.contact || ""]}` : ""}` : "",
    r.country ? `🌍 ${esc(countryName(r.country))} (${esc(r.country)})` : "",
    eaLine(p),
  ];
  if (chat) {
    const shown = chat.messages.slice(-5), more = chat.messages.length - shown.length;
    lines.push(`💬 <b>${chat.messages.length === 1 ? "1 message" : `${chat.messages.length} messages`} with no reply</b>`);
    lines.push(`<blockquote expandable>${[
      more ? `<i>…${more} earlier — 📜 History has them</i>` : "",
      ...shown.map((m) => `<b>${stamp(m.at)}</b> ${esc(clip(m.body, 400))}`),
    ].filter(Boolean).join("\n")}</blockquote>`);
  }
  lines.push(`🕒 Waiting since ${when(p.since)}`);
  lines.push(`🆔 <code>${esc(p.visitorId)}</code>`);
  return lines.filter(Boolean).join("\n");
}

/** The buttons under an entry. `done` replaces the decision row once one is made.
 *  ":0" on the data marks an entry with no decision to make, so "‹ Back" knows. */
function entryKeys(id: string, decide: boolean, done?: string) {
  const tail = decide ? "" : ":0";
  const rows: Json[][] = [];
  if (done) rows.push([{ text: done, callback_data: "wq:z" }]);
  else if (decide) rows.push([
    { text: "✅ Approve", callback_data: `wq:a:${id}` },
    { text: "💳 Deposit", callback_data: `wq:p:${id}` },
    { text: "✖️ Decline", callback_data: `wq:d:${id}` },
  ]);
  rows.push([
    { text: "✍️ Reply", callback_data: `wq:r:${id}${tail}` },
    { text: "📜 History", callback_data: `wq:h:${id}${tail}` },
    ...(done ? [] : [{ text: "✔️ Done", callback_data: `wq:x:${id}${tail}` }]),
  ]);
  rows.push([{ text: "📋 Copy ID", copy_text: { text: id } }]);
  return { inline_keyboard: rows };
}

async function sayWaiting(chatId: number, replyTo?: number | null, lead?: string, from?: number) {
  const people = await everyoneWaiting();
  if (!people.length) {
    await say(chatId, `${lead ? lead + "\n\n" : ""}✅ <b>Nobody is waiting.</b> Every EA request has a decision and every message has a reply.`, replyTo);
    return;
  }
  const start = Math.min(Math.max(0, from || 0), Math.floor((people.length - 1) / PAGE) * PAGE);
  const page = people.slice(start, start + PAGE);
  if (start === 0) {
    const decide = people.filter((p) => p.ea).length, chats = people.filter((p) => p.chat).length;
    const first = people[0].visitorId;
    await say(chatId, [
      lead ? lead + "\n" : null,
      `📋 <b>Waiting — ${people.length} ${people.length === 1 ? "person" : "people"}</b>, longest waiting first`,
      `🧾 ${decide} EA request${decide === 1 ? "" : "s"} to decide · 💬 ${chats} with messages not answered`,
      "",
      "Each one follows as its own message, quoting their newest message: <b>tap the quote</b> to jump there and scroll up for the whole conversation, or tap 📜 History.",
      "Swipe-reply to an entry, or tap ✍️ Reply, to answer them. ✅ Approve, 💳 Deposit, ✖️ Decline and ✔️ Done (off the list, no reply) each ask before they act.",
      `The commands still work: <code>/approve ${esc(first)}</code>, <code>/decline ${esc(first)} your reason</code>, <code>/deposit ${esc(first)}</code>.`,
    ].filter((line) => line !== null).join("\n"), replyTo);
  } else {
    await say(chatId, `📋 <b>Waiting — ${start + 1}–${start + page.length} of ${people.length}</b>`, replyTo, { disable_notification: true });
  }
  for (let i = 0; i < page.length; i++) {
    const p = page[i];
    await say(chatId, entryText(p, start + i + 1, people.length), p.jump,
      { disable_notification: true, ...(BUTTON_ID.test(p.visitorId) ? { reply_markup: entryKeys(p.visitorId, decidable(p)) } : {}) });
  }
  const next = start + PAGE;
  if (next < people.length) {
    await say(chatId, `Showing ${start + 1}–${start + page.length} of ${people.length}.`, null, {
      disable_notification: true,
      reply_markup: { inline_keyboard: [[{ text: `Next ${Math.min(PAGE, people.length - next)} ›`, callback_data: `wq:n:${next}` }]] },
    });
  } else if (start > 0) {
    await say(chatId, `That is everyone — ${people.length} people.`, null, { disable_notification: true });
  }
}

/** 📜 The whole conversation with one person, both sides, oldest first. */
async function sayHistory(chatId: number, id: string, replyTo: number) {
  const LIMIT = 150;
  const [thread, who] = await Promise.all([historyFor(id, LIMIT), visitorById(id)]);
  if (!thread.length) {
    await say(chatId, `Nothing is on record for <code>${esc(id)}</code>.`, replyTo, { disable_notification: true });
    return;
  }
  const head = `📜 <b>Everything with ${esc(who?.email || id)}</b> — ${thread.length === LIMIT ? `the last ${LIMIT}` : thread.length} message${thread.length === 1 ? "" : "s"}, oldest first`;
  const items = thread.map((x) => `${x.from === "us" ? "↩️ <b>You</b>" : "💬 <b>Them</b>"} · ${stamp(x.at)}\n${esc(clip(x.body, 1200))}`);
  const chunks: string[][] = [];
  let cur: string[] = [], size = 0;
  for (const it of items) {
    if (cur.length && size + it.length > 3400) { chunks.push(cur); cur = []; size = 0; }
    cur.push(it); size += it.length + 2;
  }
  chunks.push(cur);
  for (let i = 0; i < chunks.length; i++) {
    await say(chatId, [
      i === 0 ? head : `📜 <i>continued, ${i + 1} of ${chunks.length}</i>`,
      `<blockquote expandable>${chunks[i].join("\n\n")}</blockquote>`,
      i === chunks.length - 1 ? `🆔 <code>${esc(id)}</code> — swipe-reply here to answer them.` : "",
    ].filter(Boolean).join("\n"), i === 0 ? replyTo : null, { disable_notification: true });
  }
}

type TgMessage = {
  message_id?: number;
  chat?: { id?: number };
  from?: { is_bot?: boolean };
  text?: string;
  /* A photo or a document arrives with `caption` instead of `text`, and
     nothing in `text` at all. Reading only `text` is why sending a
     screenshot answered "I could not tell who that was for" — the reply
     was addressed perfectly well, it just looked empty. */
  caption?: string;
  photo?: { file_id?: string; file_size?: number }[];
  document?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number };
  reply_to_message?: TgMessage;
};
type TgButton = { id: string; data?: string; message?: TgMessage };

/** A button under a waiting-list entry. Decisions run exactly as the typed
 *  command with the person's ID would, so there is one way of doing each. */
async function onButton(cq: TgButton) {
  const chatId = cq.message!.chat!.id as number, mid = cq.message!.message_id as number;
  const [tag, act, id, flag] = String(cq.data || "").split(":");
  const decide = flag !== "0", tail = decide ? "" : ":0";
  const keys = (markup: Json) => tg("editMessageReplyMarkup", { chat_id: chatId, message_id: mid, reply_markup: markup });
  let toast = "";
  try {
    if (tag !== "wq") return;
    if (act === "z") { toast = "Already done."; return; }
    if (act === "n") {
      await keys({ inline_keyboard: [] });
      await sayWaiting(chatId, null, "", Number(id) || 0);
      return;
    }
    if (!BUTTON_ID.test(id || "")) return;

    const ASK: Record<string, string> = {
      a: "✅ Yes — approve and send the code",
      p: "💳 Yes — ask them to deposit first",
      d: "✖️ Yes — decline (no reason given)",
      x: "✔️ Yes — off the list, nothing sent",
    };
    if (ASK[act]) {
      await keys({ inline_keyboard: [
        [{ text: ASK[act], callback_data: `wq:${act.toUpperCase()}:${id}${tail}` }],
        [{ text: "‹ Back", callback_data: `wq:b:${id}${tail}` }],
      ] });
      toast = act === "x" ? "Take them off the list without replying? Tap to confirm." : "Tap again to confirm.";
      return;
    }
    if (act === "b") { await keys(entryKeys(id, decide)); return; }

    if (act === "A" || act === "P" || act === "D") {
      const verb = { A: "approve", P: "deposit", D: "decline" }[act];
      const result = await onMessage({ message_id: mid, chat: cq.message!.chat, text: `/${verb} ${id}` });
      const DONE: Record<string, string> = { approved: "✅ Approved — code sent", deposit: "💳 Asked to deposit first", declined: "✖️ Declined — they were told" };
      if (result && DONE[result]) { await keys(entryKeys(id, false, DONE[result])); toast = DONE[result]; }
      else { await keys(entryKeys(id, decide)); toast = "Nothing went through — see the message below."; }
      return;
    }
    if (act === "X") {
      await closeChat(id);
      await markAnswered(id);
      await keys(entryKeys(id, false, "✔️ Off the list — nothing sent"));
      toast = "Off the list. Nothing was sent; their next message brings them back.";
      return;
    }
    if (act === "r") {
      const who = await visitorById(id);
      if (!who) { toast = "They have no support chat on the site to answer into."; return; }
      await say(chatId, [
        `✍️ <b>Your answer to ${esc(who.email || id)}</b> — reply to THIS message with it: text, a photo or a document. It appears in their support window on the site.`,
        `🆔 <code>${esc(id)}</code>`,
      ].join("\n"), mid, { reply_markup: { force_reply: true, input_field_placeholder: "Your answer…" } });
      toast = "Type your answer as the reply.";
      return;
    }
    if (act === "h") { await sayHistory(chatId, id, mid); return; }
  } finally {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, ...(toast ? { text: toast } : {}) });
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    // 200, not 401: a wrong caller should learn nothing, and Telegram must not
    // start retrying a delivery that was never ours.
    return NextResponse.json({ ok: true });
  }

  const update = (await req.json().catch(() => ({}))) as { message?: TgMessage; callback_query?: TgButton };
  const owner = process.env.TELEGRAM_CHAT_ID;

  // A button under one of the bot's own messages — in the owner's chat only.
  const cq = update.callback_query;
  if (cq) {
    if (cq.message?.chat && String(cq.message.chat.id) === owner) {
      try { await onButton(cq); } catch (e) { console.error("[support] button failed:", e); }
    }
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  const chatId = msg?.chat?.id;
  if (!msg || typeof chatId !== "number") return NextResponse.json({ ok: true });

  // Only the owner's chat is listened to. A stranger who finds the bot is not
  // someone we want putting words in front of our visitors.
  if (String(chatId) !== owner) return NextResponse.json({ ok: true });

  // Answered 200 whatever happens: a failure Telegram retried would run twice.
  try { await onMessage(msg); } catch (e) { console.error("[support] update failed:", e); }
  return NextResponse.json({ ok: true });
}

/** One message from the owner. Returns what a decision did ("approved",
 *  "deposit", "declined"), for the button that asked for it. */
async function onMessage(msg: TgMessage): Promise<string | null | void> {
  const chatId = msg.chat!.id as number;
  const text = (msg.text ?? msg.caption ?? "").trim();
  const repliedTo = msg.reply_to_message?.message_id;

  /* Who a swipe-reply is for. The visitor's own message (words or picture)
     is the normal target. But a thread on a phone quickly fills with the
     bot's own lines — "Delivered to 3A8ACC6A", a waiting-list entry, the
     original header with its "Person:" id — and swiping on one of those is a
     reasonable thing to do mid-conversation. Every bot message about a person
     carries their id, after 🆔 where there is one, so it is read back out. */
  async function personBehind(replied?: TgMessage) {
    if (!replied || !replied.message_id) return null;
    const direct = await visitorForTelegramMessage(replied.message_id);
    if (direct) return direct;
    if (!replied.from?.is_bot) return null;
    const said = String(replied.text || replied.caption || "");
    const m = /🆔\s*(?:Person:\s*)?([0-9A-F]{8})\b/.exec(said) || /\b([0-9A-F]{8})\b/.exec(said);
    return m ? visitorById(m[1]) : null;
  }

  // ── a decision on an EA access request ──
  //
  // Reached three ways, because Telegram offers three and the owner should not
  // have to know which one this expects:
  //
  //   . swipe-reply /approve   - points straight at the request
  //   . type or TAP /approve   - tapping a command in a message sends it as
  //                              its OWN message with no reply attached, so
  //                              nothing pointed at the request and it fell
  //                              through to "Nothing was sent". That was a
  //                              reply mechanism refusing a perfectly
  //                              reasonable way of answering.
  //   . /approve 12345678      - names the ID, for when several are waiting
  //
  // Without a reply the command needs the person's ID after it — the one
  // shown in the request and in the waiting list. The bare command, with
  // nothing to point at anyone, shows the waiting list instead of guessing,
  // because approving the wrong person cannot be taken back. "/waiting 2" is
  // the list's second page.
  const wait = /^\/(waiting|pending|list)(?:@[A-Za-z0-9_]+)?\b(?:\s+(\d+))?/i.exec(text);
  if (wait) {
    await sayWaiting(chatId, msg.message_id, "", wait[2] ? (Number(wait[2]) - 1) * PAGE : 0);
    return;
  }

  const cmd = /^\/(approve|decline|deposit)(?:@[A-Za-z0-9_]+)?\b/i.exec(text);
  if (cmd) {
    const isApprove = /^approve$/i.test(cmd[1]);
    const isDeposit = /^deposit$/i.test(cmd[1]);
    const verb = cmd[1].toLowerCase();
    let reason = text.slice(cmd[0].length).trim();
    let reqst: EaRequest | null = null;

    if (repliedTo) {
      /* Pointed at something: use exactly that. Falling back to "the newest
         pending one" here would approve a DIFFERENT person from the one whose
         message was replied to. */
      reqst = await requestForTelegramMessage(repliedTo);

      /* The message you reply to is usually NOT the request message. A
         conversation runs on: they ask something, you answer, they write
         again, and later you reply to whatever is in front of you rather than
         scrolling back to find the form. That pointer led nowhere and the
         command failed, claiming nothing had ever been recorded.

         So if the message is not itself a request, ask who it belongs to and
         take THEIR request. Same person either way — only the message
         differs, and which message you had on screen should decide nothing. */
      if (!reqst) {
        const who = await personBehind(msg.reply_to_message);
        if (who) reqst = await requestForVisitor(who.visitorId);
      }
    } else {
      /* Any ID, not just digits. This matched 4-12 digits only, while the
         prompt above it offers whatever the person typed — a UUID, or the
         placeholder text — so the command it told you to send bounced. */
      const named = reason.match(/^(\S{4,64})\b/);
      if (!named) {
        await sayWaiting(chatId, msg.message_id);
        return;
      }
      reqst = await requestForKey(named[1]);
      if (!reqst) {
        // A word that is nobody — a reason typed without an ID, or a typo in
        // one. The list is the answer either way: pick the ID from it.
        await sayWaiting(chatId, msg.message_id, `<code>${esc(named[1])}</code> matches nobody, so nothing was ${verb === "approve" ? "approved" : verb === "decline" ? "declined" : "sent"}. Put the person's ID right after <code>/${verb}</code>:`);
        return;
      }
      reason = reason.slice(named[0].length).trim();
    }

    if (!reqst) {
      /* Two very different situations, and telling them apart is the whole
         value of this branch.

         If the message IS a support message but has no EA request behind it,
         the request was never recorded — which happens when the ea_requests
         table is missing. Saying "that is not a request" there sends somebody
         hunting for a mistake they did not make, which is exactly what it did.
         The person is still reachable, so that is said too. */
      const who = repliedTo ? await personBehind(msg.reply_to_message) : null;
      await say(
        chatId,
        who
          ? [
              `${who.email || "This person"} has never sent the EA form, so there is no request to ${isApprove ? "approve" : "decline"}.`,
              "",
              "Ask them to open the bot’s page and fill it in — then the request lands here and this command works.",
              "",
              "They are reachable meanwhile: anything you type here WITHOUT a slash goes to them as a normal reply.",
            ].join("\n")
          : "That is not an EA access request, so there is nothing to approve. Swipe-reply to the request itself, or to anything that person sent.",
        msg.message_id,
      );
      return;
    }

    /* A DECISION IS ABOUT THE PERSON, so it settles everything of theirs.
     *
     * One person often has several rows: the form has no memory, so returning
     * to the page and filling it in again makes another. Deciding used to touch
     * only the row you happened to resolve, and the duplicates stayed pending —
     * which is why people you had already answered kept reappearing in "3
     * requests are waiting", each one an individual asking for a decision that
     * had in fact been made.
     *
     * Marked answered rather than decided: the row you acted on carries the
     * real outcome, and the others were never separately judged. */
    const alsoSettled = await markAnswered(reqst.visitorId);

    /* Under us, but not funded: neither approved nor declined. They are told
       to deposit — any amount, with the bonus — and the request leaves the
       waiting list until they reply; a swipe-reply /approve on that reply
       still finds it, because its status is untouched. */
    if (isDeposit) {
      const told = await recordReply(reqst.visitorId, depositMessage(reqst.email));
      await say(chatId, told
        ? `💳 ${reqst.name} (${reqst.email}) has been asked to deposit first. Their request waits — swipe-reply /approve when they come back funded.`
        : `⚠️ Could not deliver the deposit message — tell ${reqst.email} yourself.`,
        msg.message_id);
      return told ? "deposit" : null;
    }

    if (isApprove) {
      const code = await approveRequest(reqst.id);
      if (!code) {
        await say(chatId, "⚠️ Could not issue a code just now. Nothing was sent — try again in a moment.", msg.message_id);
        return null;
      }

      const delivered = await recordReply(
        reqst.visitorId,
        codeMessage(code, reqst.mt5Login, `Your Headway account (${reqst.email}) is confirmed under our community — here is your download code:`),
      );

      await say(
        chatId,
        delivered
          ? `✅ Approved. Code <code>${code}</code> sent to ${reqst.name} (${reqst.email}${reqst.phone ? `, ${reqst.phone}` : ""}).${alsoSettled > 1 ? ` Their ${alsoSettled - 1} other open request${alsoSettled === 2 ? "" : "s"} left the waiting list with it.` : ""}`
          : `⚠️ Code <code>${code}</code> was issued but could not be delivered. Send it to ${reqst.email} yourself.`,
        msg.message_id,
      );
      return delivered ? "approved" : null;
    }

    await declineRequest(reqst.id);

    /* A REPEAT decline is not the first one said again.
     *
     * Somebody who checked their ID, wrote to the broker and came back to the same
     * three paragraphs cannot tell whether anything happened at all — it reads
     * like an autoreply, and it is the point at which people give up. The count
     * includes the decision just made, so >1 means they have been here before.
     *
     * The first-time version is two messages — check the login, then how to
     * be moved under us — and in one bubble they read as the same thing. The
     * repeat is a single short message: they already know to check, so it
     * just restates what is still missing and what to send. */
    const times = await declineCount(reqst.visitorId);

    const first = times > 1
      ? await recordReply(
          reqst.visitorId,
          [
            `We checked again and your Headway account — ${reqst.name} (${reqst.email}) — is still not showing under our partner group.`,
            reason,
            "",
            "Headway has to attach it — we cannot do it from our side. Ask Headway support to move your account under our Partner ID, or open a new account through our link, which places it under us automatically:",
            "",
            `Partner ID: ${PARTNER_ID}`,
            `Sign-up link: ${DERIV_SIGNUP}`,
            "",
            "Reply here once it is done and we will check again.",
            "",
            MISTAKE_LINE,
          ].filter((line, i) => i !== 1 || line !== "").join("\n"),
        )
      : await recordReply(
          reqst.visitorId,
          [
            `We could not find a Headway account for ${reqst.name} (${reqst.email}) under our partner group, so we cannot send a code yet.`,
            reason,
            "",
            "First, check that the name and email you sent are exactly the ones registered at Headway — if they differ, reply here with the right ones:",
          ]
            /* Only a missing reason is dropped; the blank lines are the
               paragraph breaks, and filtering those out ran it all together. */
            .filter((line, i) => i !== 1 || line !== "")
            .join("\n"),
        );

    /* The repeat says everything in one message, so there is no second one. */
    const second = times > 1
      ? true
      : await recordReply(
          reqst.visitorId,
          [
            "If they were already right, then your account is not under us yet — and only Headway can move it.",
            "",
            "Ask Headway support to attach your account to our Partner ID:",
            PARTNER_ID,
            "",
            "That is OUR Partner ID, not yours — give them that one.",
            "",
            `Or open a new Headway account through our link, which places it under us automatically: ${DERIV_SIGNUP}`,
            "",
            "Reply here once it is done and we will check again.",
            "",
            MISTAKE_LINE,
          ].join("\n"),
        );

    const delivered = first && second;
    await say(
      chatId,
      delivered
        ? `Declined. ${reqst.name} (${reqst.email}) has been told, with the Partner ID and sign-up link.${alsoSettled > 1 ? ` Their ${alsoSettled - 1} other open request${alsoSettled === 2 ? "" : "s"} left the waiting list with it.` : ""}${times > 1 ? ` This is decline #${times} for them — they got the follow-up wording, not the first one again.` : ""}`
        : `Declined, but the message could not be delivered — tell ${reqst.email} yourself.`,
      msg.message_id,
    );
    return delivered ? "declined" : null;
  }

  /* Telegram gives several sizes of a photo, smallest first; the last is the
     full one. A document keeps its own name and mime type, which is what makes
     a PDF arrive as a PDF rather than as bytes with a guessed extension. */
  const photoId = msg.photo?.length ? msg.photo[msg.photo.length - 1]?.file_id : undefined;
  const docId = msg.document?.file_id;
  const hasFile = !!(photoId || docId);

  // ── a reply to a support message: deliver it, with whatever came attached ──
  if (repliedTo && (text || hasFile) && !text.startsWith("/")) {
    const who = await personBehind(msg.reply_to_message);

    if (!who) {
      await say(chatId, "That is not a support message, so there is nobody to send it to. Swipe-reply to the message from the person you want to answer.", msg.message_id);
      return;
    }

    /* Fetched and re-hosted before the message is recorded, because a link to
       Telegram's own copy carries our bot token in the URL — handing that to
       every visitor who opens the support window. */
    let file: Attachment | null = null;
    if (photoId) file = await saveTelegramFile(photoId, "screenshot.jpg", "image/jpeg");
    else if (docId) {
      file = await saveTelegramFile(docId, msg.document?.file_name || "file", msg.document?.mime_type);
    }

    /* A file that would not store must not take the words down with it: the
       text still goes, and the failure is reported rather than swallowed. */
    const fileFailed = hasFile && !file;
    const stored = (text || file) ? await recordReply(who.visitorId, text, file) : false;

    /* Answering somebody IS dealing with them.
     *
     * Their EA request stayed `pending` until a slash command touched it, so
     * people who had been written to kept coming back in the "3 requests are
     * waiting" list — and the list only grew, because most conversations are
     * handled by talking rather than by deciding. A reply now takes their open
     * requests out of the queue. It decides nothing: /approve and /decline
     * still work on them afterwards, from any message in the thread. */
    const cleared = stored ? await markAnswered(who.visitorId) : 0;

    await say(
      chatId,
      stored
        ? [
            `✅ Delivered to <code>${who.visitorId}</code>. They will see it in the support window on the site${who.email ? ` — ${who.email}` : ""}.`,
            file ? `📎 ${file.name} went with it.` : "",
            fileFailed ? "⚠️ The attachment could not be stored, so only your text went. Try sending the file again." : "",
            cleared
              ? `Their EA request is off the waiting list — you have answered them. <code>/approve</code> or <code>/decline</code> still work on it from any message of theirs.`
              : "",
          ].filter(Boolean).join("\n")
        : fileFailed && !text
          ? "⚠️ That attachment could not be stored, so nothing was sent. Try again in a moment."
          : "⚠️ Could not deliver that just now. Nothing was sent — try again in a moment.",
      msg.message_id,
    );
    return;
  }

  // ── the door: /ban, /unban, /bans ──
  //
  // Addressed the same way a decision is: swipe-reply to somebody's message to
  // act on THEM, or name an email. A swipe-reply is the safer of the two and
  // the one to prefer, because it cannot land on the wrong person.
  const doorCmd = /^\/(ban|unban)(?:@[A-Za-z0-9_]+)?\b/i.exec(text);
  if (doorCmd) {
    const banning = /^ban$/i.test(doorCmd[1]);
    const rest = text.slice(doorCmd[0].length).trim();

    let visitorId: string | null = null;
    let email: string | null = null;
    let name: string | null = null;
    let reason = rest;

    if (repliedTo) {
      const who = await personBehind(msg.reply_to_message);
      if (!who) {
        await say(chatId, "That is not a support message, so there is nobody to act on. Swipe-reply to a message from the person you mean, or send <code>/BANCMD their@email</code>.".replace("BANCMD", banning ? "ban" : "unban"), msg.message_id);
        return;
      }
      visitorId = who.visitorId;
      email = who.email;
    } else {
      const named = rest.match(/^(\S+@\S+\.\S+|[A-Za-z0-9-]{6,})\b/);
      if (!named) {
        await say(chatId, `Say who. Swipe-reply to their message, or send <code>/${banning ? "ban" : "unban"} their@email</code>.`, msg.message_id);
        return;
      }
      if (named[1].includes("@")) email = named[1];
      else visitorId = named[1];
      reason = rest.slice(named[0].length).trim();
    }

    if (banning) {
      const done = await banPerson({ visitorId, email, name, reason: reason || null });
      /* Somebody shown the door is not somebody you still owe a decision. */
      if (done?.visitorId) await markAnswered(done.visitorId);
      await say(
        chatId,
        done
          ? [
              `Banned ${done.email || done.visitorId}.`,
              done.reason ? `Reason: ${done.reason}` : "",
              "",
              "Their messages and EA requests stop reaching you. Nothing tells them so — the window just goes quiet.",
              "Undo with <code>/unban " + (done.email || done.visitorId) + "</code>.",
            ].filter(Boolean).join("\n")
          : "Could not record that ban.",
        msg.message_id,
      );
      return;
    }

    const key = email || visitorId || "";
    const lifted = await unbanPerson(key);
    await say(
      chatId,
      lifted
        ? `Unbanned ${lifted.email || lifted.visitorId}. They can write in again. The row stays in <code>/bans</code> so the history is not lost.`
        : `No active ban found for <code>${key}</code>.`,
      msg.message_id,
    );
    return;
  }

  // ── the list, and emptying it ──
  if (/^\/bans\b/i.test(text)) {
    const arg = text.replace(/^\/bans(?:@[A-Za-z0-9_]+)?/i, "").trim().toLowerCase();

    if (arg === "clear" || arg === "clear lifted" || arg === "clear all") {
      const which = arg === "clear all" ? "all" : "lifted";
      const gone = await clearBans(which as "lifted" | "all");
      await say(
        chatId,
        which === "all"
          ? `Cleared the whole list — ${gone} row${gone === 1 ? "" : "s"} deleted. Everyone who was banned is unbanned.`
          : `Cleared ${gone} lifted ban${gone === 1 ? "" : "s"}. Active bans are untouched — <code>/bans clear all</code> removes those too.`,
        msg.message_id,
      );
      return;
    }

    const rows = await listBans(40);
    if (!rows.length) {
      await say(chatId, "Nobody is banned, and nobody has been.", msg.message_id);
      return;
    }

    const live = rows.filter((r) => r.active);
    await say(
      chatId,
      [
        `<b>Bans</b> — ${live.length} active of ${rows.length}`,
        "",
        ...rows.slice(0, 25).map((r) => {
          const who = r.email || r.visitorId || "?";
          const day = r.bannedAt.slice(0, 10);
          return r.active
            ? `⛔ <code>${who}</code> — ${day}${r.reason ? ` — ${r.reason}` : ""}`
            : `✓ <code>${who}</code> — banned ${day}, lifted ${(r.unbannedAt || "").slice(0, 10)}`;
        }),
        rows.length > 25 ? `
…and ${rows.length - 25} more.` : "",
        "",
        "<code>/bans clear</code> removes the lifted ones, <code>/bans clear all</code> empties it entirely.",
      ].filter(Boolean).join("\n"),
      msg.message_id,
    );
    return;
  }

  // ── who has written in ──
  if (/^\/users\b/i.test(text)) {
    const people = await listPeople(40);
    if (!people.length) {
      await say(chatId, "Nobody has written in yet.", msg.message_id);
      return;
    }

    /* Banned people are marked rather than hidden: a list that quietly omits
       them makes you wonder where somebody went. */
    const marks = await Promise.all(people.map((u) => isBanned(u.visitorId, u.email)));

    await say(
      chatId,
      [
        `<b>People</b> — ${people.length}`,
        "",
        ...people.slice(0, 30).map((u, i) => {
          const when = u.last.slice(0, 10);
          const since = u.first.slice(0, 10);
          const span = since === when ? when : `${since} → ${when}`;
          return [
            `${marks[i] ? "⛔ " : ""}<b>${u.name || "(no name)"}</b>`,
            `  ${u.email || "(no email)"}`,
            `  ${span} · ${u.messages} msg${u.messages === 1 ? "" : "s"}`,
          ].join("\n");
        }),
        people.length > 30 ? `
…and ${people.length - 30} more.` : "",
      ].filter(Boolean).join("\n"),
      msg.message_id,
    );
    return;
  }

  // ── commands and stray messages ──
  if (/^\/start\b/.test(text)) {
    await say(
      chatId,
      [
        "<b>Clunoid support is connected.</b>",
        "",
        "Messages from the support bubble on clunoid.com arrive here.",
        "",
        "<b>To answer someone, swipe-reply to their message.</b> Your reply appears in their support window on the site within seconds.",
        "",
        "Typing here without replying to a message sends it nowhere — there is no way to tell who it was meant for.",
        "",
        "<b>MT5 EA requests:</b> swipe-reply to the request with <code>/approve</code> to issue a download code, <code>/decline your reason</code> to turn it down, or <code>/deposit</code> when the account is under us but not funded yet. Without a reply, the same commands need the person's ID — the one shown in the request: <code>/approve CDED1137</code>.",
        "",
        "<b>The waiting list:</b> <code>/waiting</code> lists everyone still owed something — an EA request to decide, messages with no reply yet (a question, a screenshot, anything they wrote), or both — longest waiting first, one message each with what they said. Each one quotes their newest message: tap the quote to jump there and scroll up for the whole conversation, or tap 📜 History. Its buttons approve, ask for a deposit or decline (each asks first), ✍️ Reply answers them, ✔️ Done takes them off the list without a reply. <code>/approve</code>, <code>/decline</code> or <code>/deposit</code> on their own show the same list.",
        "",
        "<b>Keeping people out:</b> swipe-reply and send <code>/ban</code> (add a reason if you want one recorded), or <code>/ban their@email</code>. Their messages and requests stop reaching you and they are told nothing. <code>/unban</code> lifts it. <code>/bans</code> is the list, <code>/bans clear</code> tidies the lifted ones and <code>/bans clear all</code> empties it.",
        "",
        "<b>Who has written in:</b> <code>/users</code> — names, emails and dates, banned ones marked.",
      ].join("\n"),
    );
  } else if (/^\/(help|status)\b/.test(text)) {
    await say(chatId, "Swipe-reply to a support message to answer it. /waiting lists everyone owed an answer or a decision, with what they said and buttons to approve, ask for a deposit, decline, reply, read the whole history or close. For an MT5 EA request you can also swipe-reply with /approve, /decline reason or /deposit, or send /approve ID. /ban and /unban control who gets through, /bans is that list, /users is everyone who has written in. An ordinary message with no reply attached has no recipient.");
  } else if (hasFile) {
    await say(chatId, "That file went nowhere — I could not tell who it was for. <b>Swipe-reply</b> with it to the message from the person you are answering, and it will appear in their support window.");
  } else {
    await say(chatId, "Nothing was sent — I could not tell who that was for. <b>Swipe-reply</b> to someone's support message to answer them.");
  }
}
