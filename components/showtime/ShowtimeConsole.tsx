"use client";

/**
 * SHOWTIME console (admin control room). Drives the live gift-reaction stage:
 *  - a live preview (StageCanvas) of exactly what the OBS stage shows,
 *  - "Go Live": connect to a TikTok @handle via Euler Stream → real gifts,
 *  - Simulate: fire any gift / combos / a gift storm (works with no TikTok wiring),
 *  - Copy OBS URL: the /showtime/stage?k=… Browser Source link,
 *  - a session leaderboard + live event feed.
 * Everything (simulated or real) flows through the Realtime bus, so the console
 * preview and the OBS stage always play the same show.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Maximize2, Minimize2, Play, Shuffle, Zap, PanelRightClose, PanelRightOpen, Radio, Copy, Check, Trophy, Loader2 } from "lucide-react";
import { StageCanvas } from "./StageCanvas";
import { createBus, stageKey, type ShowtimeBus } from "@/lib/showtime/bus";
import { createEulerFeed, type EulerStatus } from "@/lib/showtime/euler";
import { GIFTS, giftEvent } from "@/lib/showtime/gifts";
import type { BackgroundId } from "@/lib/showtime/engine";
import type { GiftEvent, Tier } from "@/lib/showtime/types";

const HANDLES = ["nova_x", "jaydee", "miko.wav", "lunar", "kingpin", "sofia_r", "z3ro", "amara", "toshi", "vibecheck", "runtz", "aria.b"];
const rnd = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0];
const TIER_LABEL: Record<Tier, string> = { 1: "Everyday", 2: "Rare", 3: "Epic", 4: "Legendary" };
const TIER_COLOR: Record<Tier, string> = { 1: "#7dd3fc", 2: "#34d399", 3: "#a855f7", 4: "#fbbf24" };
const BGS: { id: BackgroundId; label: string }[] = [{ id: "cosmos", label: "Cosmos" }, { id: "aurora", label: "Aurora" }, { id: "grid", label: "Neon Grid" }];
const STATUS: Record<EulerStatus, { label: string; color: string }> = {
  idle: { label: "Offline", color: "#9aa5a0" },
  connecting: { label: "Connecting…", color: "#fbbf24" },
  live: { label: "LIVE", color: "#34d399" },
  error: { label: "Error", color: "#f87171" },
  unconfigured: { label: "Set up needed", color: "#9aa5a0" },
};

export function ShowtimeConsole() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const busRef = useRef<ShowtimeBus | null>(null);
  const eulerRef = useRef<ReturnType<typeof createEulerFeed> | null>(null);
  const [bus, setBus] = useState<ShowtimeBus | null>(null);
  const [key, setKey] = useState("");
  const [present, setPresent] = useState(false);
  const [fs, setFs] = useState(false);
  const [bg, setBg] = useState<BackgroundId>("cosmos");
  const [sender, setSender] = useState("");
  const [room, setRoom] = useState("");
  const [euler, setEuler] = useState<{ status: EulerStatus; msg?: string }>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [feed, setFeed] = useState<{ ev: GiftEvent; k: number }[]>([]);
  const [board, setBoard] = useState<Record<string, number>>({});
  const seq = useRef(0);

  useEffect(() => {
    const k = stageKey();
    setKey(k);
    try { const saved = localStorage.getItem("showtime_room"); if (saved) setRoom(saved); } catch { /* ignore */ }
    const b = createBus(k);
    busRef.current = b;
    setBus(b);
    const off = b.onGift((ev) => {
      setFeed((prev) => [{ ev, k: ++seq.current }, ...prev].slice(0, 10));
      setBoard((prev) => ({ ...prev, [ev.sender]: (prev[ev.sender] || 0) + ev.gift.coins * ev.count }));
    });
    eulerRef.current = createEulerFeed((ev) => busRef.current?.publishGift(ev), (status, msg) => setEuler({ status, msg }));
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => { off(); b.close(); eulerRef.current?.stop(); document.removeEventListener("fullscreenchange", onFs); };
  }, []);

  const fire = useCallback((giftId: string, count = 1) => {
    const ev = giftEvent(giftId, sender.trim() || rnd(HANDLES), count);
    if (ev) busRef.current?.publishGift(ev);
  }, [sender]);
  const combo = useCallback((giftId: string) => {
    const who = sender.trim() || rnd(HANDLES);
    let i = 0; const t = setInterval(() => { const ev = giftEvent(giftId, who, i + 1); if (ev) busRef.current?.publishGift(ev); if (++i >= 8) clearInterval(t); }, 240);
  }, [sender]);
  const storm = useCallback(() => { let i = 0; const t = setInterval(() => { fire(rnd(GIFTS).id); if (++i >= 10) clearInterval(t); }, 420); }, [fire]);
  const changeBg = useCallback((id: BackgroundId) => { setBg(id); busRef.current?.publishConfig({ background: id }); }, []);
  const connect = useCallback(() => { const r = room.trim(); if (!r) return; try { localStorage.setItem("showtime_room", r); } catch { /* ignore */ } eulerRef.current?.start(r); }, [room]);
  const disconnect = useCallback(() => eulerRef.current?.stop(), []);
  const toggleFs = useCallback(async () => { try { if (!document.fullscreenElement) await rootRef.current?.requestFullscreen(); else await document.exitFullscreen(); } catch { /* ignore */ } }, []);
  const copyObs = useCallback(async () => {
    if (!key) return;
    // key in the fragment (#k=) so it never reaches servers/analytics/logs
    try { await navigator.clipboard.writeText(`${window.location.origin}/showtime/stage?bg=${bg}#k=${key}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }, [key, bg]);

  const tiers = useMemo(() => [1, 2, 3, 4].map((t) => ({ tier: t as Tier, gifts: GIFTS.filter((g) => g.tier === t) })), []);
  const leaders = useMemo(() => Object.entries(board).sort((a, b) => b[1] - a[1]).slice(0, 5), [board]);
  const st = STATUS[euler.status];
  const eulerBusy = euler.status === "connecting";
  const eulerLive = euler.status === "live";

  return (
    <div ref={rootRef} className="relative h-[100dvh] w-full overflow-hidden bg-black text-white" style={{ fontFamily: "system-ui, sans-serif" }}>
      <StageCanvas bus={bus} background={bg} showIdle />

      {/* top bar */}
      {!present && (
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 py-3">
          <Link href="/home" className="flex items-center gap-1 text-[13px] text-white/60 transition hover:text-white"><ArrowLeft size={15} /> clunoid</Link>
          <span className="text-[17px] font-black tracking-[0.2em]" style={{ background: "linear-gradient(90deg,#a855f7,#34d399,#fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SHOWTIME</span>
          {eulerLive && <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE @{room}</span>}
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex overflow-hidden rounded-full border border-white/12">
              {BGS.map((b) => <button key={b.id} onClick={() => changeBg(b.id)} className="px-2.5 py-1 text-[11px] font-semibold transition" style={bg === b.id ? { background: "rgba(255,255,255,0.14)", color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>{b.label}</button>)}
            </div>
            <button onClick={() => setPresent(true)} title="Present (hide controls)" className="rounded-full border border-white/12 p-1.5 text-white/70 transition hover:text-white"><PanelRightClose size={16} /></button>
            <button onClick={toggleFs} title="Fullscreen" className="rounded-full border border-white/12 p-1.5 text-white/70 transition hover:text-white">{fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          </div>
        </div>
      )}
      {present && <button onClick={() => setPresent(false)} className="absolute right-3 top-3 rounded-full border border-white/12 bg-black/40 p-1.5 text-white/50 backdrop-blur transition hover:text-white"><PanelRightOpen size={16} /></button>}

      {/* control drawer */}
      {!present && (
        <div className="absolute inset-x-0 bottom-0 max-h-[54%] overflow-y-auto border-t border-white/10 bg-black/60 px-4 pb-5 pt-3 backdrop-blur-xl">
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_300px]">
            <div>
              {/* Go Live */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/50"><Radio size={12} /> Go live</span>
                <div className="flex items-center overflow-hidden rounded-full border border-white/12 bg-white/5">
                  <span className="pl-3 text-[13px] text-white/40">@</span>
                  <input value={room} onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") connect(); }} placeholder="your.tiktok" className="w-40 bg-transparent px-1.5 py-1.5 text-[13px] outline-none placeholder:text-white/25" />
                </div>
                {eulerLive ? (
                  <button onClick={disconnect} className="rounded-full border border-red-400/40 px-3 py-1.5 text-[12px] font-semibold text-red-300 transition hover:border-red-400">Stop</button>
                ) : (
                  <button onClick={connect} disabled={!room.trim() || eulerBusy} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-black transition hover:brightness-110 disabled:opacity-40" style={{ background: "#34d399" }}>{eulerBusy ? <Loader2 size={13} className="animate-spin" /> : <Radio size={13} />} Connect</button>
                )}
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: st.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} /> {st.label}</span>
                <button onClick={copyObs} className="ml-auto flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[12px] font-semibold text-white/80 transition hover:border-white/30">{copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />} {copied ? "Copied" : "Copy OBS URL"}</button>
              </div>
              {euler.msg && euler.status !== "live" && <p className="mt-1.5 text-[11px]" style={{ color: euler.status === "error" ? "#f87171" : "#9aa5a0" }}>{euler.msg}</p>}

              {/* Simulate */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/50"><Play size={12} /> Simulate</span>
                <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="sender @handle (random)" className="w-44 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[12px] outline-none placeholder:text-white/25" />
                <button onClick={() => fire(rnd(GIFTS).id)} className="flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[12px] font-semibold text-white/80 transition hover:border-white/30"><Shuffle size={13} /> Surprise</button>
                <button onClick={storm} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-black transition hover:brightness-110" style={{ background: "linear-gradient(90deg,#fbbf24,#f472b6)" }}><Zap size={13} /> Gift storm</button>
                <span className="hidden text-[10.5px] text-white/35 sm:inline">right-click a gift = ×8 combo</span>
              </div>
              <div className="mt-2.5 space-y-2.5">
                {tiers.map(({ tier, gifts }) => (
                  <div key={tier}>
                    <div className="mb-1 flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: TIER_COLOR[tier] }}>{TIER_LABEL[tier]}</span><span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${TIER_COLOR[tier]}44, transparent)` }} /></div>
                    <div className="flex flex-wrap gap-2">
                      {gifts.map((g) => (
                        <button key={g.id} onClick={() => fire(g.id)} onContextMenu={(e) => { e.preventDefault(); combo(g.id); }} className="flex items-center gap-2 rounded-xl border px-3 py-2 transition hover:-translate-y-0.5" style={{ borderColor: TIER_COLOR[tier] + "33", background: "rgba(255,255,255,0.03)" }} title={`${g.name} · ${g.coins} coins · right-click = combo`}>
                          <span className="text-xl">{g.emoji}</span>
                          <span className="text-left"><span className="block text-[12.5px] font-semibold leading-tight">{g.name}</span><span className="block text-[10px] leading-tight text-white/40">🪙 {g.coins.toLocaleString()}</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* leaderboard + feed */}
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/50"><Trophy size={12} style={{ color: "#fbbf24" }} /> Top gifters</div>
                {leaders.length === 0 ? <p className="mt-2 text-[11px] text-white/30">No gifts yet — fire one to test.</p> : (
                  <ol className="mt-2 space-y-1">{leaders.map(([who, coins], i) => (
                    <li key={who} className="flex items-center gap-2 text-[12.5px]"><span className="w-4 text-center font-bold" style={{ color: i === 0 ? "#fbbf24" : "#9aa5a0" }}>{i + 1}</span><span className="min-w-0 flex-1 truncate">@{who}</span><span className="font-mono text-[11px] text-white/50">🪙 {coins.toLocaleString()}</span></li>
                  ))}</ol>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Live feed</div>
                <div className="mt-2 space-y-1">{feed.length === 0 ? <p className="text-[11px] text-white/30">…</p> : feed.map(({ ev, k }) => (
                  <div key={k} className="flex items-center gap-2 text-[12px]"><span>{ev.gift.emoji}</span><span className="min-w-0 flex-1 truncate text-white/80">@{ev.sender}</span><span className="truncate text-[11px] text-white/40">{ev.gift.name}{ev.count > 1 ? ` ×${ev.count}` : ""}</span></div>
                ))}</div>
              </div>
              <p className="flex items-start gap-1.5 text-[10.5px] text-white/30"><Sparkles size={11} className="mt-0.5 shrink-0" /> Add <b className="text-white/50">/showtime/stage</b> (Copy OBS URL) as a 1080×1920 Browser Source. Connect needs EULER_API_KEY + EULER_ACCOUNT_ID set; Simulate works now.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
