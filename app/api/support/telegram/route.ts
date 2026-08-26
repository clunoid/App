import { NextRequest, NextResponse } from "next/server";
import { visitorForTelegramMessage, recordReply } from "@/lib/support/threads";

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

  // ── a reply to a support message: deliver it ──
  const repliedTo = msg?.reply_to_message?.message_id;
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
      ].join("\n"),
    );
  } else if (/^\/(help|status)\b/.test(text)) {
    await say(chatId, "Swipe-reply to a support message to answer it. The reply is delivered to that person on the site. A message with no reply attached has no recipient.");
  } else {
    await say(chatId, "Nothing was sent — I could not tell who that was for. <b>Swipe-reply</b> to someone's support message to answer them.");
  }

  return NextResponse.json({ ok: true });
}
