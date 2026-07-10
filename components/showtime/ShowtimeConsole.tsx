"use client";

/**
 * SHOWTIME console (admin control room) — MINIMAL SHELL, full-bleed layout.
 *
 * The old design + animations were removed; the stage is being redesigned. This keeps
 * only the plumbing: connect to a TikTok @handle via Euler Stream, copy the OBS Browser
 * Source URL, fire a test gift, and watch the raw event feed. Everything (real or test)
 * flows through the Realtime bus, so the OBS stage sees exactly what the console sees.
 * Layout mirrors the Trading desk: back link flush top-left, content fills the viewport.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createBus, stageKey, type ShowtimeBus } from "@/lib/showtime/bus";
import { createEulerFeed, type EulerStatus } from "@/lib/showtime/euler";
import { testGift } from "@/lib/showtime/gifts";
import type { GiftEvent } from "@/lib/showtime/types";

const STATUS: Record<EulerStatus, { label: string; color: string }> = {
  idle: { label: "Offline", color: "#A6A199" },
  connecting: { label: "Connecting…", color: "#D97757" },
  live: { label: "Live", color: "#7FB069" },
  error: { label: "Error", color: "#D86B6B" },
  unconfigured: { label: "Set-up needed", color: "#A6A199" },
};

export function ShowtimeConsole() {
  const busRef = useRef<ShowtimeBus | null>(null);
  const eulerRef = useRef<ReturnType<typeof createEulerFeed> | null>(null);
  const [key, setKey] = useState("");
  const [room, setRoom] = useState("");
  const [euler, setEuler] = useState<{ status: EulerStatus; msg?: string }>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [feed, setFeed] = useState<{ ev: GiftEvent; k: number }[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const k = stageKey();
    setKey(k);
    try { const saved = localStorage.getItem("showtime_room"); if (saved) setRoom(saved); } catch { /* ignore */ }
    const b = createBus(k);
    busRef.current = b;
    const off = b.onGift((ev) => setFeed((prev) => [{ ev, k: ++seq.current }, ...prev].slice(0, 40)));
    eulerRef.current = createEulerFeed(
      (ev) => busRef.current?.publishGift(ev),
      (status, msg) => setEuler({ status, msg }),
    );
    return () => { off(); b.close(); eulerRef.current?.stop(); };
  }, []);

  const connect = useCallback(() => {
    const r = room.trim();
    if (!r) return;
    try { localStorage.setItem("showtime_room", r); } catch { /* ignore */ }
    eulerRef.current?.start(r);
  }, [room]);
  const disconnect = useCallback(() => eulerRef.current?.stop(), []);
  const sendTest = useCallback(() => busRef.current?.publishGift(testGift()), []);
  const copyObs = useCallback(async () => {
    if (!key) return;
    // key in the fragment (#k=) so it never reaches servers/analytics/logs
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/showtime/stage#k=${key}`);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  }, [key]);

  const st = STATUS[euler.status];
  const live = euler.status === "live";
  const busy = euler.status === "connecting";

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-base text-ink">
      {/* top bar — back link flush top-left */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-base/90 px-4 py-3 backdrop-blur sm:px-6 xl:px-10">
        <Link href="/home" aria-label="Home" className="flex items-center gap-1 text-[13px] text-ink-muted transition hover:text-ink">
          <ArrowLeft size={15} /> clunoid
        </Link>
        <span className="text-[14px] font-semibold tracking-wide">Showtime</span>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] font-medium" style={{ color: st.color }}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse" : ""}`} style={{ background: st.color }} />
          {st.label}{live ? ` · @${room}` : ""}
        </span>
      </header>

      {/* content fills the whole space */}
      <main className="w-full flex-1 px-4 pb-6 pt-5 sm:px-6 xl:px-10">
        <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
          {/* controls column */}
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-ink-muted">
              Live TikTok gift stage. The visuals are being redesigned — this is the bare control panel. The connection, Realtime bus and OBS output all still work.
            </p>

            {/* Go live */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Go live</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-lg border border-border bg-base">
                  <span className="pl-3 text-[14px] text-ink-faint">@</span>
                  <input
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
                    placeholder="your.tiktok"
                    className="w-44 bg-transparent px-2 py-2 text-[14px] outline-none placeholder:text-ink-faint"
                  />
                </div>
                {live || busy ? (
                  <button onClick={disconnect} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink transition hover:border-ink-faint">Stop</button>
                ) : (
                  <button onClick={connect} disabled={!room.trim()} className="rounded-lg bg-clay px-4 py-2 text-[13px] font-medium text-base transition hover:brightness-105 disabled:opacity-40">Connect</button>
                )}
              </div>
              {euler.msg && !live && (
                <p className="mt-2 text-[12px]" style={{ color: euler.status === "error" ? "#D86B6B" : "#A6A199" }}>{euler.msg}</p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                A real room needs EULER_API_KEY + EULER_ACCOUNT_ID in the environment. Once connected it stays live and reconnects seamlessly.
              </p>
            </section>

            {/* Stage output */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Stage output (OBS)</h2>
              <p className="mt-2 text-[13px] text-ink-muted">Add this as a 1080×1920 Browser Source in OBS. The key stays in the URL fragment, so it never hits our servers.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={copyObs} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink transition hover:border-ink-faint">{copied ? "Copied ✓" : "Copy OBS URL"}</button>
                <Link href={`/showtime/stage#k=${key}`} target="_blank" className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink-muted transition hover:text-ink hover:border-ink-faint">Open stage ↗</Link>
                <button onClick={sendTest} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink-muted transition hover:text-ink hover:border-ink-faint">Send test gift</button>
              </div>
            </section>
          </div>

          {/* live feed — fills the remaining space */}
          <section className="flex min-h-[240px] flex-col overflow-hidden rounded-xl border border-border bg-surface lg:min-h-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Live feed</h2>
              <span className="text-[11px] text-ink-faint">{feed.length ? `${feed.length} recent` : ""}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {feed.length === 0 ? (
                <p className="text-[13px] text-ink-faint">No gifts yet — connect to a live room or send a test gift.</p>
              ) : (
                <ul className="space-y-1.5">
                  {feed.map(({ ev, k }) => (
                    <li key={k} className="flex items-center gap-2 text-[13px]">
                      <span>{ev.gift.emoji}</span>
                      <span className="font-medium">@{ev.sender}</span>
                      <span className="text-ink-muted">sent {ev.gift.name}{ev.count > 1 ? ` ×${ev.count}` : ""}</span>
                      <span className="ml-auto text-[12px] text-ink-faint">🪙 {(ev.gift.coins * ev.count).toLocaleString()} · T{ev.gift.tier}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
