"use client";

/**
 * SHOWTIME — Clunoid's live, gift-reactive animation stage (admin-only for now).
 * Phase 1: the cinematic canvas engine + a Simulate panel, so the whole show system
 * is testable with no TikTok wiring. The real gift feed (Euler Stream) and the
 * Isaac/Cluno hosts come in later phases; every gift here already plays the same
 * choreographed, tier-scaled show a real gift will.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Maximize2, Minimize2, Play, Shuffle, Zap, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ShowtimeEngine, type BackgroundId } from "@/lib/showtime/engine";
import { GIFTS, giftEvent } from "@/lib/showtime/gifts";
import type { Tier } from "@/lib/showtime/types";

const HANDLES = ["nova_x", "jaydee", "miko.wav", "lunar", "kingpin", "sofia_r", "z3ro", "amara", "toshi", "vibecheck", "runtz", "aria.b"];
const rnd = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0];
const TIER_LABEL: Record<Tier, string> = { 1: "Everyday", 2: "Rare", 3: "Epic", 4: "Legendary" };
const TIER_COLOR: Record<Tier, string> = { 1: "#7dd3fc", 2: "#34d399", 3: "#a855f7", 4: "#fbbf24" };
const BGS: { id: BackgroundId; label: string }[] = [{ id: "cosmos", label: "Cosmos" }, { id: "aurora", label: "Aurora" }, { id: "grid", label: "Neon Grid" }];

type BannerState = { sender: string; emoji: string; name: string; count: number; tier: Tier; key: number } | null;

export function ShowtimeConsole() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ShowtimeEngine | null>(null);
  const [present, setPresent] = useState(false);
  const [fs, setFs] = useState(false);
  const [bg, setBg] = useState<BackgroundId>("cosmos");
  const [sender, setSender] = useState("");
  const [idle, setIdle] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new ShowtimeEngine(canvas);
    engineRef.current = engine;
    engine.onIdle = (v) => setIdle(v);
    engine.onBanner = (b) => {
      if (!b) return;
      setBanner((prev) => ({ sender: b.sender, emoji: b.emoji, name: b.name, count: b.count, tier: b.tier as Tier, key: (prev?.key ?? 0) + 1 }));
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setBanner(null), 4200);
    };
    engine.start();
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      engine.stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFs);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  useEffect(() => { engineRef.current?.setBackground(bg); }, [bg]);
  useEffect(() => { const t = setTimeout(() => engineRef.current?.resize(), 60); return () => clearTimeout(t); }, [present]);

  const fire = useCallback((giftId: string, count = 1) => {
    const ev = giftEvent(giftId, sender.trim() || rnd(HANDLES), count);
    if (ev) engineRef.current?.trigger(ev);
  }, [sender]);

  const combo = useCallback((giftId: string) => {
    const who = sender.trim() || rnd(HANDLES);
    let i = 0;
    const n = 8;
    const t = setInterval(() => { const ev = giftEvent(giftId, who, i + 1); if (ev) engineRef.current?.trigger(ev); if (++i >= n) clearInterval(t); }, 240);
  }, [sender]);

  const storm = useCallback(() => {
    let i = 0;
    const t = setInterval(() => { fire(rnd(GIFTS).id); if (++i >= 10) clearInterval(t); }, 420);
  }, [fire]);

  const toggleFs = useCallback(async () => {
    try { if (!document.fullscreenElement) await rootRef.current?.requestFullscreen(); else await document.exitFullscreen(); } catch { /* ignore */ }
  }, []);

  const tiers = useMemo(() => [1, 2, 3, 4].map((t) => ({ tier: t as Tier, gifts: GIFTS.filter((g) => g.tier === t) })), []);

  return (
    <div ref={rootRef} className="relative h-[100dvh] w-full overflow-hidden bg-black text-white" style={{ fontFamily: "var(--edge-font, system-ui), system-ui, sans-serif" }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* overlay: idle prompt */}
      {idle && (
        <div className="pointer-events-none absolute inset-x-0 top-[16%] flex flex-col items-center px-6 text-center">
          <div className="rounded-full border border-white/15 bg-black/30 px-5 py-2 text-[13px] font-semibold uppercase tracking-[0.25em] text-white/80 backdrop-blur-sm">🎁 send a gift to light up the show</div>
          <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-white/45">Every gift triggers a full-screen animation. The bigger the gift, the bigger the spectacle.</p>
        </div>
      )}

      {/* overlay: gifter banner */}
      {banner && (
        <div key={banner.key} className="pointer-events-none absolute inset-x-0 top-[7%] flex justify-center px-4">
          <div className="st-pop flex items-center gap-3 rounded-2xl border px-4 py-2.5 backdrop-blur-md" style={{ borderColor: TIER_COLOR[banner.tier] + "66", background: "rgba(0,0,0,0.42)", boxShadow: `0 0 40px -8px ${TIER_COLOR[banner.tier]}` }}>
            <span className="text-2xl">{banner.emoji}</span>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold">@{banner.sender}</div>
              <div className="text-[11px]" style={{ color: TIER_COLOR[banner.tier] }}>sent {banner.name}{banner.count > 1 ? ` ×${banner.count}` : ""}</div>
            </div>
          </div>
        </div>
      )}

      {/* top bar */}
      {!present && (
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 py-3">
          <Link href="/home" className="flex items-center gap-1 text-[13px] text-white/60 transition hover:text-white"><ArrowLeft size={15} /> clunoid</Link>
          <span className="text-[17px] font-black tracking-[0.2em]" style={{ background: "linear-gradient(90deg,#a855f7,#34d399,#fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SHOWTIME</span>
          <span className="hidden text-[11px] text-white/35 sm:inline">live gift-reaction stage · admin preview</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex overflow-hidden rounded-full border border-white/12">
              {BGS.map((b) => <button key={b.id} onClick={() => setBg(b.id)} className="px-2.5 py-1 text-[11px] font-semibold transition" style={bg === b.id ? { background: "rgba(255,255,255,0.14)", color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>{b.label}</button>)}
            </div>
            <button onClick={() => setPresent(true)} title="Present (hide controls)" className="rounded-full border border-white/12 p-1.5 text-white/70 transition hover:text-white"><PanelRightClose size={16} /></button>
            <button onClick={toggleFs} title="Fullscreen" className="rounded-full border border-white/12 p-1.5 text-white/70 transition hover:text-white">{fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          </div>
        </div>
      )}
      {present && (
        <button onClick={() => setPresent(false)} className="absolute right-3 top-3 rounded-full border border-white/12 bg-black/40 p-1.5 text-white/50 backdrop-blur transition hover:text-white"><PanelRightOpen size={16} /></button>
      )}

      {/* simulate panel */}
      {!present && (
        <div className="absolute inset-x-0 bottom-0 max-h-[46%] overflow-y-auto border-t border-white/10 bg-black/55 px-4 pb-5 pt-3 backdrop-blur-xl">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/50"><Play size={12} /> Simulate a gift</span>
              <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="sender @handle (random if blank)" className="w-52 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[12px] outline-none placeholder:text-white/25" />
              <button onClick={() => fire(rnd(GIFTS).id)} className="flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[12px] font-semibold text-white/80 transition hover:border-white/30"><Shuffle size={13} /> Surprise</button>
              <button onClick={storm} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-black transition hover:brightness-110" style={{ background: "linear-gradient(90deg,#fbbf24,#f472b6)" }}><Zap size={13} /> Gift storm</button>
              <span className="ml-auto hidden text-[10.5px] text-white/35 sm:inline">Tip: right-click a gift for an ×8 combo</span>
            </div>

            <div className="mt-3 space-y-3">
              {tiers.map(({ tier, gifts }) => (
                <div key={tier}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: TIER_COLOR[tier] }}>{TIER_LABEL[tier]}</span>
                    <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${TIER_COLOR[tier]}44, transparent)` }} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {gifts.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => fire(g.id)}
                        onContextMenu={(e) => { e.preventDefault(); combo(g.id); }}
                        className="group flex items-center gap-2 rounded-xl border px-3 py-2 transition hover:-translate-y-0.5"
                        style={{ borderColor: TIER_COLOR[tier] + "33", background: "rgba(255,255,255,0.03)" }}
                        title={`${g.name} · ${g.coins} coins · right-click for combo`}
                      >
                        <span className="text-xl">{g.emoji}</span>
                        <span className="text-left">
                          <span className="block text-[12.5px] font-semibold leading-tight">{g.name}</span>
                          <span className="block text-[10px] leading-tight text-white/40">🪙 {g.coins.toLocaleString()}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-white/30"><Sparkles size={11} /> Phase 1 preview — engine, shows & queue. Next: live TikTok gift feed (Euler Stream) + Isaac &amp; Cluno hosts. For OBS now, use “Present” + window capture.</p>
          </div>
        </div>
      )}

      <style>{`@keyframes stPop{0%{opacity:0;transform:translateY(-10px) scale(.92)}60%{transform:translateY(0) scale(1.02)}100%{opacity:1;transform:none}}.st-pop{animation:stPop .4s cubic-bezier(.2,1,.3,1) both}`}</style>
    </div>
  );
}
