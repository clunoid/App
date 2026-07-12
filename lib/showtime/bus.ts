"use client";

/**
 * Showtime transport — a Supabase Realtime broadcast channel that carries live events
 * (gifts + chat votes) from the admin's Console to the standalone Stage that runs as
 * a browser/window source in TikTok LIVE Studio or OBS. Cross-browser / cross-machine
 * (the capture browser is its own process), which BroadcastChannel can't do.
 * `self:true` so the publisher's own preview also plays, keeping one code path. The
 * channel name embeds an unguessable key so only the admin (who holds the stage URL)
 * can publish/subscribe.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { ChatEvent, GiftEvent, StageEvent } from "./types";

export type ShowtimeBus = {
  publishGift: (ev: GiftEvent) => void;
  publishChat: (ev: ChatEvent) => void;
  onEvent: (cb: (e: StageEvent) => void) => () => void;
  close: () => void;
};

export function createBus(key: string): ShowtimeBus {
  const sb = getSupabaseBrowser();
  const ch = sb.channel(`st:${key}`, { config: { broadcast: { self: true } } });
  const cbs: ((e: StageEvent) => void)[] = [];
  ch.on("broadcast", { event: "m" }, (m) => {
    const e = m.payload as StageEvent;
    if (!e || (e.kind !== "gift" && e.kind !== "chat")) return;
    for (const f of cbs) f(e);
  });
  ch.subscribe();
  const publish = (e: StageEvent) => {
    void ch.send({ type: "broadcast", event: "m", payload: e });
  };
  return {
    publishGift: (ev) => publish({ kind: "gift", ev }),
    publishChat: (ev) => publish({ kind: "chat", ev }),
    onEvent: (cb) => {
      cbs.push(cb);
      return () => {
        const i = cbs.indexOf(cb);
        if (i >= 0) cbs.splice(i, 1);
      };
    },
    close: () => {
      void sb.removeChannel(ch);
    },
  };
}

/** A stable, unguessable per-device stage key (persisted). The stage URL carries it. */
export function stageKey(): string {
  if (typeof window === "undefined") return "";
  const K = "showtime_stage_key";
  let k = localStorage.getItem(K);
  if (!k) {
    k = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(K, k);
  }
  return k;
}
