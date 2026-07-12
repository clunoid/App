"use client";

/**
 * Live TikTok gift feed via Euler Stream's managed WebSocket. The connection lives
 * in the admin's Console browser (open during the stream), authorised by a SHORT-LIVED
 * JWT our server mints from the Euler API key (never exposed to the client). Gift
 * messages are parsed tolerantly (Euler mirrors the TikTok webcast schema, which can
 * shift) and normalised into GiftEvents, then published to the Realtime bus so the
 * OBS Stage plays them.
 *
 * STABILITY: Euler closes the socket with application close codes (4000–4999). We
 * interpret them so the connection stays visibly stable:
 *   4404 NOT_LIVE           → room offline: wait calmly and re-poll on a steady cadence.
 *   4401 INVALID_AUTH       → token expired/invalid: mint a fresh one and reconnect fast.
 *   4429 TOO_MANY_CONNS     → rate-limited: back off longer so old sockets expire.
 *   4555 MAX_LIFETIME_EXCEEDED → the JWT lifetime ended: reconnect SEAMLESSLY (we hold the
 *                             "live" label through a short grace window so the periodic
 *                             token refresh is invisible).
 * We only report "live" once a real message arrives (room info is Euler's first message),
 * never merely on socket-open — so a non-live room can't flap the status.
 */
import type { GiftEvent } from "./types";
import { normalizeGift } from "./gifts";

export type EulerStatus = "idle" | "connecting" | "live" | "error" | "unconfigured";

// (the no-explicit-any rule isn't enabled in this repo — `any` is fine here for the
// deliberately tolerant parsing of an external, shifting message schema)
function pick(obj: any, ...paths: string[]): any {
  for (const p of paths) {
    let v: any = obj;
    for (const seg of p.split(".")) { v = v?.[seg]; if (v == null) break; }
    if (v != null) return v;
  }
  return undefined;
}

export function createEulerFeed(onGift: (ev: GiftEvent) => void, onStatus: (s: EulerStatus, msg?: string) => void) {
  let ws: WebSocket | null = null;
  let room = "";
  let stopped = true;
  let retry = 0;
  let live = false; // true only once a real message has arrived (not just socket-open)
  let timer: ReturnType<typeof setTimeout> | null = null;
  let grace: ReturnType<typeof setTimeout> | null = null;

  async function token(uniqueId: string): Promise<{ token?: string; status: number; error?: string }> {
    try {
      const res = await fetch("/api/showtime/euler-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: uniqueId }) });
      const d = await res.json().catch(() => ({}));
      return { token: d.token, status: res.status, error: d.error };
    } catch {
      return { status: 0, error: "network" };
    }
  }

  function clearTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (grace) { clearTimeout(grace); grace = null; }
  }

  function reconnectIn(ms: number) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(connect, ms);
  }

  // On a drop while live, keep the "live" label for a short grace window so a seamless
  // token-refresh reconnect never flickers the UI. Only downgrade if we don't recover.
  function holdLiveThenDowngrade() {
    if (!live) { onStatus("connecting", "Reconnecting…"); return; }
    if (grace) clearTimeout(grace);
    grace = setTimeout(() => { live = false; onStatus("connecting", "Reconnecting…"); }, 6000);
  }

  function markConnected() {
    if (grace) { clearTimeout(grace); grace = null; }
    if (!live) { live = true; retry = 0; onStatus("live"); }
  }

  async function connect() {
    if (stopped) return;
    // never keep two sockets — close any prior one first
    try { ws?.close(); } catch { /* ignore */ }
    ws = null;

    const t = await token(room);
    if (stopped) return;
    if (t.status === 501 || t.error === "unconfigured") { onStatus("unconfigured", "Add EULER_API_KEY + EULER_ACCOUNT_ID to go live."); return; }
    if (!t.token) { retry = Math.min(retry + 1, 6); reconnectIn(Math.round(600 * Math.pow(1.6, retry))); return; }

    let sock: WebSocket;
    try {
      sock = new WebSocket(`wss://ws.eulerstream.com?uniqueId=${encodeURIComponent(room)}&jwtKey=${encodeURIComponent(t.token)}`);
    } catch { reconnectIn(1500); return; }
    ws = sock;

    // socket-open only means Euler accepted us; the room may still not be live, so we
    // stay "connecting" until an actual message proves the feed is flowing.
    sock.onopen = () => { if (!live) onStatus("connecting", `Connected — waiting for @${room}'s live…`); };
    sock.onmessage = (e) => { markConnected(); handle(e.data); };
    sock.onclose = (ev) => {
      if (ws === sock) ws = null;
      if (stopped) return;
      const code = ev?.code ?? 0;

      if (code === 4404) {
        // streamer offline — calm, steady re-poll; never flap
        live = false; retry = 0;
        onStatus("connecting", `Waiting for @${room} to go live — connects automatically the moment your live starts.`);
        reconnectIn(8000);
        return;
      }
      if (code === 4429) {
        // rate-limited — let old sockets expire before retrying
        holdLiveThenDowngrade();
        retry = Math.min(retry + 1, 6);
        reconnectIn(12000);
        return;
      }
      if (code === 4555 || code === 4401) {
        // expected: JWT lifetime ended / token refresh — reconnect fast & seamlessly
        holdLiveThenDowngrade();
        reconnectIn(500);
        return;
      }
      // anything else (network blip, 1006, …) — gentle backoff
      holdLiveThenDowngrade();
      retry = Math.min(retry + 1, 6);
      reconnectIn(Math.round(600 * Math.pow(1.6, retry)));
    };
    sock.onerror = () => { /* onclose handles the retry */ };
  }

  function handle(raw: any) {
    let msg: any;
    try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
    const type = String(pick(msg, "type", "event", "method", "eventType") ?? "").toLowerCase();
    const d = msg.data ?? msg;
    const isGift = type.includes("gift") || d?.giftName != null || d?.gift != null || d?.diamondCount != null;
    if (!isGift) return;
    // combo streaks stream repeatedly; only fire once, at the end, with the full count
    const repeatEnd = pick(d, "repeatEnd") ?? pick(msg, "repeatEnd");
    if (repeatEnd === false) return;
    const name = String(pick(d, "giftName", "gift.name", "giftDetails.giftName", "gift.giftName") ?? "Gift");
    const coins = Number(pick(d, "diamondCount", "gift.diamond_count", "gift.diamondCount", "coins") ?? 0) || 0;
    const count = Number(pick(d, "repeatCount", "comboCount", "count") ?? 1) || 1;
    const sender = String(pick(d, "user.uniqueId", "user.unique_id", "user.nickname", "uniqueId", "nickname") ?? "guest");
    onGift(normalizeGift(name, coins, sender, count));
  }

  return {
    start(uniqueId: string) {
      stopped = false; retry = 0; live = false;
      clearTimers();
      room = uniqueId.replace(/^@/, "").trim().toLowerCase();
      if (!room) { onStatus("error", "enter a @username"); return; }
      onStatus("connecting", `Connecting to @${room}…`);
      connect();
    },
    stop() {
      stopped = true; live = false;
      clearTimers();
      try { ws?.close(); } catch { /* ignore */ }
      ws = null;
      onStatus("idle");
    },
  };
}
