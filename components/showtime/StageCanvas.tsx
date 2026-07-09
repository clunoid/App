"use client";

/**
 * The Showtime stage renderer — the cinematic canvas engine + its overlay (idle
 * prompt + gifter banner). Shared by the admin Console (live preview) and the
 * standalone /showtime/stage (the OBS Browser Source). Gift events arrive on the
 * Realtime `bus`; simulate and real TikTok gifts both flow through it.
 */
import { useEffect, useRef, useState } from "react";
import { ShowtimeEngine, type BackgroundId } from "@/lib/showtime/engine";
import type { ShowtimeBus } from "@/lib/showtime/bus";
import type { Tier } from "@/lib/showtime/types";

const TIER_COLOR: Record<number, string> = { 1: "#7dd3fc", 2: "#34d399", 3: "#a855f7", 4: "#fbbf24" };
type BannerState = { sender: string; emoji: string; name: string; count: number; tier: Tier; key: number } | null;

export function StageCanvas({ bus, background = "cosmos", showIdle = true }: { bus: ShowtimeBus | null; background?: BackgroundId; showIdle?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ShowtimeEngine | null>(null);
  const [idle, setIdle] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const engine = new ShowtimeEngine(canvasRef.current!);
    engineRef.current = engine;
    engine.onIdle = setIdle;
    engine.onBanner = (b) => {
      if (!b) return;
      setBanner((prev) => ({ sender: b.sender, emoji: b.emoji, name: b.name, count: b.count, tier: b.tier as Tier, key: (prev?.key ?? 0) + 1 }));
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setBanner(null), 4200);
    };
    engine.start();
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      engine.stop();
      window.removeEventListener("resize", onResize);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  useEffect(() => { engineRef.current?.setBackground(background); }, [background]);
  useEffect(() => {
    if (!bus) return;
    return bus.onGift((ev) => engineRef.current?.trigger(ev));
  }, [bus]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {showIdle && idle && (
        <div className="pointer-events-none absolute inset-x-0 top-[16%] flex flex-col items-center px-6 text-center">
          <div className="rounded-full border border-white/15 bg-black/30 px-5 py-2 text-[13px] font-semibold uppercase tracking-[0.25em] text-white/80 backdrop-blur-sm">🎁 send a gift to light up the show</div>
          <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-white/45">Every gift triggers a full-screen animation. The bigger the gift, the bigger the spectacle.</p>
        </div>
      )}
      {banner && (
        <div key={banner.key} className="pointer-events-none absolute inset-x-0 top-[7%] flex justify-center px-4">
          <div className="st-pop flex items-center gap-3 rounded-2xl border px-4 py-2.5 backdrop-blur-md" style={{ borderColor: TIER_COLOR[banner.tier] + "66", background: "rgba(0,0,0,0.42)", boxShadow: `0 0 40px -8px ${TIER_COLOR[banner.tier]}` }}>
            <span className="text-2xl">{banner.emoji}</span>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold text-white">@{banner.sender}</div>
              <div className="text-[11px]" style={{ color: TIER_COLOR[banner.tier] }}>sent {banner.name}{banner.count > 1 ? ` ×${banner.count}` : ""}</div>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes stPop{0%{opacity:0;transform:translateY(-10px) scale(.92)}60%{transform:translateY(0) scale(1.02)}100%{opacity:1;transform:none}}.st-pop{animation:stPop .4s cubic-bezier(.2,1,.3,1) both}`}</style>
    </>
  );
}
