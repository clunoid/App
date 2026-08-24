import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SUPPORT — the bot answering when you talk to it.
 *
 * The support bot only ever needed to send. But a bot that sits silent when you
 * press Start looks broken, and there is no way to tell "outbound only" from
 * "misconfigured" by looking at it. So it answers: Start gets a confirmation
 * that the wiring is live, anything else gets a reminder that replies to
 * creators go by email, not from here.
 *
 * Telegram will POST to this from the open internet, so the shared secret it
 * was registered with is checked on every call. Without that anyone who guesses
 * the path can make the bot say things.
 */

const API = "https://api.telegram.org";

async function say(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
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
    message?: { chat?: { id?: number }; text?: string };
  };

  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  if (typeof chatId !== "number") return NextResponse.json({ ok: true });

  // Only the owner's chat gets a reply. A stranger who finds the bot is not
  // someone we want to hand a conversation to.
  if (String(chatId) !== process.env.TELEGRAM_CHAT_ID) return NextResponse.json({ ok: true });

  if (/^\/start\b/.test(text)) {
    await say(
      chatId,
      [
        "<b>Clunoid support is connected.</b>",
        "",
        "Messages from the support bubble on clunoid.com/trading/creators will arrive here.",
        "",
        "Each one starts with the creator's email — reply to them from your email, not from this chat. Nothing you type here reaches anyone.",
      ].join("\n"),
    );
  } else if (/^\/(help|status)\b/.test(text)) {
    await say(chatId, "This bot only delivers creator support messages. Reply to creators by email, using the address at the top of each message.");
  } else {
    await say(chatId, "Nothing you send here goes anywhere — reply to the creator by email instead, using the address at the top of their message.");
  }

  return NextResponse.json({ ok: true });
}
