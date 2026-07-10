"use client";

/**
 * Showtime transport v2 — a Supabase Realtime broadcast channel carrying the three
 * message kinds between the director console and the stage(s):
 *   ev     — normalized ShowEvents (real gifts from the stage's Euler feed are NOT
 *            re-published; the bus carries simulator events + anything cross-surface)
 *   cmd    — console → stage commands (connect/disconnect/theme/reload)
 *   status — stage → console 1/s health heartbeat
 *
 * Cross-browser / cross-machine (TikTok LIVE Studio's capture Chrome is its own
 * process), which BroadcastChannel can't do. `self:true` so a console-embedded
 * preview stage on the same page hears its own publishes. The channel name embeds
 * the unguessable stage key so only holders of the OBS URL can publish/subscribe.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { BusMessage, ShowEvent, StageCommand, StageStatus } from "./types";

export type ShowtimeBus = {
  publish: (m: BusMessage) => void;
  publishEvent: (ev: ShowEvent) => void;
  publishCommand: (c: StageCommand) => void;
  publishStatus: (s: StageStatus) => void;
  onEvent: (cb: (ev: ShowEvent) => void) => () => void;
  onCommand: (cb: (c: StageCommand) => void) => () => void;
  onStatus: (cb: (s: StageStatus) => void) => () => void;
  close: () => void;
};

export function createBus(key: string): ShowtimeBus {
  const sb = getSupabaseBrowser();
  const ch = sb.channel(`st:${key}`, { config: { broadcast: { self: true } } });
  const evCbs: ((ev: ShowEvent) => void)[] = [];
  const cmdCbs: ((c: StageCommand) => void)[] = [];
  const stCbs: ((s: StageStatus) => void)[] = [];

  ch.on("broadcast", { event: "m" }, (raw) => {
    const m = raw.payload as BusMessage;
    if (!m || typeof m !== "object") return;
    if (m.kind === "ev") for (const f of evCbs) f(m.ev);
    else if (m.kind === "cmd") for (const f of cmdCbs) f(m.c);
    else if (m.kind === "status") for (const f of stCbs) f(m.s);
  });
  ch.subscribe();

  const off = <T>(arr: T[], cb: T) => () => {
    const i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  };

  const publish = (m: BusMessage) => {
    void ch.send({ type: "broadcast", event: "m", payload: m });
  };

  return {
    publish,
    publishEvent: (ev) => publish({ kind: "ev", ev }),
    publishCommand: (c) => publish({ kind: "cmd", c }),
    publishStatus: (s) => publish({ kind: "status", s }),
    onEvent: (cb) => {
      evCbs.push(cb);
      return off(evCbs, cb);
    },
    onCommand: (cb) => {
      cmdCbs.push(cb);
      return off(cmdCbs, cb);
    },
    onStatus: (cb) => {
      stCbs.push(cb);
      return off(stCbs, cb);
    },
    close: () => {
      void sb.removeChannel(ch);
    },
  };
}

/** A stable, unguessable per-device stage key (persisted). The OBS URL carries it. */
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
