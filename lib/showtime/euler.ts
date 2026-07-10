"use client";

/**
 * Euler feed v2 — live TikTok webcast events via Euler Stream's managed WebSocket,
 * normalized into ShowEvents (gift/chat/like/follow/share/join/room).
 *
 * The connection lives in ONE browser: the admin Console (session-cookie path) or
 * the sessionless OBS Stage (pass `getAuth` returning the {k,s} stage creds — the
 * token route then authorizes via signature instead of session). Either way it is
 * authorised by a SHORT-LIVED JWT our server mints from the Euler API key (never
 * exposed to the client). Messages are parsed tolerantly (Euler mirrors the TikTok
 * webcast schema, which shifts) and emitted through the shared factories in
 * gifts.ts, so games downstream see one clean event shape, real or simulated.
 *
 * PARSING NOTES:
 *  - A frame is a single message OR a bundled { messages: [...] } array — both
 *    shapes are iterated.
 *  - Gift streaks: streakable gifts (giftType 1) stream repeatedly with repeatEnd
 *    false and finish once with repeatEnd true carrying the final repeatCount. We
 *    emit ONLY on repeatEnd !== false and dedupe by groupId (60s window), so a
 *    combo lands as one event with the full count.
 *  - Social displayType strings shift — always substring-match ("follow"/"share"),
 *    never equality-match.
 *  - Joins flood on big rooms → deduped per user per 5 minutes. Per-user like
 *    messages are sampled by TikTok on busy streams — fine, games treat likes as
 *    deltas.
 *  - Rate hygiene: at most 30 emissions per 100ms window; excess JOIN events are
 *    shed. Gifts/chat/follow/share are NEVER dropped.
 *
 * STABILITY (proven — do not weaken): Euler closes the socket with application
 * close codes (4000–4999). We interpret them so the connection stays visibly stable:
 *   4404 NOT_LIVE           → room offline: wait calmly and re-poll on a steady cadence.
 *   4401 INVALID_AUTH       → token expired/invalid: mint a fresh one and reconnect fast.
 *   4429 TOO_MANY_CONNS     → rate-limited: back off longer so old sockets expire.
 *   4555 MAX_LIFETIME_EXCEEDED → the JWT lifetime ended: reconnect SEAMLESSLY (we hold
 *                             the "live" label through a short grace window so the
 *                             periodic token refresh is invisible).
 * We only report "live" once a real message arrives (room info is Euler's first
 * message), never merely on socket-open — so a non-live room can't flap the status.
 */
import type { ShowEvent } from "@/lib/showtime/types";
import { chatEvent, giftEvent, likeEvent, makeUser, roomEvent, socialEvent } from "@/lib/showtime/gifts";

/** String-compatible with FeedStatus in types.ts (kept as a local alias on purpose). */
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

const GROUP_DEDUPE_MS = 60_000; // gift streak groupIds
const JOIN_DEDUPE_MS = 300_000; // per-user join spam
const RATE_WINDOW_MS = 100;
const RATE_WINDOW_CAP = 30;

export function createEulerFeed(
  onEvent: (ev: ShowEvent) => void,
  onStatus: (s: EulerStatus, msg?: string) => void,
  getAuth?: () => { k: string; s: string } | null,
) {
  let ws: WebSocket | null = null;
  let room = "";
  let stopped = true;
  let retry = 0;
  let live = false; // true only once a real message has arrived (not just socket-open)
  let timer: ReturnType<typeof setTimeout> | null = null;
  let grace: ReturnType<typeof setTimeout> | null = null;

  // parse-layer state
  const seenGroups = new Map<string, number>(); // gift groupId → last seen ts
  const seenJoins = new Map<string, number>(); // uniqueId → last join ts
  let winStart = 0;
  let winCount = 0;

  async function token(uniqueId: string): Promise<{ token?: string; status: number; error?: string }> {
    try {
      const auth = getAuth ? getAuth() : null;
      const body = auth ? { room: uniqueId, k: auth.k, s: auth.s } : { room: uniqueId };
      const res = await fetch("/api/showtime/euler-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

  /* ── Emission (rate hygiene) ──────────────────────────────────────────── */

  function emit(ev: ShowEvent) {
    const now = Date.now();
    if (now - winStart >= RATE_WINDOW_MS) { winStart = now; winCount = 0; }
    // over cap: shed JOINs only — never gifts/chat/follow/share (or likes/room)
    if (winCount >= RATE_WINDOW_CAP && ev.type === "join") return;
    winCount++;
    onEvent(ev);
  }

  /* ── Normalization ────────────────────────────────────────────────────── */

  function handle(raw: any) {
    let msg: any;
    try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
    if (!msg || typeof msg !== "object") return;
    // frames are a single message OR a bundle of them — iterate both shapes
    const bundle = pick(msg, "messages", "data.messages");
    if (Array.isArray(bundle)) { for (const m of bundle) handleOne(m); return; }
    handleOne(msg);
  }

  function handleOne(m: any) {
    if (!m || typeof m !== "object") return;
    const type = String(pick(m, "type", "event", "method", "eventType") ?? "").toLowerCase();
    const d = m.data ?? m;
    const now = Date.now();

    const avatar = pick(d, "user.profilePictureUrl", "user.profilePicture.url.0", "user.avatarThumb.urlList.0", "user.avatar_thumb.url_list.0");
    const uid = pick(d, "user.uniqueId", "user.unique_id", "uniqueId");
    const nick = pick(d, "user.nickname", "nickname");
    const user = makeUser(String(uid ?? nick ?? "guest"), nick != null ? String(nick) : undefined, typeof avatar === "string" ? avatar : undefined);
    const label = String(pick(d, "displayType", "label") ?? "").toLowerCase();

    // GIFT
    const giftName = pick(d, "giftName", "gift.name", "giftDetails.giftName", "gift.giftName");
    const diamonds = pick(d, "diamondCount", "gift.diamond_count", "gift.diamondCount", "giftDetails.diamondCount");
    if (type.includes("gift") || giftName != null || diamonds != null) {
      // streakable gifts (giftType 1) fire repeatedly mid-combo with repeatEnd false,
      // then once with repeatEnd true carrying the final repeatCount — emit only then
      const repeatEnd = pick(d, "repeatEnd", "repeat_end") ?? pick(m, "repeatEnd");
      if (repeatEnd === false) return;
      const groupId = String(pick(d, "groupId", "group_id") ?? pick(m, "groupId") ?? "");
      if (groupId) {
        const last = seenGroups.get(groupId);
        if (last != null && now - last < GROUP_DEDUPE_MS) return;
        seenGroups.set(groupId, now);
        if (seenGroups.size > 1000) {
          for (const [g, t] of seenGroups) if (now - t >= GROUP_DEDUPE_MS) seenGroups.delete(g);
        }
      }
      const unitCoins = Number(pick(d, "diamondCount", "gift.diamond_count", "gift.diamondCount", "giftDetails.diamondCount", "coins") ?? 0) || 0;
      const count = Number(pick(d, "repeatCount", "comboCount", "count") ?? 1) || 1;
      const name = String(giftName ?? "Gift");
      emit(giftEvent(user, unitCoins, count, name));
      return;
    }

    // MEMBER / JOIN (before SOCIAL: member frames can carry a "joined" displayType)
    const actionId = Number(pick(d, "actionId", "action") ?? 0) || 0;
    if (type.includes("member") || (actionId === 1 && label.includes("join"))) {
      if (actionId > 1) return; // member envelope that isn't a join (subscribe etc.)
      const last = seenJoins.get(user.id);
      if (last != null && now - last < JOIN_DEDUPE_MS) return; // joins flood on big rooms
      seenJoins.set(user.id, now);
      if (seenJoins.size > 2000) {
        for (const [id, t] of seenJoins) if (now - t >= JOIN_DEDUPE_MS) seenJoins.delete(id);
      }
      emit(socialEvent("join", user));
      return;
    }

    // SOCIAL (follow / share) — display strings shift, so substring-match, never equality
    if (type.includes("social") || pick(d, "displayType") != null) {
      if (label.includes("follow")) emit(socialEvent("follow", user));
      else if (label.includes("share")) emit(socialEvent("share", user));
      return;
    }

    // LIKE — per-user like messages are sampled by TikTok on busy streams; that is
    // fine, the game treats them as deltas
    if (type.includes("like") || pick(d, "likeCount") != null) {
      const delta = Number(pick(d, "likeCount", "count") ?? 1) || 1;
      emit(likeEvent(user, delta));
      return;
    }

    // CHAT
    const textRaw = pick(d, "comment", "content");
    if (type.includes("chat") || textRaw != null) {
      const text = String(textRaw ?? "").trim();
      if (text) emit(chatEvent(user, text));
      return;
    }

    // ROOM STATS (viewer count)
    const viewersRaw = pick(d, "viewerCount", "total");
    if (type.includes("roomuser") || viewersRaw != null) {
      emit(roomEvent(Number(viewersRaw ?? 0) || 0));
      return;
    }
  }

  return {
    start(uniqueId: string) {
      stopped = false; retry = 0; live = false;
      clearTimers();
      seenGroups.clear();
      seenJoins.clear();
      winStart = 0; winCount = 0;
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
