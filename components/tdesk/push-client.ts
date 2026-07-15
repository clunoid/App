/**
 * Browser-side Web Push helpers for the trading desk. The whole point: once
 * `enablePush` succeeds, the subscription is stored server-side, so alerts keep
 * arriving through refreshes, closed tabs and reboots with zero page code
 * running. `ensurePush` reflects AND self-heals the real subscription on every
 * load, so the bell can never read OFF while the user has alerts enabled.
 */
const SW_URL = "/trading-sw.js";
const SW_SCOPE = "/trading";
// Local record of the user's INTENT (survives tab close). Distinguishes "the
// browser transiently dropped the subscription" (→ recreate it) from "the user
// turned alerts off" (→ leave them off). Never a security boundary — the server
// subscription is the real state; this only decides whether to auto-heal.
const INTENT_KEY = "clunoid_trading_alerts";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function setIntent(on: boolean): void {
  try {
    if (on) localStorage.setItem(INTENT_KEY, "1");
    else localStorage.removeItem(INTENT_KEY);
  } catch {
    /* private mode — degrade to session-only, harmless */
  }
}
function wantsAlerts(): boolean {
  try {
    return localStorage.getItem(INTENT_KEY) === "1";
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
}

/**
 * Reflect + self-heal the subscription on mount. Returns whether alerts are on.
 * Two failure modes this fixes vs a naive getSubscription() read:
 *  1. COLD-START RACE: right after a tab reopen, getRegistration() can resolve
 *     before the SW re-attaches → it reported "no subscription" and flipped the
 *     bell OFF until a manual refresh. Awaiting `ready` (bounded) removes that.
 *  2. DROPPED SUBSCRIPTION: browsers can occasionally drop a push subscription.
 *     If the user's INTENT is on and permission is still granted, we silently
 *     recreate it (no confirmation push) so alerts never quietly die.
 * Respects an explicit OFF: intent cleared → we never auto-resubscribe.
 */
export async function ensurePush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 2500))]);
    let reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (!reg) reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
    const existing = await reg.pushManager.getSubscription();
    if (existing) return true; // already subscribed — the common reopen path
    if (!wantsAlerts()) return false; // user turned it off — stay off
    // intent is on but the subscription vanished → recreate silently
    const cfg = await fetch("/api/tdesk/push/config", { cache: "no-store" });
    if (!cfg.ok) return false;
    const { vapidPublicKey } = (await cfg.json()) as { vapidPublicKey: string };
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
    await fetch("/api/tdesk/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), silent: true }) });
    return true;
  } catch {
    return false;
  }
}

/** Register SW, get permission, subscribe, and persist server-side (which also
 *  fires a confirmation push). Returns true on success. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "This browser doesn't support push notifications." };
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Notification permission was denied." };

  const cfg = await fetch("/api/tdesk/push/config", { cache: "no-store" });
  if (!cfg.ok) return { ok: false, reason: "Push isn't configured on the server." };
  const { vapidPublicKey } = (await cfg.json()) as { vapidPublicKey: string };

  const reg = await getRegistration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }
  const res = await fetch("/api/tdesk/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) return { ok: false, reason: "Couldn't save the subscription." };
  setIntent(true); // remember the user wants alerts, so mount can self-heal
  return { ok: true };
}

/** Unsubscribe this browser and forget it server-side. */
export async function disablePush(): Promise<void> {
  setIntent(false); // explicit OFF — mount must NOT auto-resubscribe
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await fetch("/api/tdesk/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
