import { NextRequest, NextResponse } from "next/server";
import { sendSupportMessage } from "@/lib/support/telegram";
import { recordInbound, historyFor, recordReply } from "@/lib/support/threads";
import { createRequest, attachTelegramMessage, recentRequestCount, approvedCodeFor, PARTNER_ID } from "@/lib/deriv/mt5/eaAccess";
import { isBanned } from "@/lib/support/bans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SOMEBODY ASKING FOR THE GENERAL MT5 EA.
 *
 * The form on the bot's page collects a client or MT5 ID, a name and an email. This
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

/**
 * Whatever they paste is taken.
 *
 * There was a shape check here — UUID or a short run of digits — and it was
 * wrong: client IDs are not all one shape, and an ID guessed at by a regex is
 * an ID refused from somebody holding the real thing. Nothing downstream needs
 * the shape either. It is read by a person against the partner list, and a
 * wrong one simply gets declined, which is a reply rather than a wall.
 */
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
  /* 64, not 32: a UUID client ID is 36 characters, so the old cap chopped the
     tail off one and sent a truncated ID for checking. */
  const mt5Login = clean(body.mt5Login, 64).replace(/\s/g, "");
  const name = clean(body.name, 80);
  const email = clean(body.email, 160);
  const page = clean(body.page, 200);

  if (!visitorId) return NextResponse.json({ error: "Reload the page and try again." }, { status: 400 });
  if (!mt5Login) {
    return NextResponse.json({ error: "Please paste your client ID or MT5 ID." }, { status: 422 });
  }
  if (name.length < 2) return NextResponse.json({ error: "Please give us a name to put to the account." }, { status: 422 });
  if (!looksLikeEmail(email)) return NextResponse.json({ error: "That email does not look right." }, { status: 422 });

  /* Barred people are turned away before anything is recorded or sent, so a
     ban is quiet: nothing reaches Telegram and no row accumulates. The wording
     does not say "banned" — there is nothing to gain from arguing about it, and
     somebody who has been shown the door does not need a target. */
  if (await isBanned(visitorId, email)) {
    return NextResponse.json(
      { error: "We cannot take this request. If you think that is a mistake, reach us through the website." },
      { status: 403 },
    );
  }

  /* ALREADY APPROVED — send the code back, do not queue them again.
   *
   * The form has no memory of having been answered, so somebody who returns to
   * the page fills it in a second time. That used to record a fresh pending row
   * and put a person who was approved an hour ago back in the decision queue,
   * where they showed up as a request waiting on a decision that had already
   * been made. There is nothing to decide: they hold a code, and what they
   * actually need is to be told it again. */
  const already = await approvedCodeFor(visitorId);
  if (already) {
    await recordReply(
      visitorId,
      [
        "You are already approved — here is your code again:",
        "",
        already,
        "",
        "Paste it into step 4 on the bot's page to unlock the download. It works only on this browser.",
      ].join("\n"),
    );
    return NextResponse.json({ ok: true, already: true });
  }

  /* A brake rather than a rule: somebody who mistypes their ID twice should
     be able to fix it, somebody scripting the form should not get far. */
  if ((await recentRequestCount(visitorId)) >= 5) {
    return NextResponse.json(
      { error: "You have sent several requests already. Give us a little time to look at the first one." },
      { status: 429 },
    );
  }

  const id = await createRequest({ visitorId, mt5Login, name, email, page });

  /* Written the way it needs to be read on a phone: the ID first, because
     checking it against the partner list is the only decision to make, and the
     two commands last, because that is the reply. */
  const message = [
    "MT5 EA access request",
    "",
    `Client / MT5 ID: ${mt5Login}`,
    `Name: ${name}`,
    `Email: ${email}`,
    "",
    `Check this ID under partner ${PARTNER_ID}.`,
    "",
    id
      ? "Swipe-reply /approve to send them a code, or /decline <reason> to say no."
      : "⚠️ This one could NOT be recorded, so /approve has nothing to issue a code against — the trading_ea_requests table is missing. Apply the migration, then ask them to send the form again. You can still reply to them normally.",
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
    body: `Asked for the General MT5 EA — ID ${mt5Login}`,
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
