/**
 * Browser-side Web Push helpers for the trading desk. The whole point: once
 * `enablePush` succeeds, the subscription is stored server-side, so alerts keep
 * arriving through refreshes, closed tabs and reboots with zero page code
 * running. `currentPushState` reads the REAL subscription (not a remembered
 * toggle), so the bell reflects truth on every load.
 */
const SW_URL = "/trading-sw.js";
const SW_SCOPE = "/trading";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
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

/** True if this browser currently holds a live push subscription. */
export async function currentPushState(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (!reg) return false;
    return !!(await reg.pushManager.getSubscription());
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

  const cfg = await fetch("/api/trading/push/config", { cache: "no-store" });
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
  const res = await fetch("/api/trading/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) return { ok: false, reason: "Couldn't save the subscription." };
  return { ok: true };
}

/** Unsubscribe this browser and forget it server-side. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await fetch("/api/trading/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
