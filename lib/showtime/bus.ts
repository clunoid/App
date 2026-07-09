"use client";

/**
 * Showtime transport — a Supabase Realtime broadcast channel that carries gift
 * events (and stage config) from the admin's Console to the standalone Stage that
 * runs as an OBS Browser Source. Cross-browser / cross-machine (OBS uses its own
 * Chromium), which BroadcastChannel can't do. `self:true` so the publisher's own
 * preview also plays, keeping one code path. The channel name embeds an unguessable
 * key so only the admin (who holds the OBS URL) can publish/subscribe.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { GiftEvent } from "./types";

export type StageConfig = { background?: string };
export type ShowtimeBus = {
  publishGift: (ev: GiftEvent) => void;
  publishConfig: (c: StageConfig) => void;
  onGift: (cb: (ev: GiftEvent) => void) => () => void;
  onConfig: (cb: (c: StageConfig) => void) => () => void;
  close: () => void;
};

export function createBus(key: string): ShowtimeBus {
  const sb = getSupabaseBrowser();
  const ch = sb.channel(`st:${key}`, { config: { broadcast: { self: true } } });
  const giftCbs: ((ev: GiftEvent) => void)[] = [];
  const cfgCbs: ((c: StageConfig) => void)[] = [];
  ch.on("broadcast", { event: "gift" }, (m) => { for (const f of giftCbs) f(m.payload as GiftEvent); });
  ch.on("broadcast", { event: "config" }, (m) => { for (const f of cfgCbs) f(m.payload as StageConfig); });
  ch.subscribe();
  const off = <T>(arr: T[], cb: T) => () => { const i = arr.indexOf(cb); if (i >= 0) arr.splice(i, 1); };
  return {
    publishGift: (ev) => { void ch.send({ type: "broadcast", event: "gift", payload: ev }); },
    publishConfig: (c) => { void ch.send({ type: "broadcast", event: "config", payload: c }); },
    onGift: (cb) => { giftCbs.push(cb); return off(giftCbs, cb); },
    onConfig: (cb) => { cfgCbs.push(cb); return off(cfgCbs, cb); },
    close: () => { void sb.removeChannel(ch); },
  };
}

/** A stable, unguessable per-device stage key (persisted). The OBS URL carries it. */
export function stageKey(): string {
  if (typeof window === "undefined") return "";
  const K = "showtime_stage_key";
  let k = localStorage.getItem(K);
  if (!k) { k = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem(K, k); }
  return k;
}
