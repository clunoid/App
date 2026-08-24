/**
 * SUPPORT — getting a creator's message to a human.
 *
 * Email needs an inbox somebody remembers to open. A phone does not: the message
 * arrives where it will actually be seen, and the reply goes back by email from
 * the address the creator already knows. Which pipe carries it is our business,
 * not theirs — nothing user-facing ever names it.
 *
 * Both values are server-only, and neither is prefixed NEXT_PUBLIC. A bot token
 * in the browser bundle is a bot anyone can send from.
 */

const API = "https://api.telegram.org";

/** Configured or not — used to fail loudly in logs, quietly on screen. */
export function supportConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Telegram's HTML parse mode is strict: these five characters must be escaped. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type SupportMessage = {
  email: string;
  message: string;
  name?: string | null;
  country?: string | null;
  /** Which page they were on — the difference between guessing and knowing. */
  page?: string | null;
};

/**
 * Send one message. Returns false rather than throwing: a support form is the
 * last thing that should show a stack trace.
 */
export async function sendSupportMessage(m: SupportMessage): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.error("[support] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set");
    return false;
  }

  // Built so the reply address is the first thing readable on a phone screen,
  // and tappable — Telegram linkifies a mailto.
  const lines = [
    "<b>Creator support</b>",
    "",
    `<b>Reply to:</b> <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>`,
    m.name ? `<b>Name:</b> ${esc(m.name)}` : "",
    m.country ? `<b>Country:</b> ${esc(m.country)}` : "",
    m.page ? `<b>Page:</b> ${esc(m.page)}` : "",
    "",
    esc(m.message),
  ].filter(Boolean);

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      // The body carries Telegram's own reason — worth having in the logs when
      // the chat id is wrong or the bot was never started.
      console.error("[support] telegram refused:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[support] telegram unreachable:", e);
    return false;
  }
}
