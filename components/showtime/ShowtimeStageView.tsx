"use client";

/**
 * The standalone Showtime STAGE — OBS Browser Source target (1080×1920). MINIMAL SHELL.
 *
 * The animation layer was removed; the visual design is being rebuilt. For now this is a
 * bare stage: it reads the unguessable key from the URL FRAGMENT (#k=), subscribes to the
 * Realtime bus, and shows the latest gift as plain text so the pipe can be confirmed. No
 * controls, no chrome — the new design plugs in here.
 */
import { useEffect, useRef, useState } from "react";
import { createBus, type ShowtimeBus } from "@/lib/showtime/bus";
import type { GiftEvent } from "@/lib/showtime/types";

export function ShowtimeStageView() {
  const [noKey, setNoKey] = useState(false);
  const [last, setLast] = useState<GiftEvent | null>(null);
  const busRef = useRef<ShowtimeBus | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // key travels in the URL FRAGMENT (#k=) — never sent to servers, logs or analytics
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const k = hash.get("k") || search.get("k") || "";
    if (!k) { setNoKey(true); return; }
    const b = createBus(k);
    busRef.current = b;
    const off = b.onGift((ev) => {
      setLast(ev);
      if (hideRef.current) clearTimeout(hideRef.current);
      hideRef.current = setTimeout(() => setLast(null), 4000);
    });
    return () => { off(); b.close(); if (hideRef.current) clearTimeout(hideRef.current); };
  }, []);

  return (
    <div className="grid h-[100dvh] w-full place-items-center overflow-hidden bg-black px-8 text-center">
      {noKey ? (
        <p className="max-w-sm text-[13px] text-white/50">
          This stage needs its link from the Showtime console. Open <b className="text-white/80">Showtime → Copy OBS URL</b> and use that as your OBS Browser Source.
        </p>
      ) : last ? (
        <div className="text-white">
          <div className="text-5xl">{last.gift.emoji}</div>
          <div className="mt-4 text-lg font-semibold">@{last.sender}</div>
          <div className="mt-1 text-sm text-white/60">sent {last.gift.name}{last.count > 1 ? ` ×${last.count}` : ""}</div>
        </div>
      ) : (
        <p className="text-[13px] text-white/25">Showtime stage — waiting for gifts…</p>
      )}
    </div>
  );
}
