"use client";

/**
 * SHOWTIME console (admin control room) for the 3D PENALTY SHOOTOUT.
 *
 * Keeps the connect-account plumbing exactly as before (enter @handle → Euler feed,
 * Copy OBS URL) and adds: chat forwarding (comments are the free voting channel),
 * a live 9:16 preview of the stage, and a full match simulator — every mapped gift
 * and vote comment as one-click buttons so the whole game can be rehearsed without
 * TikTok. Everything (real or simulated) flows through the same Realtime bus, so
 * the preview and the captured stage always show the same match.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createBus, stageKey, type ShowtimeBus } from "@/lib/showtime/bus";
import { createEulerFeed, type EulerStatus } from "@/lib/showtime/euler";
import { normalizeGift } from "@/lib/showtime/gifts";
import type { StageEvent } from "@/lib/showtime/types";

const STATUS: Record<EulerStatus, { label: string; color: string }> = {
  idle: { label: "Offline", color: "#A6A199" },
  connecting: { label: "Connecting…", color: "#D97757" },
  live: { label: "Live", color: "#7FB069" },
  error: { label: "Error", color: "#D86B6B" },
  unconfigured: { label: "Set-up needed", color: "#A6A199" },
};

/** The mapped gifts (names + coins must match lib/showtime/game/config.ts). */
const SIM_GIFTS: { name: string; coins: number; hint: string }[] = [
  { name: "Rose", coins: 1, hint: "Ronaldo / shoot LEFT" },
  { name: "TikTok", coins: 1, hint: "Messi / shoot CENTER" },
  { name: "Ice Cream Cone", coins: 1, hint: "shoot RIGHT" },
  { name: "Perfume", coins: 20, hint: "keeper LEFT" },
  { name: "Doughnut", coins: 30, hint: "keeper CENTER" },
  { name: "Hand Hearts", coins: 100, hint: "keeper RIGHT" },
  { name: "Corgi", coins: 299, hint: "keeper reach" },
  { name: "Money Gun", coins: 500, hint: "shot power" },
  { name: "Galaxy", coins: 1000, hint: "rocket shot" },
  { name: "Lion", coins: 29999, hint: "keeper reads it" },
  { name: "TikTok Universe", coins: 44999, hint: "jumbotron" },
];

const SIM_COMMENTS = ["left", "center", "right", "ronaldo", "messi"];
const FAKE = ["nova_x", "jaydee", "miko.wav", "kairo", "zetsu", "lu_na", "pixel.pri", "dash7"];

export function ShowtimeConsole() {
  const busRef = useRef<ShowtimeBus | null>(null);
  const eulerRef = useRef<ReturnType<typeof createEulerFeed> | null>(null);
  const [key, setKey] = useState("");
  const [room, setRoom] = useState("");
  const [euler, setEuler] = useState<{ status: EulerStatus; msg?: string }>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [feed, setFeed] = useState<{ e: StageEvent; k: number }[]>([]);
  const [sender, setSender] = useState("");
  const [customText, setCustomText] = useState("");
  const seq = useRef(0);
  const fakeI = useRef(0);

  useEffect(() => {
    const k = stageKey();
    setKey(k);
    try {
      const saved = localStorage.getItem("showtime_room");
      if (saved) setRoom(saved);
    } catch {
      /* ignore */
    }
    const b = createBus(k);
    busRef.current = b;
    const off = b.onEvent((e) => setFeed((prev) => [{ e, k: ++seq.current }, ...prev].slice(0, 30)));
    eulerRef.current = createEulerFeed(
      (ev) => busRef.current?.publishGift(ev),
      (status, msg) => setEuler({ status, msg }),
      (chat) => busRef.current?.publishChat(chat),
    );
    return () => {
      off();
      b.close();
      eulerRef.current?.stop();
    };
  }, []);

  const connect = useCallback(() => {
    const r = room.trim();
    if (!r) return;
    try {
      localStorage.setItem("showtime_room", r);
    } catch {
      /* ignore */
    }
    eulerRef.current?.start(r);
  }, [room]);
  const disconnect = useCallback(() => eulerRef.current?.stop(), []);

  const who = useCallback(() => sender.trim() || FAKE[fakeI.current++ % FAKE.length], [sender]);
  const simGift = useCallback(
    (name: string, coins: number) => busRef.current?.publishGift(normalizeGift(name, coins, who(), 1)),
    [who],
  );
  const simChat = useCallback((text: string) => busRef.current?.publishChat({ sender: who(), text, ts: Date.now() }), [who]);

  const copyObs = useCallback(async () => {
    if (!key) return;
    // key in the fragment (#k=) so it never reaches servers/analytics/logs
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/showtime/stage#k=${key}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }, [key]);

  const st = STATUS[euler.status];
  const live = euler.status === "live";
  const busy = euler.status === "connecting";
  const btn = "rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-ink transition hover:border-ink-faint";

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-base text-ink">
      {/* top bar — back link flush top-left */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-base/90 px-4 py-3 backdrop-blur sm:px-6 xl:px-10">
        <Link href="/home" aria-label="Home" className="flex items-center gap-1 text-[13px] text-ink-muted transition hover:text-ink">
          <ArrowLeft size={15} /> clunoid
        </Link>
        <span className="text-[14px] font-semibold tracking-wide">Showtime · Penalty Shootout</span>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] font-medium" style={{ color: st.color }}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse" : ""}`} style={{ background: st.color }} />
          {st.label}
          {live ? ` · @${room}` : ""}
        </span>
      </header>

      <main className="w-full flex-1 px-4 pb-6 pt-5 sm:px-6 xl:px-10">
        <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)_minmax(0,320px)]">
          {/* ── controls ── */}
          <div className="flex flex-col gap-4">
            {/* Go live */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Go live</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-lg border border-border bg-base">
                  <span className="pl-3 text-[14px] text-ink-faint">@</span>
                  <input
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") connect();
                    }}
                    placeholder="your.tiktok"
                    className="w-44 bg-transparent px-2 py-2 text-[14px] outline-none placeholder:text-ink-faint"
                  />
                </div>
                {live || busy ? (
                  <button onClick={disconnect} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink transition hover:border-ink-faint">
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={connect}
                    disabled={!room.trim()}
                    className="rounded-lg bg-clay px-4 py-2 text-[13px] font-medium text-base transition hover:brightness-105 disabled:opacity-40"
                  >
                    Connect
                  </button>
                )}
              </div>
              {euler.msg && !live && (
                <p className="mt-2 text-[12px]" style={{ color: euler.status === "error" ? "#D86B6B" : "#A6A199" }}>
                  {euler.msg}
                </p>
              )}
            </section>

            {/* Stage output */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Stage output</h2>
              <p className="mt-2 text-[13px] text-ink-muted">Add as a 1080×1920 browser/window source in TikTok LIVE Studio or OBS.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={copyObs} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink transition hover:border-ink-faint">
                  {copied ? "Copied ✓" : "Copy OBS URL"}
                </button>
                <Link
                  href={`/showtime/stage#k=${key}`}
                  target="_blank"
                  className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink-muted transition hover:border-ink-faint hover:text-ink"
                >
                  Open stage ↗
                </Link>
              </div>
            </section>

            {/* Simulator */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Match simulator</h2>
              <input
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="sender @handle (random)"
                className="mt-3 w-52 rounded-lg border border-border bg-base px-3 py-1.5 text-[12px] outline-none placeholder:text-ink-faint"
              />
              <div className="mt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Gifts</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SIM_GIFTS.map((sg) => (
                    <button key={sg.name} onClick={() => simGift(sg.name, sg.coins)} className={btn} title={sg.hint}>
                      {sg.name} <span className="text-ink-faint">({sg.coins.toLocaleString()})</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Vote comments</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SIM_COMMENTS.map((c) => (
                    <button key={c} onClick={() => simChat(c)} className={btn}>
                      “{c}”
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customText.trim()) {
                        simChat(customText.trim());
                        setCustomText("");
                      }
                    }}
                    placeholder="custom comment…"
                    className="w-full rounded-lg border border-border bg-base px-3 py-1.5 text-[12px] outline-none placeholder:text-ink-faint"
                  />
                  <button
                    onClick={() => {
                      if (customText.trim()) {
                        simChat(customText.trim());
                        setCustomText("");
                      }
                    }}
                    className={btn}
                  >
                    Send
                  </button>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                Same bus as the real feed — whatever you fire here plays on the stage and the preview, exactly as viewers will see it.
              </p>
            </section>
          </div>

          {/* ── live preview ── */}
          <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-surface lg:min-h-0">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Live preview — mirrors the stage</h2>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              {key ? (
                <div className="h-full max-h-full overflow-hidden rounded-lg border border-border bg-black" style={{ aspectRatio: "9 / 16" }}>
                  <iframe src={`/showtime/stage#k=${key}`} title="Stage preview" className="h-full w-full" style={{ border: 0 }} />
                </div>
              ) : (
                <p className="text-[12px] text-ink-faint">Preparing stage key…</p>
              )}
            </div>
          </section>

          {/* ── event feed ── */}
          <section className="flex min-h-[240px] flex-col overflow-hidden rounded-xl border border-border bg-surface lg:min-h-0">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Live feed</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {feed.length === 0 ? (
                <p className="text-[13px] text-ink-faint">No events yet — connect a live room or use the simulator.</p>
              ) : (
                <ul className="space-y-1.5">
                  {feed.map(({ e, k }) => (
                    <li key={k} className="flex items-center gap-2 text-[12.5px]">
                      {e.kind === "gift" ? (
                        <>
                          <span>{e.ev.gift.emoji}</span>
                          <span className="min-w-0 truncate font-medium">@{e.ev.sender}</span>
                          <span className="min-w-0 truncate text-ink-muted">
                            {e.ev.gift.name}
                            {e.ev.count > 1 ? ` ×${e.ev.count}` : ""}
                          </span>
                          <span className="ml-auto shrink-0 text-[11px] text-ink-faint">🪙 {(e.ev.gift.coins * e.ev.count).toLocaleString()}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-ink-faint">💬</span>
                          <span className="min-w-0 truncate font-medium">@{e.ev.sender}</span>
                          <span className="min-w-0 truncate text-ink-muted">“{e.ev.text}”</span>
                        </>
                      )}
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
