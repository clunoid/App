import { NextRequest, NextResponse } from "next/server";
import { postSignal, signalsConfigured, type Signal } from "@/lib/signals/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TRADINGVIEW → TELEGRAM.
 *
 * TradingView fires an alert from its own servers when the ARDE script prints a
 * setup; this receives it and posts it to the signals channel. Nothing has to
 * be running on anybody's machine.
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

const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max).replace(/[\u0000-\u001f\u007f]/g, "") : "";

/**
 * Turn the alert body into a Signal, or explain why it is not one.
 *
 * The geometry check is the one that matters: a "buy" whose stop sits above the
 * entry, or whose target sits below it, is either a bug in the script or
 * somebody probing the endpoint. Either way it must never reach the channel —
 * people copy these.
 */
function parse(raw: unknown): { ok: true; signal: Signal } | { ok: false; why: string } {
  if (!raw || typeof raw !== "object") return { ok: false, why: "body is not an object" };
  const b = raw as Record<string, unknown>;

  if (b.source !== "clunoid-arde") return { ok: false, why: "unknown source" };

  const side = b.side === "buy" || b.side === "sell" ? b.side : null;
  if (!side) return { ok: false, why: "side must be buy or sell" };

  const entry = num(b.entry);
  const stop = num(b.stop);
  const target = num(b.target);
  if (entry === null || stop === null || target === null) return { ok: false, why: "entry, stop and target must be numbers" };
  if (entry <= 0 || stop <= 0 || target <= 0) return { ok: false, why: "prices must be positive" };

  const longOk = side === "buy" && stop < entry && target > entry;
  const shortOk = side === "sell" && stop > entry && target < entry;
  if (!longOk && !shortOk) return { ok: false, why: "stop/target are on the wrong side of entry" };

  const symbol = text(b.symbol, 24).toUpperCase().replace(/[^A-Z0-9._/]/g, "");
  if (symbol.length < 3) return { ok: false, why: "symbol missing" };

  const rr = num(b.rr) ?? Math.abs(target - entry) / Math.abs(entry - stop);
  const confidence = Math.max(0, Math.min(100, Math.round(num(b.confidence) ?? 0)));

  return {
    ok: true,
    signal: {
      symbol,
      timeframe: text(b.timeframe, 8) || "15m",
      side,
      entry,
      stop,
      target,
      rr: Math.round(rr * 100) / 100,
      confidence,
      regime: text(b.regime, 20),
      profile: text(b.profile, 20),
      reason: text(b.reason, 160),
      riskPct: Math.max(0, Math.min(10, num(b.riskPct) ?? 0)),
      adx: Math.max(0, Math.min(100, num(b.adx) ?? 0)),
      chop: Math.max(0, Math.min(100, num(b.chop) ?? 0)),
    },
  };
}

/**
 * The same bar must not post twice.
 *
 * TradingView can retry a webhook, and a retried alert would otherwise appear
 * in the channel as a second, identical setup. In memory, so it resets on
 * deploy — which is the right trade: the worst case is one duplicate after a
 * deploy, versus a dependency for something this small.
 */
const posted = new Map<string, number>();
const DEDUPE_MS = 30 * 60_000;

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
  if (!parsed.ok) {
    console.warn("[tv] rejected payload:", parsed.why);
    return NextResponse.json({ error: parsed.why }, { status: 422 });
  }

  const s = parsed.signal;
  const barKey = `${s.symbol}|${s.side}|${text((raw as Record<string, unknown>).bar, 20)}`;
  if (seenBefore(barKey)) return NextResponse.json({ ok: true, duplicate: true });

  if (!signalsConfigured()) {
    console.error("[tv] signals channel not configured");
    return NextResponse.json({ error: "channel not configured" }, { status: 503 });
  }

  const sent = await postSignal(s);
  if (!sent) return NextResponse.json({ error: "could not post" }, { status: 502 });

  return NextResponse.json({ ok: true });
}

/** A quick way to confirm the URL is reachable without posting anything. */
export function GET() {
  return NextResponse.json({
    ok: true,
    configured: signalsConfigured() && !!process.env.TRADINGVIEW_WEBHOOK_SECRET,
  });
}
