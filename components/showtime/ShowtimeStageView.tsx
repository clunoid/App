"use client";

/**
 * The standalone Showtime STAGE — add this page as an OBS Browser Source (1080×1920).
 * It's a pure renderer: it reads the unguessable stage key + initial background from
 * the URL (?k=…&bg=…), subscribes to the Realtime bus, and plays every gift the
 * Console publishes (simulated or a real TikTok gift). No controls, no chrome.
 */
import { useEffect, useState } from "react";
import { createBus, type ShowtimeBus } from "@/lib/showtime/bus";
import { StageCanvas } from "./StageCanvas";
import type { BackgroundId } from "@/lib/showtime/engine";

export function ShowtimeStageView() {
  const [bus, setBus] = useState<ShowtimeBus | null>(null);
  const [bg, setBg] = useState<BackgroundId>("cosmos");
  const [noKey, setNoKey] = useState(false);

  useEffect(() => {
    // key travels in the URL FRAGMENT (#k=) — never sent to servers, logs or
    // analytics beacons; bg is non-secret so it stays in the query string.
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const k = hash.get("k") || search.get("k") || "";
    const initBg = search.get("bg");
    if (initBg === "cosmos" || initBg === "aurora" || initBg === "grid") setBg(initBg);
    if (!k) { setNoKey(true); return; }
    const b = createBus(k);
    setBus(b);
    const off = b.onConfig((c) => { if (c.background === "cosmos" || c.background === "aurora" || c.background === "grid") setBg(c.background); });
    return () => { off(); b.close(); };
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
      <StageCanvas bus={bus} background={bg} showIdle />
      {noKey && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <p className="max-w-sm text-[13px] text-white/50">This stage needs its link from the Showtime console. Open <b className="text-white/80">Showtime → Copy OBS URL</b> and use that as your OBS Browser Source.</p>
        </div>
      )}
    </div>
  );
}
