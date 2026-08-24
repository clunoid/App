import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { sendSupportMessage } from "@/lib/support/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SUPPORT — one message from a creator to us.
 *
 * GET tells the widget which email it should put in the box, so most people only
 * have to type the message. POST delivers it.
 *
 * This is a public, unauthenticated endpoint, which means it is a spam target.
 * Two cheap defences: a per-IP cooldown, and a hard cap on length. Both are in
 * memory, so they reset on deploy — enough to stop a script hammering it, not a
 * claim to be more than that.
 */

const COOLDOWN_MS = 20_000;
const MAX_PER_HOUR = 12;
const MAX_MESSAGE = 4000;

type Bucket = { last: number; count: number; windowStart: number };
const seen = new Map<string, Bucket>();

function limited(ip: string): string | null {
  const now = Date.now();
  const b = seen.get(ip) ?? { last: 0, count: 0, windowStart: now };

  if (now - b.windowStart > 3_600_000) { b.count = 0; b.windowStart = now; }
  if (now - b.last < COOLDOWN_MS) return "Give it a moment before sending another.";
  if (b.count >= MAX_PER_HOUR) return "That is a lot of messages. Try again a little later.";

  b.last = now; b.count += 1;
  seen.set(ip, b);

  // The map would otherwise grow for the life of the process.
  if (seen.size > 5000) for (const [k, v] of seen) if (now - v.last > 3_600_000) seen.delete(k);
  return null;
}

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Whatever we already know about who this is, so they need not type it. */
export async function GET() {
  const user = await requireUser().catch(() => null);
  return NextResponse.json({ email: user?.email ?? null });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const stop = limited(ip);
  if (stop) return NextResponse.json({ error: stop }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as {
    email?: string; message?: string; name?: string; country?: string; page?: string;
  };

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 2) return NextResponse.json({ error: "Write your message first." }, { status: 400 });
  if (message.length > MAX_MESSAGE) return NextResponse.json({ error: "That message is too long." }, { status: 400 });

  // Prefer the signed-in address over anything the browser claims: a reply that
  // goes to the wrong inbox is worse than one that goes nowhere.
  const user = await requireUser().catch(() => null);
  const email = (user?.email ?? (typeof body.email === "string" ? body.email.trim() : "")).toLowerCase();
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: "Add the email address we should reply to." }, { status: 400 });
  }

  const sent = await sendSupportMessage({
    email,
    message,
    name: typeof body.name === "string" ? body.name.trim().slice(0, 120) : null,
    country: typeof body.country === "string" ? body.country.trim().slice(0, 80) : null,
    page: typeof body.page === "string" ? body.page.trim().slice(0, 200) : null,
  });

  if (!sent) {
    return NextResponse.json(
      { error: "We could not send that just now. Please try again in a minute." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, email });
}
