"use client";

/**
 * SUPPORT — knowing it is the same person.
 *
 * The bubble now sits on Home, the bots, Exness, TradingView and the Creator
 * Program. Somebody who asks a question on one of those and follows it up on
 * another is one conversation, and answering them well means seeing it that
 * way rather than as two strangers who happen to share an inbox.
 *
 * So three things live in localStorage, shared by every page: their name, their
 * email, and an id minted once on this browser. Fill it in anywhere and it is
 * filled in everywhere. The id is a random string and nothing else — it is a
 * thread key, not a tracker, and it never leaves the support form.
 *
 * A registered creator overrides all of it: their real record beats a cache.
 */

const NAME_KEY = "cln_support_name";
const EMAIL_KEY = "cln_support_email";
const ID_KEY = "cln_support_id";

export type Identity = { name: string; email: string; visitorId: string };

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

function read(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: this visit only */ }
}

/** Short and readable, because it gets printed in a chat message we read. */
function mintId(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function loadIdentity(): Identity {
  if (typeof window === "undefined") return { name: "", email: "", visitorId: "" };

  let id = read(ID_KEY);
  if (!/^[0-9A-F]{8}$/.test(id)) { id = mintId(); write(ID_KEY, id); }

  const email = read(EMAIL_KEY);
  return { name: read(NAME_KEY), email: isEmail(email) ? email : "", visitorId: id };
}

export function saveIdentity(patch: { name?: string; email?: string }) {
  if (typeof window === "undefined") return;
  if (patch.name !== undefined) write(NAME_KEY, patch.name.trim().slice(0, 120));
  if (patch.email !== undefined && isEmail(patch.email)) write(EMAIL_KEY, patch.email.trim());
}

/**
 * Where the bubble was opened from. Sent with every message so an answer can
 * start from what they were looking at instead of asking.
 */
export type SupportSource =
  | "Home"
  | "Creator Program"
  | "Deriv bots"
  | "Practice bots"
  | "MT5 bots"
  | "Exness"
  | "TradingView";

/**
 * Anything under about this length that is only a greeting is not a question
 * yet. Answering "hi" with "hi" wastes a round trip each way, so the bubble
 * asks for the actual problem first — once. If they send it again anyway it
 * goes through, because deciding for somebody that they have nothing to say is
 * worse than reading one short message.
 */
const GREETING = /^(hi|hey+|hello+|yo|sup|hola|niaje|mambo|habari|salut|good\s*(morning|afternoon|evening|day)|how\s*are\s*(you|u)|what'?s\s*up|wassup|help|hi\s*there|anyone|hello\s*there)$/i;

export function isJustAGreeting(text: string): boolean {
  const t = text.trim().replace(/[!.?,\s]+$/g, "");
  if (t.length > 40) return false;
  // A question mark or a digit means they are asking something, however short.
  if (/[?0-9]/.test(t)) return false;
  return GREETING.test(t) || t.split(/\s+/).length < 2;
}
