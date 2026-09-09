import { NextRequest, NextResponse } from "next/server";
import { visitorForTelegramMessage, recordReply } from "@/lib/support/threads";
import {
  requestForTelegramMessage, pendingRequests, approveRequest, declineRequest, PARTNER_ID,
  DERIV_PROFILE, EXAMPLE_CLIENT_ID, DERIV_SIGNUP, declineCount,
  type EaRequest,
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
 * the path can make the bot say things.
 *
 * Two replies mean something more than "send this on". Swipe-reply /approve to
 * a request for the General MT5 EA and it mints that person a code and posts it
 * into their support window; /decline tells them no, with the reason typed
 * after it. Both are addressed the same way as any other answer — by the
 * message they reply to — so there is nothing new to remember.
 */

const API = "https://api.telegram.org";

async function say(chatId: number, text: string, replyTo?: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
    }),
    cache: "no-store",
  }).catch(() => { /* nothing useful to do about it here */ });
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    // 200, not 401: a wrong caller should learn nothing, and Telegram must not
    // start retrying a delivery that was never ours.
    return NextResponse.json({ ok: true });
  }

  const update = (await req.json().catch(() => ({}))) as {
    message?: {
      chat?: { id?: number };
      text?: string;
      message_id?: number;
      reply_to_message?: { message_id?: number };
    };
  };

  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? "").trim();
  if (typeof chatId !== "number") return NextResponse.json({ ok: true });

  // Only the owner's chat is listened to. A stranger who finds the bot is not
  // someone we want putting words in front of our visitors.
  if (String(chatId) !== process.env.TELEGRAM_CHAT_ID) return NextResponse.json({ ok: true });

  const repliedTo = msg?.reply_to_message?.message_id;

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
  // Without a reply the outstanding requests are looked up. One waiting needs
  // no disambiguation and is the ordinary case; with several it asks rather
  // than guessing, because approving the wrong person cannot be taken back.
  const cmd = /^\/(approve|decline)(?:@[A-Za-z0-9_]+)?\b/i.exec(text);
  if (cmd) {
    const isApprove = /^approve$/i.test(cmd[1]);
    let reason = text.slice(cmd[0].length).trim();
    let reqst: EaRequest | null = null;

    if (repliedTo) {
      /* Pointed at something: use exactly that. Falling back to "the newest
         pending one" here would approve a DIFFERENT person from the one whose
         message was replied to. */
      reqst = await requestForTelegramMessage(repliedTo);
    } else {
      const named = reason.match(/^([0-9]{4,12})\b/);
      const waiting = await pendingRequests(20);

      if (named) {
        reqst = waiting.find((w) => w.mt5Login === named[1]) ?? null;
        if (!reqst) {
          await say(chatId, `Nothing is waiting for a decision with ID <code>${named[1]}</code>.`, msg?.message_id);
          return NextResponse.json({ ok: true });
        }
        reason = reason.slice(named[0].length).trim();
      } else if (waiting.length === 1) {
        reqst = waiting[0];
      } else if (waiting.length > 1) {
        await say(
          chatId,
          [
            `${waiting.length} requests are waiting. Say which one:`,
            "",
            ...waiting.slice(0, 8).map((w) => `- <code>${w.mt5Login}</code> \u2014 ${w.name} (${w.email})`),
            "",
            `Send <code>/${isApprove ? "approve" : "decline"} ${waiting[0].mt5Login}</code>, or swipe-reply to the one you mean.`,
          ].join("\n"),
          msg?.message_id,
        );
        return NextResponse.json({ ok: true });
      } else {
        await say(chatId, "Nothing is waiting for a decision right now.", msg?.message_id);
        return NextResponse.json({ ok: true });
      }
    }

    if (!reqst) {
      /* Two very different situations, and telling them apart is the whole
         value of this branch.
    
         If the message IS a support message but has no EA request behind it,
         the request was never recorded — which happens when the ea_requests
         table is missing. Saying "that is not a request" there sends somebody
         hunting for a mistake they did not make, which is exactly what it did.
         The person is still reachable, so that is said too. */
      const who = repliedTo ? await visitorForTelegramMessage(repliedTo) : null;
      await say(
        chatId,
        who
          ? [
              "This request was never recorded, so there is no code to issue against it.",
              "",
              "That means the <code>trading_ea_requests</code> table is missing — apply the migration, then ask them to send the form again.",
              "",
              "They are still reachable: anything you type here WITHOUT a slash goes to them as a normal reply.",
            ].join("\n")
          : "That is not an EA access request, so there is nothing to approve. Swipe-reply to the request itself.",
        msg?.message_id,
      );
      return NextResponse.json({ ok: true });
    }

    if (isApprove) {
      const code = await approveRequest(reqst.id);
      if (!code) {
        await say(chatId, "⚠️ Could not issue a code just now. Nothing was sent — try again in a moment.", msg?.message_id);
        return NextResponse.json({ ok: true });
      }

      const delivered = await recordReply(
        reqst.visitorId,
        [
          `Your ID ${reqst.mt5Login} is confirmed under our community — here is your download code:`,
          "",
          code,
          "",
          "Paste it into step 4 on the bot's page to unlock the download. It works only on this browser.",
        ].join("\n"),
      );

      await say(
        chatId,
        delivered
          ? `✅ Approved. Code <code>${code}</code> sent to ${reqst.name} (${reqst.email}), ID <code>${reqst.mt5Login}</code>.`
          : `⚠️ Code <code>${code}</code> was issued but could not be delivered. Send it to ${reqst.email} yourself.`,
        msg?.message_id,
      );
      return NextResponse.json({ ok: true });
    }

    await declineRequest(reqst.id);

    /* A REPEAT decline is not the first one said again.
     *
     * Somebody who checked their ID, wrote to Deriv and came back to the same
     * three paragraphs cannot tell whether anything happened at all — it reads
     * like an autoreply, and it is the point at which people give up. The count
     * includes the decision just made, so >1 means they have been here before.
     *
     * The first-time version is two messages because it carries two different
     * UUIDs — theirs to check, ours to quote — and in one bubble they read as
     * the same kind of thing, which is how somebody ends up giving Deriv the
     * wrong one. The repeat is a single short message: they already know to
     * check, so it just restates what is still missing and what to send. */
    const times = await declineCount(reqst.visitorId);

    const ASK = "\"Deriv support requires a full referral URL (from domains like track.deriv.com or t.deriv.link) instead of just the partner ID to link my MT5 account. Please provide my correct partner referral link.\"";

    const first = times > 1
      ? await recordReply(
          reqst.visitorId,
          [
            `We checked again and ${reqst.mt5Login} is still not showing under our team.`,
            reason,
            "",
            "Deriv has to add it — we cannot do it from our side. Send them both of these:",
            "",
            `Partner ID: ${PARTNER_ID}`,
            `Referral link: ${DERIV_SIGNUP}`,
            "",
            `They usually ask for the link rather than the ID, so it helps to say: ${ASK}`,
            "",
            "Reply here once they confirm and we will check again.",
          ].filter((line, i) => i !== 1 || line !== "").join("\n"),
        )
      : await recordReply(
          reqst.visitorId,
          [
            `We could not find ID ${reqst.mt5Login} under our community, so we cannot send a code for it yet.`,
            reason,
            "",
            "First, check you sent the right one. Your own client ID is on your Deriv profile — open it, copy the ID shown there, and reply here with it:",
            DERIV_PROFILE,
            "",
            `(It looks like ${EXAMPLE_CLIENT_ID})`,
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
            "If that ID was already the right one, then your account is not under us yet — and only Deriv can move it.",
            "",
            "Ask Deriv support to place your account under this partner ID:",
            PARTNER_ID,
            "",
            "That is OUR partner ID, not yours — give them that one.",
            "",
            `Deriv usually want the referral link rather than the ID, so send them this too: ${DERIV_SIGNUP}`,
            "",
            `If they ask for it, say: ${ASK}`,
            "",
            "Reply here once they confirm and we will check again.",
          ].join("\n"),
        );

    const delivered = first && second;
    await say(
      chatId,
      delivered
        ? `Declined. ${reqst.name} (${reqst.email}) has been told, with the partner ID and referral link.${times > 1 ? ` This is decline #${times} for them — they got the follow-up wording, not the first one again.` : ""}`
        : `Declined, but the message could not be delivered — tell ${reqst.email} yourself.`,
      msg?.message_id,
    );
    return NextResponse.json({ ok: true });
  }

  // ── a reply to a support message: deliver it ──
  if (repliedTo && text && !text.startsWith("/")) {
    const who = await visitorForTelegramMessage(repliedTo);

    if (!who) {
      await say(chatId, "That is not a support message, so there is nobody to send it to. Swipe-reply to the message from the person you want to answer.", msg?.message_id);
      return NextResponse.json({ ok: true });
    }

    const stored = await recordReply(who.visitorId, text);
    await say(
      chatId,
      stored
        ? `✅ Delivered to <code>${who.visitorId}</code>. They will see it in the support window on the site${who.email ? ` — ${who.email}` : ""}.`
        : "⚠️ Could not deliver that just now. Nothing was sent — try again in a moment.",
      msg?.message_id,
    );
    return NextResponse.json({ ok: true });
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
        "<b>MT5 EA requests:</b> send <code>/approve</code> to issue a download code, or <code>/decline your reason</code> to turn it down. Tapping the command in the request works, and so does typing it — no reply needed while only one request is waiting. With several waiting, add the ID: <code>/approve 12345678</code>.",
      ].join("\n"),
    );
  } else if (/^\/(help|status)\b/.test(text)) {
    await say(chatId, "Swipe-reply to a support message to answer it. For an MT5 EA request just send /approve or /decline — tapping the command works too, and you only need to name an ID when several are waiting. An ordinary message with no reply attached has no recipient.");
  } else {
    await say(chatId, "Nothing was sent — I could not tell who that was for. <b>Swipe-reply</b> to someone's support message to answer them.");
  }

  return NextResponse.json({ ok: true });
}
