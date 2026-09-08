import { NextRequest, NextResponse } from "next/server";
import { sendSupportMessage } from "@/lib/support/telegram";
import { recordInbound, historyFor } from "@/lib/support/threads";
import { createRequest, attachTelegramMessage, recentRequestCount, PARTNER_ID } from "@/lib/deriv/mt5/eaAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SOMEBODY ASKING FOR THE GENERAL MT5 EA.
 *
 * The form on the bot's page collects an MT5 login, a name and an email. This
 * records it, then posts it into Telegram THROUGH THE SUPPORT PIPE rather than
 * as its own kind of notification — which means it arrives in the same chat as
 * everything else, carries the conversation this person has already had, and is
 * answered the same way: by swipe-replying to it.
 *
 * That reuse is the whole design. A separate channel would have been a second
 * inbox to remember, a second reply mechanism to build, and a second thing to
 * go quiet without anyone noticing.
 *
 * The reply the owner sends is /approve or /decline, handled in the support
 * webhook. Everything the person sees afterwards happens in the support bubble
 * they already have open.
 */

const MAX_BODY = 8 * 1024;

/** Deriv logins are numeric and short; anything else is a typo or a probe. */
const looksLikeLogin = (v: string) => /^[0-9]{4,12}$/.test(v);
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max).replace(/\s+/g, " ") : "";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "not json" }, { status: 400 });
  }

  const visitorId = clean(body.visitorId, 64);
  const mt5Login = clean(body.mt5Login, 32).replace(/\s/g, "");
  const name = clean(body.name, 80);
  const email = clean(body.email, 160);
  const page = clean(body.page, 200);

  if (!visitorId) return NextResponse.json({ error: "Reload the page and try again." }, { status: 400 });
  if (!looksLikeLogin(mt5Login)) {
    return NextResponse.json({ error: "That does not look like an MT5 login — it is the number Deriv shows on the account, usually 6 to 9 digits." }, { status: 422 });
  }
  if (name.length < 2) return NextResponse.json({ error: "Please give us a name to put to the account." }, { status: 422 });
  if (!looksLikeEmail(email)) return NextResponse.json({ error: "That email does not look right." }, { status: 422 });

  /* A brake rather than a rule: somebody who mistypes their login twice should
     be able to fix it, somebody scripting the form should not get far. */
  if ((await recentRequestCount(visitorId)) >= 5) {
    return NextResponse.json(
      { error: "You have sent several requests already. Give us a little time to look at the first one." },
      { status: 429 },
    );
  }

  const id = await createRequest({ visitorId, mt5Login, name, email, page });

  /* Written the way it needs to be read on a phone: the login first, because
     checking it against the partner list is the only decision to make, and the
     two commands last, because that is the reply. */
  const message = [
    "MT5 EA access request",
    "",
    `MT5 login: ${mt5Login}`,
    `Name: ${name}`,
    `Email: ${email}`,
    "",
    `Check the login under partner ${PARTNER_ID}.`,
    "",
    "Swipe-reply /approve to send them a code, or /decline <reason> to say no.",
  ].join("\n");

  const history = await historyFor(visitorId);

  const tgId = await sendSupportMessage({
    email,
    name,
    message,
    page: page || null,
    source: "MT5 EA access",
    visitorId,
    history,
  });

  /* Recorded as an inbound support message too, so it sits in this person's
     thread: the code arrives as a reply to it, and the next time they write in
     about anything the whole exchange is attached. */
  await recordInbound({
    visitorId,
    body: `Asked for the General MT5 EA — login ${mt5Login}`,
    tgMessageId: tgId,
    email,
    name,
    source: "MT5 EA access",
    page: page || null,
  });

  if (id && typeof tgId === "number" && tgId > 0) await attachTelegramMessage(id, tgId);

  /* Telegram being down does not lose the request — it is already recorded, and
     it can be approved by hand. Saying "sent" when nothing was sent would be
     the worse failure, so the caller is told plainly. */
  if (tgId === null) {
    return NextResponse.json(
      { error: "We could not reach the team just now. Your details are saved — please try again in a few minutes." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
