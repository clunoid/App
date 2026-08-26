import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { sendSupportMessage, MAX_UPLOAD_BYTES, ALLOWED_TYPES } from "@/lib/support/telegram";
import { recordInbound, historyFor } from "@/lib/support/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SUPPORT — one message from anywhere in the product.
 *
 * GET tells the widget which email it should put in the box, so people who are
 * signed in only have to type the message. POST delivers it, as JSON or as a
 * multipart form when a screenshot is attached.
 *
 * This is a public, unauthenticated endpoint, which means it is a spam target.
 * Two cheap defences: a per-IP cooldown, and hard caps on length and file size.
 * Both counters are in memory, so they reset on deploy — enough to stop a
 * script hammering it, not a claim to be more than that.
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
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Whatever we already know about who this is, so they need not type it. */
export async function GET() {
  const user = await requireUser().catch(() => null);
  return NextResponse.json({ email: user?.email ?? null });
}

type Parsed = {
  email: string; message: string; name: string; country: string;
  page: string; source: string; visitorId: string;
  photo: { data: ArrayBuffer; filename: string; type: string } | null;
  error?: string;
};

async function parse(req: NextRequest): Promise<Parsed> {
  const empty: Parsed = { email: "", message: "", name: "", country: "", page: "", source: "", visitorId: "", photo: null };

  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return { ...empty, error: "We could not read that. Try again." };

    const out: Parsed = {
      ...empty,
      email: str(form.get("email"), 200),
      message: str(form.get("message"), MAX_MESSAGE + 1),
      name: str(form.get("name"), 120),
      country: str(form.get("country"), 80),
      page: str(form.get("page"), 200),
      source: str(form.get("source"), 60),
      visitorId: str(form.get("visitorId"), 16),
    };

    const file = form.get("file");
    if (file && typeof file !== "string") {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return { ...out, error: "Attach a screenshot as a PNG, JPG, WEBP or GIF." };
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return { ...out, error: "That image is too large — keep it under 8MB." };
      }
      out.photo = {
        data: await file.arrayBuffer(),
        filename: (file.name || "screenshot.png").slice(0, 100),
        type: file.type,
      };
    }
    return out;
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    ...empty,
    email: str(body.email, 200),
    message: str(body.message, MAX_MESSAGE + 1),
    name: str(body.name, 120),
    country: str(body.country, 80),
    page: str(body.page, 200),
    source: str(body.source, 60),
    visitorId: str(body.visitorId, 16),
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const stop = limited(ip);
  if (stop) return NextResponse.json({ error: stop }, { status: 429 });

  const p = await parse(req);
  if (p.error) return NextResponse.json({ error: p.error }, { status: 400 });

  // A screenshot on its own is a legitimate message — "look at this" is the
  // whole point of attaching one.
  if (p.message.length < 2 && !p.photo) return NextResponse.json({ error: "Write your message first." }, { status: 400 });
  if (p.message.length > MAX_MESSAGE) return NextResponse.json({ error: "That message is too long." }, { status: 400 });

  // Prefer the signed-in address over anything the browser claims: a reply that
  // goes to the wrong inbox is worse than one that goes nowhere.
  const user = await requireUser().catch(() => null);
  const email = (user?.email ?? p.email).toLowerCase();
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: "Add the email address we should reply to." }, { status: 400 });
  }

  // What we have already said to this person. Fetched BEFORE the new message is
  // recorded, so it is the conversation up to now and never includes itself.
  // A failure here costs context, not delivery — the message still goes.
  const history = await historyFor(p.visitorId);

  const sent = await sendSupportMessage({
    email,
    message: p.message || "(screenshot only)",
    name: p.name || null,
    country: p.country || null,
    page: p.page || null,
    source: p.source || null,
    visitorId: p.visitorId || null,
    photo: p.photo,
    history,
  });

  if (sent === null) {
    return NextResponse.json(
      { error: "We could not send that just now. Please try again in a minute." },
      { status: 502 },
    );
  }

  // Remember which Telegram message this became, so a swipe-reply to it can be
  // routed back to this person. Deliberately awaited but never fatal: the
  // message has already arrived, and failing the request now would tell them it
  // did not. The cost of a failure here is that one answer has to go by email.
  await recordInbound({
    visitorId: p.visitorId,
    body: p.message || "(screenshot only)",
    tgMessageId: sent,
    email,
    name: p.name || null,
    source: p.source || null,
    page: p.page || null,
  });

  return NextResponse.json({ ok: true, email });
}
