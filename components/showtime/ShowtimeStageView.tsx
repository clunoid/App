"use client";

/**
 * The SHOWTIME STAGE — the 3D PENALTY SHOOTOUT broadcast. This page is captured
 * into TikTok LIVE Studio (browser/window source, 9:16). It subscribes to the
 * Realtime bus (gifts + chat from the console's Euler feed or simulator), runs the
 * deterministic match engine, renders the three.js stadium underneath, and lays a
 * clean broadcast UI on top: scoreboard with kick dots, phase countdown, and the
 * step-by-step VOTE GUIDE showing the real TikTok gifts (official icons, live coin
 * values from /api/showtime/gifts) so viewers always know exactly how to play.
 *
 * Fully automated: the match loop never needs an operator; with no votes the
 * shot/dive fall back to seeded randomness, so the show never stalls.
 */
import { useEffect, useRef, useState } from "react";
import { createBus, type ShowtimeBus } from "@/lib/showtime/bus";
import type { CatalogGift, ChatEvent, GiftEvent } from "@/lib/showtime/types";
import { normalizeGift } from "@/lib/showtime/gifts";
import { PenaltyGame, type PenaltyEvent, type PenaltyState } from "@/lib/showtime/game/penalty";
import { PenaltyScene } from "@/lib/showtime/game/scene";
import { PLAYERS, type Zone } from "@/lib/showtime/game/config";

const SIM_STEP_MS = 1000 / 30;

type Catalog = Map<string, CatalogGift>;

type Ui = {
  state: PenaltyState;
  remainingS: number;
  banner: { text: string; tone: "goal" | "save" | "info" } | null;
  ticker: string[];
};

/* ── tiny UI atoms ──────────────────────────────────────────────────────── */

function GiftChip({ g, size = 44 }: { g?: CatalogGift; size?: number }) {
  if (!g) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 py-1 pl-1.5 pr-2.5 shadow-sm">
      {g.image ? (
        // official TikTok CDN gift art (verified hotlinkable, ACAO: *)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={g.image} alt={g.name} width={size / 2} height={size / 2} style={{ width: size / 2, height: size / 2 }} className="rounded-full" />
      ) : (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-300 text-[10px] font-black text-amber-900">G</span>
      )}
      <span className="text-[13px] font-bold text-[#1F2933]">{g.name}</span>
      <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-extrabold text-amber-700">{g.coins.toLocaleString()}</span>
    </span>
  );
}

function VoteBar({ share, color }: { share: number; color: string }) {
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/15">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(share * 100)}%`, background: color }} />
    </div>
  );
}

function Meter({ label, value01, color }: { label: string; value01: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right text-[11px] font-extrabold tracking-wide text-white/85">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(value01 * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── the stage ──────────────────────────────────────────────────────────── */

export function ShowtimeStageView() {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [catalog, setCatalog] = useState<Catalog>(new Map());
  const [ui, setUi] = useState<Ui | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const k = hash.get("k") || search.get("k") || "";
    if (!k) {
      setNoKey(true);
      return;
    }
    const holder = holderRef.current!;

    const game = new PenaltyGame(20260712);
    const scene = new PenaltyScene(holder);
    const bus: ShowtimeBus = createBus(k);

    let disposed = false;
    const pendingGifts: GiftEvent[] = [];
    const pendingChats: ChatEvent[] = [];
    const tickerRef: string[] = [];
    let banner: Ui["banner"] = null;
    let bannerUntil = 0;

    const offBus = bus.onEvent((e) => {
      if (e.kind === "gift") pendingGifts.push(e.ev);
      else pendingChats.push(e.ev);
    });

    // rehearsal hook: __penaltyInject("gift","Rose",1,"fan1") / ("chat","left","fan2")
    (window as unknown as Record<string, unknown>).__penaltyInject = (kind: string, a?: string, coins?: number, sender?: string) => {
      const who = sender || "tester" + ((Math.random() * 90) | 0);
      if (kind === "gift") pendingGifts.push(normalizeGift(String(a ?? "Rose"), Number(coins) || 1, who, 1));
      else pendingChats.push({ sender: who, text: String(a ?? "left"), ts: Date.now() });
    };
    (window as unknown as Record<string, unknown>).__penaltyProbe = () => ({
      phase: game.state.phase,
      clock: Math.round(game.state.clock),
      kick: game.state.kickIndex,
      score: game.state.score,
      idle: game.state.idle,
    });

    void fetch("/api/showtime/gifts")
      .then((r) => r.json())
      .then((d: { gifts?: (CatalogGift & { key: string })[] }) => {
        if (disposed || !d.gifts) return;
        const m: Catalog = new Map();
        for (const g of d.gifts) m.set(g.key, g);
        setCatalog(m);
      })
      .catch(() => {});

    const describe = (e: PenaltyEvent): string | null => {
      switch (e.kind) {
        case "vote":
          return `${e.sender} → ${e.label.toUpperCase()}${e.coins ? ` (+${e.coins.toLocaleString()})` : ""}`;
        case "boost":
          return `${e.sender} boosts ${e.type.toUpperCase()} +${e.coins.toLocaleString()}`;
        case "jumbotron":
          return `⭐ ${e.sender} lights up the jumbotron!`;
        default:
          return null;
      }
    };

    const handle = (evs: PenaltyEvent[], now: number) => {
      if (!evs.length) return;
      scene.onEvents(evs);
      for (const e of evs) {
        const line = describe(e);
        if (line) {
          tickerRef.unshift(line);
          if (tickerRef.length > 4) tickerRef.pop();
        }
        if (e.kind === "result") {
          banner = e.rec.goal ? { text: "GOAL!", tone: "goal" } : { text: "SAVED!", tone: "save" };
          bannerUntil = now + 2600;
        }
        if (e.kind === "phase" && e.phase === "vote" && game.state.suddenDeath) {
          banner = { text: "SUDDEN DEATH", tone: "info" };
          bannerUntil = now + 2200;
        }
        if (e.kind === "matchEnd") {
          banner = { text: `${PLAYERS[e.winner].name} WINS!`, tone: "goal" };
          bannerUntil = now + 4000;
        }
      }
    };

    /* engine loop: fixed-step sim + 60fps render, with a timer pump so hidden/
       throttled capture browsers can never stall the match */
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const advance = (now: number) => {
      if (disposed) return;
      acc += Math.min(2000, now - last);
      last = now;
      while (pendingGifts.length) handle(game.onGift(pendingGifts.shift()!), now);
      while (pendingChats.length) handle(game.onChat(pendingChats.shift()!), now);
      while (acc >= SIM_STEP_MS) {
        handle(game.tick(SIM_STEP_MS), now);
        acc -= SIM_STEP_MS;
      }
      scene.render(game.state, now);
    };
    const loop = (now: number) => {
      if (disposed) return;
      advance(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const pump = window.setInterval(() => {
      const now = performance.now();
      if (now - last > 200) advance(now);
    }, 100);

    // UI snapshot at 10Hz (overlays are cheap DOM; the 3D runs imperatively)
    const uiTimer = window.setInterval(() => {
      const now = performance.now();
      if (banner && now > bannerUntil) banner = null;
      const st = game.state;
      setUi({
        state: { ...st, score: { ...st.score }, shotVotes: { ...st.shotVotes }, keeperVotes: { ...st.keeperVotes }, roleVotes: { ...st.roleVotes } },
        remainingS: Math.max(0, (st.phaseEndsAt - st.clock) / 1000),
        banner,
        ticker: [...tickerRef],
      });
    }, 100);

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(pump);
      window.clearInterval(uiTimer);
      window.removeEventListener("resize", onResize);
      offBus();
      bus.close();
      scene.dispose();
    };
  }, []);

  const st = ui?.state;
  const g = (key: string) => catalog.get(key);

  const shooterId = st ? (st.phase === "kick" || st.phase === "result" ? (st.kickIndex % 2 === 0 ? st.shootsFirst : st.shootsFirst === "ronaldo" ? "messi" : "ronaldo") : st.kickIndex % 2 === 0 ? st.shootsFirst : st.shootsFirst === "ronaldo" ? "messi" : "ronaldo") : "ronaldo";
  const shooter = PLAYERS[shooterId];
  const keeperP = PLAYERS[shooterId === "ronaldo" ? "messi" : "ronaldo"];

  const shotTotal = st ? Math.max(1, st.shotVotes.left + st.shotVotes.center + st.shotVotes.right) : 1;
  const roleTotal = st ? Math.max(1, st.roleVotes.ronaldo + st.roleVotes.messi) : 1;

  const dots = (p: "ronaldo" | "messi") => {
    if (!st) return [];
    const rows: ("goal" | "miss" | "pending")[] = [];
    const taken = st.kicks.filter((kk) => kk.shooter === p);
    const n = Math.max(5, taken.length + (st.suddenDeath ? 1 : 0));
    for (let i = 0; i < n; i++) rows.push(i < taken.length ? (taken[i].goal ? "goal" : "miss") : "pending");
    return rows.slice(0, Math.max(5, taken.length));
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0B1730]">
      <div ref={holderRef} className="absolute inset-0" />

      {noKey && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <p className="max-w-sm rounded-xl bg-white/95 p-4 text-[13px] font-medium text-[#1F2933]">
            This stage needs its link from the Showtime console. Open <b>Showtime → Copy OBS URL</b> and use it as your browser/window source.
          </p>
        </div>
      )}

      {st && (
        <>
          {/* ── scoreboard ── */}
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <div className="flex items-center gap-3 rounded-2xl bg-white/97 px-4 py-2 shadow-lg">
              <div className="text-right">
                <div className="text-[15px] font-black leading-tight" style={{ color: PLAYERS.ronaldo.accent }}>
                  RONALDO <span className="text-[10px] font-extrabold text-black/40">7</span>
                </div>
                <div className="flex justify-end gap-1 pt-0.5">
                  {dots("ronaldo").map((d, i) => (
                    <span key={i} className={`h-2 w-2 rounded-full ${d === "goal" ? "bg-emerald-500" : d === "miss" ? "bg-red-400" : "bg-black/15"}`} />
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-[#101826] px-3 py-1 text-[22px] font-black tabular-nums text-white">
                {st.score.ronaldo} — {st.score.messi}
              </div>
              <div>
                <div className="text-[15px] font-black leading-tight" style={{ color: PLAYERS.messi.accent }}>
                  MESSI <span className="text-[10px] font-extrabold text-black/40">10</span>
                </div>
                <div className="flex gap-1 pt-0.5">
                  {dots("messi").map((d, i) => (
                    <span key={i} className={`h-2 w-2 rounded-full ${d === "goal" ? "bg-emerald-500" : d === "miss" ? "bg-red-400" : "bg-black/15"}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* phase strip + countdown */}
          <div className="pointer-events-none absolute inset-x-0 top-[66px] flex justify-center">
            <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1 backdrop-blur-sm">
              <span className="text-[12px] font-bold uppercase tracking-widest text-white/90">
                {st.phase === "role" && "Vote who shoots first"}
                {st.phase === "vote" && `Kick ${st.kicks.length + 1}${st.suddenDeath ? " · sudden death" : ""} — ${shooter.name} shoots, ${keeperP.name} keeps`}
                {st.phase === "kick" && `${shooter.name} steps up…`}
                {st.phase === "result" && (st.lastKick?.goal ? `${shooter.name} scores!` : `${keeperP.name} saves!`)}
                {st.phase === "matchEnd" && `Match ${st.matchNumber} final`}
              </span>
              {(st.phase === "role" || st.phase === "vote") && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[13px] font-black tabular-nums text-[#101826]">{ui!.remainingS.toFixed(0)}s</span>
              )}
            </div>
          </div>

          {/* ── result banner ── */}
          {ui?.banner && (
            <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center">
              <div
                className={`rounded-2xl px-8 py-3 text-[46px] font-black tracking-wide text-white shadow-2xl ${
                  ui.banner.tone === "goal" ? "bg-emerald-500/95" : ui.banner.tone === "save" ? "bg-amber-500/95" : "bg-[#E5484D]/95"
                }`}
              >
                {ui.banner.text}
              </div>
            </div>
          )}

          {/* ── voting guide (phase-scoped: the game tells viewers exactly what to send) ── */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-3">
            {st.phase === "role" && (
              <div className="mx-auto max-w-[560px] rounded-2xl bg-white/97 p-3 shadow-xl">
                <div className="grid grid-cols-2 gap-3">
                  {(["ronaldo", "messi"] as const).map((p) => (
                    <div key={p} className="rounded-xl border-2 p-2.5" style={{ borderColor: PLAYERS[p].accent }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[17px] font-black" style={{ color: PLAYERS[p].accent }}>
                          {PLAYERS[p].name} {PLAYERS[p].number}
                        </span>
                        <span className="text-[12px] font-bold text-black/50">{Math.round(((st.roleVotes[p] || 0) / roleTotal) * 100)}%</span>
                      </div>
                      <VoteBar share={(st.roleVotes[p] || 0) / roleTotal} color={PLAYERS[p].accent} />
                      <div className="mt-2 flex items-center gap-1.5">
                        <GiftChip g={g(p === "ronaldo" ? "rose" : "tiktok")} />
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-black/55">or comment “{p === "ronaldo" ? "ronaldo / 7" : "messi / 10"}”</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-center text-[12px] font-bold text-black/60">The winner shoots first — the other keeps goal. They swap every kick.</div>
              </div>
            )}

            {st.phase === "vote" && (
              <div className="mx-auto max-w-[560px] space-y-2">
                {/* SHOT panel */}
                <div className="rounded-2xl bg-white/97 p-3 shadow-xl">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[13px] font-black uppercase tracking-wide" style={{ color: shooter.accent }}>
                      Where should {shooter.name} shoot?
                    </span>
                    <span className="text-[11px] font-bold text-black/50">comments + gifts vote</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["left", "LEFT", "rose"],
                        ["center", "CENTER", "tiktok"],
                        ["right", "RIGHT", "ice cream cone"],
                      ] as [Zone, string, string][]
                    ).map(([z, label, key]) => (
                      <div key={z} className="rounded-xl bg-black/[0.05] p-2 text-center">
                        <div className="text-[15px] font-black text-[#101826]">{label}</div>
                        <VoteBar share={st.shotVotes[z] / shotTotal} color={shooter.accent} />
                        <div className="mt-1.5 flex justify-center">
                          <GiftChip g={g(key)} size={38} />
                        </div>
                        <div className="mt-1 text-[10px] font-bold text-black/50">or comment “{z}”</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* KEEPER + BOOSTS strip */}
                <div className="rounded-2xl bg-[#101826]/92 p-3 shadow-xl backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-black uppercase tracking-wide text-white/90">Guide {keeperP.name}’s dive</span>
                    <span className="text-[10px] font-bold text-white/50">no votes → he guesses</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-white/70">LEFT</span>
                    <GiftChip g={g("perfume")} size={36} />
                    <span className="ml-1 text-[11px] font-bold text-white/70">CENTER</span>
                    <GiftChip g={g("doughnut")} size={36} />
                    <span className="ml-1 text-[11px] font-bold text-white/70">RIGHT</span>
                    <GiftChip g={g("hand hearts")} size={36} />
                  </div>
                  <div className="mt-2 space-y-1">
                    <Meter label="POWER" value01={Math.min(1, st.powerCoins / 2000)} color="#FF8A3C" />
                    <Meter label="REACH" value01={Math.min(1, st.reachCoins / 2000)} color="#4ED6A4" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase text-white/60">Boosts</span>
                    <GiftChip g={g("money gun")} size={34} />
                    <GiftChip g={g("galaxy")} size={34} />
                    <span className="text-[10px] font-bold text-white/60">→ rocket shot ·</span>
                    <GiftChip g={g("corgi")} size={34} />
                    <span className="text-[10px] font-bold text-white/60">→ keeper reach ·</span>
                    <GiftChip g={g("lion")} size={34} />
                    <span className="text-[10px] font-bold text-white/60">→ keeper reads it</span>
                  </div>
                </div>
              </div>
            )}

            {st.phase === "matchEnd" && st.winner && (
              <div className="mx-auto max-w-[560px] rounded-2xl bg-white/97 p-4 text-center shadow-xl">
                <div className="text-[24px] font-black" style={{ color: PLAYERS[st.winner].accent }}>
                  {PLAYERS[st.winner].name} WINS THE SHOOTOUT {st.score.ronaldo}–{st.score.messi}
                </div>
                {st.mvp && (
                  <div className="mt-1 text-[13px] font-bold text-black/60">
                    Top supporter: {st.mvp.name} · {st.mvp.coins.toLocaleString()} coins
                  </div>
                )}
                <div className="mt-1 text-[12px] font-semibold text-black/50">Next match starting — vote who shoots first!</div>
              </div>
            )}

            {/* ticker */}
            {ui!.ticker.length > 0 && st.phase !== "matchEnd" && (
              <div className="mx-auto mt-2 max-w-[560px] truncate rounded-full bg-black/45 px-3 py-1 text-center text-[12px] font-bold text-white/90 backdrop-blur-sm">
                {ui!.ticker[0]}
              </div>
            )}

            {/* jumbotron supporter */}
            {st.jumbotron && (
              <div className="mx-auto mt-1 max-w-[560px] truncate text-center text-[11px] font-black uppercase tracking-widest text-amber-300">
                ⭐ Legendary supporter: {st.jumbotron}
              </div>
            )}

            {st.idle && (st.phase === "role" || st.phase === "vote") && (
              <div className="mx-auto mt-1 max-w-[560px] text-center text-[11px] font-bold text-white/60">
                The stars play on their own until you vote — every comment counts.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
