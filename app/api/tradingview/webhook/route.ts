import { NextRequest, NextResponse } from "next/server";
import {
  postSetup,
  postFollowup,
  signalsConfigured,
  type Setup,
  type Followup,
  type Side,
} from "@/lib/signals/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TRADINGVIEW → TELEGRAM.
 *
 * TradingView fires an alert from its own servers when the script prints a
 * setup, reaches its first target, or closes; this receives it and posts to the
 * signals channel. Nothing has to be running on anybody's machine.
 *
 * WHY THE SECRET IS IN THE URL
 * ────────────────────────────
 * TradingView cannot send custom headers with a webhook — the alert gives you a
 * URL and a message body, and that is all. So the shared secret travels as a
 * query parameter, and the alert URL must therefore be treated as a credential:
 * anyone holding it can post to the channel. It is never rendered on the site,
 * never committed, and lives only in the alert's own configuration.
 *
 * The body could equally carry the secret, but the message body of an alert is
 * visible to anyone the chart is shared with, whereas the URL is not.
 *
 * Everything arriving here is UNTRUSTED. A webhook endpoint is a public URL and
 * the payload is attacker-controlled input: every field is parsed, range-checked
 * and re-serialised, and nothing from the request is ever echoed back or
 * executed. A payload that fails any check is dropped rather than forwarded.
 */

const MAX_BODY = 4096;

/** Timing-safe enough for a short shared secret, and it avoids a length leak. */
function secretMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const PRINTABLE = (c: string): boolean => {
  const n = c.codePointAt(0) ?? 0;
  return n >= 32 && n !== 127;
};

const text = (v: unknown, max: number): string =>
  typeof v === "string" ? Array.from(v.slice(0, max)).filter(PRINTABLE).join("") : "";

const symbolOf = (v: unknown): string =>
  text(v, 24).toUpperCase().replace(/[^A-Z0-9._/]/g, "");

type Parsed =
  | { kind: "setup"; setup: Setup }
  | { kind: "followup"; followup: Followup }
  | { kind: "bad"; why: string };

/**
 * Turn the alert body into something postable, or explain why it is not.
 *
 * The geometry check is the one that matters: a "buy" whose stop sits above the
 * entry, or whose targets sit below it, is either a bug in the script or
 * somebody probing the endpoint. Either way it must never reach the channel —
 * people copy these with real money. TP2 must also be beyond TP1, because a
 * second target nearer than the first is not a plan, it is a typo.
 */
function parse(raw: unknown): Parsed {
  if (!raw || typeof raw !== "object") return { kind: "bad", why: "body is not an object" };
  const b = raw as Record<string, unknown>;

  if (b.source !== "clunoid-smc") return { kind: "bad", why: "unknown source" };

  const side: Side | null = b.side === "buy" || b.side === "sell" ? b.side : null;
  if (!side) return { kind: "bad", why: "side must be buy or sell" };

  const symbol = symbolOf(b.symbol);
  if (symbol.length < 3) return { kind: "bad", why: "symbol missing" };

  const ticket = text(b.ticket, 48) || `${symbol}-${text(b.bar, 20)}`;

  // A deliberate test post. It is banner-marked at both ends of the message,
  // because this channel is read by people who copy what appears in it with
  // real money and a test that merely looks odd is not safe.
  const test = b.test === true;
  const digits = Math.max(0, Math.min(10, Math.round(num(b.digits) ?? 5)));
  const event = b.event === "entry" || b.event === "tp1" || b.event === "closed" ? b.event : null;
  if (!event) return { kind: "bad", why: "event must be entry, tp1 or closed" };

  if (event !== "entry") {
    const entry = num(b.entry);
    const price = num(b.price);
    const r = num(b.r);
    if (entry === null || price === null || r === null) {
      return { kind: "bad", why: "entry, price and r must be numbers" };
    }
    if (entry <= 0 || price <= 0) return { kind: "bad", why: "prices must be positive" };
    if (Math.abs(r) > 100) return { kind: "bad", why: "r is out of range" };

    return {
      kind: "followup",
      followup: {
        ticket,
        symbol,
        side,
        event,
        entry,
        price,
        r: Math.round(r * 100) / 100,
        why: text(b.why, 40),
        digits,
        test,
      },
    };
  }

  const entry = num(b.entry);
  const stop = num(b.stop);
  const tp1 = num(b.tp1);
  const tp2 = num(b.tp2);
  if (entry === null || stop === null || tp1 === null || tp2 === null) {
    return { kind: "bad", why: "entry, stop, tp1 and tp2 must be numbers" };
  }
  if (entry <= 0 || stop <= 0 || tp1 <= 0 || tp2 <= 0) {
    return { kind: "bad", why: "prices must be positive" };
  }

  const longOk = side === "buy" && stop < entry && tp1 > entry && tp2 >= tp1;
  const shortOk = side === "sell" && stop > entry && tp1 < entry && tp2 <= tp1;
  if (!longOk && !shortOk) {
    return { kind: "bad", why: "stop and targets are on the wrong side of entry" };
  }

  const risk = Math.abs(entry - stop);
  if (risk <= 0) return { kind: "bad", why: "stop is at the entry" };

  return {
    kind: "setup",
    setup: {
      ticket,
      symbol,
      timeframe: text(b.timeframe, 8) || "15",
      side,
      entry,
      stop,
      tp1,
      tp2,
      rr1: Math.round((num(b.rr1) ?? Math.abs(tp1 - entry) / risk) * 100) / 100,
      rr2: Math.round((num(b.rr2) ?? Math.abs(tp2 - entry) / risk) * 100) / 100,
      trendScore: Math.max(-5, Math.min(5, Math.round(num(b.trendScore) ?? 0))),
      digits,
      test,
    },
  };
}

/**
 * The same event must not post twice.
 *
 * TradingView can retry a webhook, and a retried alert would otherwise appear
 * in the channel as a second, identical setup. In memory, so it resets on
 * deploy — which is the right trade: the worst case is one duplicate after a
 * deploy, versus a dependency for something this small.
 */
const posted = new Map<string, number>();
const DEDUPE_MS = 6 * 60 * 60_000;

function seenBefore(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of posted) if (now - t > DEDUPE_MS) posted.delete(k);
  if (posted.has(key)) return true;
  posted.set(key, now);
  return false;
}

export async function POST(req: NextRequest) {
  const expected = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[tv] TRADINGVIEW_WEBHOOK_SECRET is not set — refusing every webhook");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  if (!secretMatches(req.nextUrl.searchParams.get("secret"), expected)) {
    // Deliberately vague: a probe learns nothing about why it failed.
    return NextResponse.json({ error: "no" }, { status: 401 });
  }

  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "not json" }, { status: 400 });
  }

  const parsed = parse(raw);
  if (parsed.kind === "bad") {
    console.warn("[tv] rejected payload:", parsed.why);
    return NextResponse.json({ error: parsed.why }, { status: 422 });
  }

  if (!signalsConfigured()) {
    console.error("[tv] signals channel not configured");
    return NextResponse.json({ error: "channel not configured" }, { status: 503 });
  }

  // Keyed on the ticket and the event, so an entry, its TP1 and its close are
  // three separate messages while a retry of any of them is one.
  const key =
    parsed.kind === "setup"
      ? `${parsed.setup.ticket}|entry${parsed.setup.test ? "|test" : ""}`
      : `${parsed.followup.ticket}|${parsed.followup.event}${parsed.followup.test ? "|test" : ""}`;
  if (seenBefore(key)) return NextResponse.json({ ok: true, duplicate: true });

  const sent =
    parsed.kind === "setup" ? await postSetup(parsed.setup) : await postFollowup(parsed.followup);

  if (!sent) {
    // Let a retry through: the send failed, so nothing reached the channel.
    posted.delete(key);
    return NextResponse.json({ error: "could not post" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

/** A quick way to confirm the URL is reachable without posting anything. */
export function GET() {
  return NextResponse.json({
    ok: true,
    configured: signalsConfigured() && !!process.env.TRADINGVIEW_WEBHOOK_SECRET,
  });
}
