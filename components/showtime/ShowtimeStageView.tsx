"use client";

/**
 * The standalone Showtime STAGE — add this page as an OBS Browser Source (1080×1920).
 * It's a pure renderer: it reads the unguessable stage key from the URL FRAGMENT
 * (#k=…), subscribes to the Realtime bus, and plays every gift the Console publishes
 * (simulated or a real TikTok gift). No controls, no chrome.
 */
import { useEffect, useState } from "react";
import { createBus, type ShowtimeBus } from "@/lib/showtime/bus";
import { StageCanvas } from "./StageCanvas";

export function ShowtimeStageView() {
  const [bus, setBus] = useState<ShowtimeBus | null>(null);
  const [noKey, setNoKey] = useState(false);

  useEffect(() => {
    // key travels in the URL FRAGMENT (#k=) — never sent to servers, logs or analytics
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const k = hash.get("k") || search.get("k") || "";
    if (!k) { setNoKey(true); return; }
    const b = createBus(k);
    setBus(b);
    return () => { b.close(); };
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
      <StageCanvas bus={bus} showIdle />
      {noKey && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <p className="max-w-sm text-[13px] text-white/50">This stage needs its link from the Showtime console. Open <b className="text-white/80">Showtime → Copy OBS URL</b> and use that as your OBS Browser Source.</p>
        </div>
      )}
    </div>
  );
}
