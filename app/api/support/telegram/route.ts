import { NextRequest, NextResponse } from "next/server";
import { visitorForTelegramMessage, recordReply } from "@/lib/support/threads";
import {
  requestForTelegramMessage, approveRequest, declineRequest, PARTNER_ID,
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
  if (repliedTo && /^\/(approve|decline)\b/i.test(text)) {
    const isApprove = /^\/approve\b/i.test(text);
    const reason = text.replace(/^\/(approve|decline)\b/i, "").trim();
    const reqst = await requestForTelegramMessage(repliedTo);

    if (!reqst) {
      await say(chatId, "That is not an EA access request, so there is nothing to approve. Swipe-reply to the request itself.", msg?.message_id);
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
          `Your MT5 login ${reqst.mt5Login} is confirmed under our community — here is your download code:`,
          "",
          code,
          "",
          "Paste it into step 4 on the bot's page to unlock the download. It works only on this browser.",
        ].join("\n"),
      );

      await say(
        chatId,
        delivered
          ? `✅ Approved. Code <code>${code}</code> sent to ${reqst.name} (${reqst.email}), login <code>${reqst.mt5Login}</code>.`
          : `⚠️ Code <code>${code}</code> was issued but could not be delivered. Send it to ${reqst.email} yourself.`,
        msg?.message_id,
      );
      return NextResponse.json({ ok: true });
    }

    await declineRequest(reqst.id);
    const delivered = await recordReply(
      reqst.visitorId,
      [
        `We could not find MT5 login ${reqst.mt5Login} under our community, so we cannot send a code for it yet.`,
        reason ? "" : "",
        reason,
        "",
        `If you believe this is wrong, ask Deriv support to move your account under partner ${PARTNER_ID}, then reply here and we will check again.`,
      ].filter(Boolean).join("\n"),
    );
    await say(
      chatId,
      delivered
        ? `Declined. ${reqst.name} (${reqst.email}) has been told, with the Deriv instruction.`
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
        "<b>MT5 EA requests:</b> swipe-reply <code>/approve</code> to send that person a download code, or <code>/decline your reason</code> to turn it down.",
      ].join("\n"),
    );
  } else if (/^\/(help|status)\b/.test(text)) {
    await say(chatId, "Swipe-reply to a support message to answer it. On an MT5 EA request, swipe-reply /approve to issue a code or /decline with a reason. A message with no reply attached has no recipient.");
  } else {
    await say(chatId, "Nothing was sent — I could not tell who that was for. <b>Swipe-reply</b> to someone's support message to answer them.");
  }

  return NextResponse.json({ ok: true });
}
