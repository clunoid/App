/**
 * Web Push delivery — SERVER ONLY. This is what makes the desk's alerts truly
 * autonomous: notifications are sent from the scheduled scanner (server-side),
 * so they reach every opted-in browser even when no tab is open, the page was
 * refreshed, or the machine just woke — the subscription lives in the database,
 * not in page memory. Uses the VAPID keypair (private key never leaves the
 * server). A subscription the push service reports as gone (404/410) is pruned.
 *
 * Never import this into client code — it needs the VAPID private key.
 */
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveSignal } from "./types";
import { fmtPrice } from "./types";
import { signalHeadline } from "./engine";

let configured = false;
function ensureConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:clunoid@gmail.com";
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  }
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

/** The notification payload for a live signal (what the service worker renders). */
export function signalPayload(s: LiveSignal): PushPayload {
  return {
    title: `FX signal · ${s.pair} ${s.direction.toUpperCase()} · ${s.confidence}%`,
    body: `${s.strategy} · entry ${fmtPrice(s.pair, s.entry)} · SL ${fmtPrice(s.pair, s.stop)} · ${s.rr}R\n${signalHeadline(s)}`,
    tag: s.id || `${s.pair}-${s.strategy}-${s.barTime}`,
    url: "/trading",
  };
}

type SubRow = { endpoint: string; subscription: unknown };

// Every outbound call in the desk is bounded (data fetch 15s, AI 25s); push is
// too, so one hung push endpoint can never eat the scan's time budget.
const PUSH_TIMEOUT_MS = 8000;

/** Deliver to one subscription. Never throws; returns "ok" | "dead" | "error". */
async function deliver(sub: webpush.PushSubscription, body: string): Promise<"ok" | "dead" | "error"> {
  try {
    await webpush.sendNotification(sub, body, { TTL: 3600, timeout: PUSH_TIMEOUT_MS });
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode;
    return status === 404 || status === 410 ? "dead" : "error";
  }
}

/**
 * Send one payload to every stored subscription. Best-effort and self-cleaning:
 * per-subscription failures never throw to the caller, and subscriptions the
 * push service has expired are deleted so the table stays live. Returns how many
 * deliveries succeeded.
 */
export async function sendPushToAll(db: SupabaseClient, payload: PushPayload): Promise<{ sent: number; pruned: number; errors: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0, errors: 0 };
  const { data } = await db.from("trading_push_subs").select("endpoint,subscription");
  const subs = (data ?? []) as SubRow[];
  if (!subs.length) return { sent: 0, pruned: 0, errors: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let errors = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (row) => {
      const r = await deliver(row.subscription as webpush.PushSubscription, body);
      if (r === "ok") sent++;
      else if (r === "dead") dead.push(row.endpoint);
      else errors++;
    })
  );
  if (dead.length) await db.from("trading_push_subs").delete().in("endpoint", dead);
  if (sent) await db.from("trading_push_subs").update({ last_ok_at: new Date().toISOString() }).in("endpoint", subs.filter((s) => !dead.includes(s.endpoint)).map((s) => s.endpoint));
  return { sent, pruned: dead.length, errors };
}

/** Send one payload to ONE subscription — used for the opt-in confirmation so it
 *  lands on the enabling device only, never fanning out to other devices. */
export async function sendPushToOne(sub: webpush.PushSubscription, payload: PushPayload): Promise<boolean> {
  if (!ensureConfigured()) return false;
  return (await deliver(sub, JSON.stringify(payload))) === "ok";
}
