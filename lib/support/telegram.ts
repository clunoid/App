/**
 * SUPPORT — getting a message to a human.
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

/** Telegram's own ceilings. Worth respecting rather than discovering. */
const CAPTION_LIMIT = 1024;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Configured or not — used to fail loudly in logs, quietly on screen. */
export function supportConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Telegram's HTML parse mode is strict: these three characters must be escaped. */
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type SupportMessage = {
  email: string;
  message: string;
  name?: string | null;
  country?: string | null;
  /** Which page they were on — the difference between guessing and knowing. */
  page?: string | null;
  /** Which part of the product: Home, Creator Program, Exness, and so on. */
  source?: string | null;
  /** Same browser across every page, so a follow-up is not a new stranger. */
  visitorId?: string | null;
  /** A screenshot, when they attached one. */
  photo?: { data: ArrayBuffer; filename: string; type: string } | null;
};

async function call(method: string, body: BodyInit, headers?: HeadersInit): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, { method: "POST", body, headers, cache: "no-store" });
    if (!res.ok) {
      // The body carries Telegram's own reason — worth having in the logs when
      // the chat id is wrong or the bot was never started.
      console.error(`[support] telegram refused ${method}:`, res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[support] telegram unreachable (${method}):`, e);
    return false;
  }
}

/**
 * Send one message, and the screenshot after it when there is one.
 *
 * Returns false rather than throwing: a support form is the last thing that
 * should show a stack trace. The text is what matters, so it goes first and its
 * result is what decides success — a screenshot that fails to upload must not
 * make the creator think their words were lost.
 */
export async function sendSupportMessage(m: SupportMessage): Promise<boolean> {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chat) {
    console.error("[support] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set");
    return false;
  }

  // Built so the reply address is the first thing readable on a phone screen,
  // and tappable — Telegram linkifies a mailto.
  const lines = [
    `<b>${esc(m.source || "Support")}</b>`,
    "",
    `<b>Reply to:</b> <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>`,
    m.name ? `<b>Name:</b> ${esc(m.name)}` : "",
    m.country ? `<b>Country:</b> ${esc(m.country)}` : "",
    m.page ? `<b>Page:</b> ${esc(m.page)}` : "",
    m.visitorId ? `<b>Person:</b> <code>${esc(m.visitorId)}</code>` : "",
    "",
    esc(m.message),
  ].filter(Boolean);

  const sent = await call(
    "sendMessage",
    JSON.stringify({ chat_id: chat, text: lines.join("\n"), parse_mode: "HTML", disable_web_page_preview: true }),
    { "Content-Type": "application/json" },
  );
  if (!sent) return false;

  if (m.photo) {
    const form = new FormData();
    form.append("chat_id", chat);
    // Short on purpose: the detail is in the message directly above it, and a
    // caption over Telegram's limit is rejected outright.
    form.append("caption", `Screenshot from ${m.email}`.slice(0, CAPTION_LIMIT));
    form.append("photo", new Blob([m.photo.data], { type: m.photo.type }), m.photo.filename);
    // Its own failure is logged but not fatal — the words already arrived.
    await call("sendPhoto", form);
  }

  return true;
}
