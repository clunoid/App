"use client";

/**
 * The SHOWTIME STAGE — the 3D PENALTY SHOOTOUT broadcast (v2, continuous flow).
 *
 * Captured into TikTok LIVE Studio (browser/window source, 9:16). Subscribes to
 * the Realtime bus (gifts + chat), runs the deterministic engine, renders the
 * three.js stadium underneath and a broadcast overlay on top:
 *  · FIFA-style DIRECTION MARKERS projected onto the actual 3D goal zones — the
 *    left gift sits on the left of the goal, right on the right, with live vote
 *    shares. Comments LEFT/CENTER/RIGHT vote free.
 *  · Boost rails: shooter power (bottom-left) vs keeper reach/instinct
 *    (bottom-right) — expensive gifts, bigger boosts, live meters.
 *  · Compact scoreboard with per-kick dots, kick counter, phase countdown.
 *  · Voting never closes: gifts and comments count at any moment and are
 *    consumed when the next kick launches.
 *  · Full procedural broadcast audio: crowd bed, whistle, contact, saves, roars.
 * Fully automated forever — zero votes means the stars play on their own.
 */
import { useEffect, useRef, useState } from "react";
import { createBus, type ShowtimeBus } from "@/lib/showtime/bus";
import type { CatalogGift, ChatEvent, GiftEvent } from "@/lib/showtime/types";
import { normalizeGift } from "@/lib/showtime/gifts";
import { PenaltyGame, type PenaltyEvent, type PenaltyState } from "@/lib/showtime/game/penalty";
import { PenaltyScene, type ZoneAnchor } from "@/lib/showtime/game/scene";
import { MatchAudio } from "@/lib/showtime/game/audio";
import { PLAYERS, ZONE_GIFT_KEY, type Zone } from "@/lib/showtime/game/config";

const SIM_STEP_MS = 1000 / 30;

type Catalog = Map<string, CatalogGift>;

type Banner = { text: string; sub: string; tone: "goal" | "save" | "info"; seq: number; ms: number };

type Ui = {
  state: PenaltyState;
  banner: Banner | null;
  ticker: string | null;
  anchors: ZoneAnchor[];
  audioSuspended: boolean;
};

const ZONE_WORD: Record<Zone, string> = { left: "LEFT", center: "CENTER", right: "RIGHT" };

function GiftChip({ g, size = 30 }: { g?: CatalogGift; size?: number }) {
  if (!g) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/95 py-0.5 pl-1 pr-2 shadow">
      {g.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={g.image} alt={g.name} width={size} height={size} style={{ width: size, height: size }} className="rounded-full" />
      ) : (
        <span className="grid place-items-center rounded-full bg-amber-300 font-black text-amber-900" style={{ width: size, height: size, fontSize: size * 0.4 }}>
          G
        </span>
      )}
      <span className="text-[12px] font-extrabold text-amber-600">{g.coins.toLocaleString()}</span>
    </span>
  );
}

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
    const muted = hash.get("muted") === "1" || search.get("muted") === "1";
    const holder = holderRef.current!;

    const game = new PenaltyGame(20260712);
    const scene = new PenaltyScene(holder);
    const audio = new MatchAudio(muted);
    audio.arm();
    const bus: ShowtimeBus = createBus(k);

    let disposed = false;
    const pendingGifts: GiftEvent[] = [];
    const pendingChats: ChatEvent[] = [];
    let ticker: string | null = null;
    let tickerUntil = 0;
    let banner: Banner | null = null;
    let bannerUntil = 0;
    let bannerSeq = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const showBanner = (text: string, sub: string, tone: Banner["tone"], ms: number, now: number) => {
      banner = { text, sub, tone, seq: ++bannerSeq, ms };
      bannerUntil = now + ms;
    };

    // audio unlock is retried continuously (capture browsers rarely receive clicks),
    // and the console preview controls mute via same-origin postMessage
    const armTimer = window.setInterval(() => {
      if (!audio.isRunning()) audio.arm();
    }, 2000);
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; muted?: boolean } | null;
      if (d?.type === "showtime-audio") audio.setMuted(!!d.muted);
    };
    window.addEventListener("message", onMsg);

    const offBus = bus.onEvent((e) => {
      if (e.kind === "gift") pendingGifts.push(e.ev);
      else pendingChats.push(e.ev);
    });

    // rehearsal hooks
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

    const say = (line: string, ms = 3000) => {
      ticker = line;
      tickerUntil = performance.now() + ms;
    };

    const handle = (evs: PenaltyEvent[], now: number) => {
      if (!evs.length) return;
      scene.onEvents(evs);
      for (const e of evs) {
        switch (e.kind) {
          case "vote":
            say(`${e.sender} → ${ZONE_WORD[e.zone]}${e.coins ? ` (+${e.coins.toLocaleString()})` : ""}`);
            break;
          case "boost":
            say(`${e.sender} boosts ${e.type === "power" ? "SHOT POWER" : e.type === "reach" ? "KEEPER REACH" : "KEEPER INSTINCT"} +${e.coins.toLocaleString()}`);
            break;
          case "jumbotron":
            say(`⭐ ${e.sender} lights up the jumbotron!`, 5000);
            break;
          case "kickoff":
            // the ONLY sound: the referee's whistle a beat before the strike
            timeouts.push(setTimeout(() => audio.whistle(), 150));
            break;
          case "result": {
            const sName = PLAYERS[e.rec.shooter].name;
            const kName = PLAYERS[e.rec.shooter === "ronaldo" ? "messi" : "ronaldo"].name;
            if (e.rec.goal) showBanner("GOAL!", `${sName} beats ${kName}`, "goal", 2600, now);
            else showBanner("SAVED!", `${kName} denies ${sName}`, "save", 2600, now);
            break;
          }
          case "phase":
            if (e.phase === "vote" && game.state.suddenDeath) showBanner("SUDDEN DEATH", "next goal decides it", "info", 2400, now);
            break;
          case "matchEnd":
            showBanner(`${PLAYERS[e.winner].name} WINS!`, `final score ${e.score.ronaldo}–${e.score.messi}`, "goal", 4200, now);
            break;
        }
      }
    };

    /* engine loop with timer pump (throttled capture browsers can't stall it) */
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

    // UI snapshot at 10Hz (no on-screen timer — the shootout is gift-gated)
    const uiTimer = window.setInterval(() => {
      const now = performance.now();
      if (banner && now > bannerUntil) banner = null;
      if (ticker && now > tickerUntil) ticker = null;
      const st = game.state;
      setUi({
        state: { ...st, score: { ...st.score }, shotVotes: { ...st.shotVotes } },
        banner,
        ticker,
        anchors: scene.zoneAnchors(),
        audioSuspended: audio.isSuspended(),
      });
    }, 100);

    const arm = () => audio.arm();
    window.addEventListener("pointerdown", arm);
    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(pump);
      window.clearInterval(uiTimer);
      window.clearInterval(armTimer);
      timeouts.forEach(clearTimeout);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("message", onMsg);
      offBus();
      bus.close();
      scene.dispose();
      audio.dispose();
    };
  }, []);

  const st = ui?.state;
  const g = (key: string) => catalog.get(key);

  const shooterId = st
    ? st.phase === "kick" || st.phase === "result"
      ? st.kickIndex % 2 === 0
        ? st.shootsFirst
        : st.shootsFirst === "ronaldo"
          ? "messi"
          : "ronaldo"
      : st.kickIndex % 2 === 0
        ? st.shootsFirst
        : st.shootsFirst === "ronaldo"
          ? "messi"
          : "ronaldo"
    : "ronaldo";
  const shooter = PLAYERS[shooterId];
  const keeperP = PLAYERS[shooterId === "ronaldo" ? "messi" : "ronaldo"];

  const shotTotal = st ? Math.max(1, st.shotVotes.left + st.shotVotes.center + st.shotVotes.right) : 1;
  const leadZone: Zone | null = st
    ? ((["left", "center", "right"] as Zone[]).reduce((a, b) => (st.shotVotes[b] > st.shotVotes[a] ? b : a)) as Zone)
    : null;
  const anyVotes = st ? st.shotVotes.left + st.shotVotes.center + st.shotVotes.right > 0 : false;

  const dots = (p: "ronaldo" | "messi") => {
    if (!st) return [] as ("goal" | "miss" | "pending")[];
    const rows: ("goal" | "miss" | "pending")[] = [];
    const taken = st.kicks.filter((kk) => kk.shooter === p);
    // 12 kicks each — show up to 12 result dots (score number carries any sudden-death extras)
    const n = Math.min(12, Math.max(6, taken.length));
    for (let i = 0; i < n; i++) rows.push(i < taken.length ? (taken[i].goal ? "goal" : "miss") : "pending");
    return rows;
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
          <div className="pointer-events-none absolute inset-x-0 top-2.5 flex justify-center">
            <div className="flex items-center gap-2.5 rounded-2xl bg-white/97 px-3.5 py-1.5 shadow-lg">
              <div className="text-right">
                <div className="text-[14px] font-black leading-tight" style={{ color: PLAYERS.ronaldo.accent }}>
                  RONALDO
                </div>
                <div className="flex justify-end gap-[3px] pt-0.5">
                  {dots("ronaldo").map((d, i) => (
                    <span key={i} className={`h-1 w-1 rounded-full ${d === "goal" ? "bg-emerald-500" : d === "miss" ? "bg-red-400" : "bg-black/15"}`} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-[#101826] px-2.5 py-0.5 text-[19px] font-black tabular-nums text-white">
                {st.score.ronaldo}–{st.score.messi}
              </div>
              <div>
                <div className="text-[14px] font-black leading-tight" style={{ color: PLAYERS.messi.accent }}>
                  MESSI
                </div>
                <div className="flex gap-[3px] pt-0.5">
                  {dots("messi").map((d, i) => (
                    <span key={i} className={`h-1 w-1 rounded-full ${d === "goal" ? "bg-emerald-500" : d === "miss" ? "bg-red-400" : "bg-black/15"}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* phase strip (no timer — the shootout is gift-gated) */}
          <div className="pointer-events-none absolute inset-x-0 top-[58px] flex justify-center">
            <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 backdrop-blur-sm">
              <span className="whitespace-nowrap text-[11.5px] font-bold uppercase tracking-widest text-white/90">
                {st.phase === "vote" && `Kick ${st.kicks.length + 1}${st.suddenDeath ? " · sudden death" : ""} · ${shooter.name} — send a gift to shoot`}
                {st.phase === "kick" && `${shooter.name} steps up…`}
                {st.phase === "result" && (st.lastKick?.goal ? `${shooter.name} scores!` : `${keeperP.name} saves!`)}
                {st.phase === "matchEnd" && `Match ${st.matchNumber} · final`}
              </span>
            </div>
          </div>

          {/* ── FIFA-style zone markers, anchored to the real 3D goal ── */}
          {st.phase === "vote" &&
            ui!.anchors.map((a) => {
              const zone = a.zone;
              const share = st.shotVotes[zone] / shotTotal;
              const leading = anyVotes && leadZone === zone;
              return (
                <div
                  key={zone}
                  className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center gap-1"
                  style={{ left: `${a.x}%`, top: `${a.y}%`, transform: "translate(-50%, -46%)" }}
                >
                  {/* target marker */}
                  <div
                    className={`grid h-12 w-12 place-items-center rounded-full border-4 transition-all duration-300 ${leading ? "scale-110" : ""}`}
                    style={{
                      borderColor: leading ? "#FFD75E" : "rgba(255,255,255,0.85)",
                      background: leading ? "rgba(255,215,94,0.25)" : "rgba(16,24,38,0.35)",
                      boxShadow: leading ? "0 0 18px rgba(255,215,94,0.7)" : "0 2px 8px rgba(0,0,0,0.4)",
                    }}
                  >
                    <span className="text-[13px] font-black text-white drop-shadow">{anyVotes ? `${Math.round(share * 100)}%` : ZONE_WORD[zone][0]}</span>
                  </div>
                  {leading && <div className="-mt-0.5 h-0 w-0 border-x-8 border-t-8 border-x-transparent" style={{ borderTopColor: "#FFD75E" }} />}
                  <GiftChip g={g(ZONE_GIFT_KEY[zone])} size={26} />
                  <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm">
                    “{ZONE_WORD[zone].toLowerCase()}”
                  </span>
                </div>
              );
            })}

          {/* ── broadcast lower-third banner ── */}
          {ui?.banner && (
            <div key={ui.banner.seq} className="pointer-events-none absolute inset-x-0 top-[57%] overflow-hidden">
              <div className="st-banner" style={{ animationDuration: `${ui.banner.ms}ms` }}>
                <div
                  className="st-banner-main"
                  style={{
                    background:
                      ui.banner.tone === "goal"
                        ? "linear-gradient(100deg, #0C8F52 0%, #12B76A 55%, #0C8F52 100%)"
                        : ui.banner.tone === "save"
                          ? "linear-gradient(100deg, #B45309 0%, #F59E0B 55%, #B45309 100%)"
                          : "linear-gradient(100deg, #9F1239 0%, #E5484D 55%, #9F1239 100%)",
                  }}
                >
                  <span className="st-banner-text">{ui.banner.text}</span>
                </div>
                <div className="st-banner-sub">{ui.banner.sub}</div>
              </div>
              <style>{`
                .st-banner{display:flex;flex-direction:column;align-items:flex-start;padding-left:7%;animation-name:stSweep;animation-timing-function:linear;animation-fill-mode:both}
                .st-banner-main{clip-path:polygon(0 0,100% 0,94% 100%,0 100%);padding:6px 54px 8px 26px;box-shadow:0 10px 30px rgba(0,0,0,.45)}
                .st-banner-text{font-size:42px;font-weight:900;font-style:italic;letter-spacing:.04em;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.25)}
                .st-banner-sub{margin-top:4px;margin-left:8px;clip-path:polygon(0 0,100% 0,96% 100%,0 100%);background:rgba(10,16,28,.88);color:rgba(255,255,255,.92);font-size:14px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:4px 34px 4px 18px}
                @keyframes stSweep{0%{transform:translateX(-115%);opacity:0}9%{transform:translateX(1.5%);opacity:1}13%{transform:translateX(0)}86%{transform:translateX(0);opacity:1}100%{transform:translateX(115%);opacity:0}}
              `}</style>
            </div>
          )}

          {/* ── boost rails (always visible outside matchEnd — voting never closes) ── */}
          {st.phase !== "matchEnd" && (
            <>
              <div className="pointer-events-none absolute bottom-16 left-2.5 w-[168px] rounded-xl bg-[#101826]/88 p-2.5 shadow-xl backdrop-blur-sm">
                <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: shooter.accent }}>
                  {shooter.name} · shot
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <GiftChip g={g("money gun")} size={24} />
                  <GiftChip g={g("galaxy")} size={24} />
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-[#FF8A3C] transition-all duration-300" style={{ width: `${Math.round(Math.min(1, st.powerCoins / 2000) * 100)}%` }} />
                </div>
                <div className="mt-0.5 text-[9.5px] font-bold text-white/55">POWER — faster shot</div>
              </div>

              <div className="pointer-events-none absolute bottom-16 right-2.5 w-[168px] rounded-xl bg-[#101826]/88 p-2.5 text-right shadow-xl backdrop-blur-sm">
                <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: keeperP.accent }}>
                  {keeperP.name} · keeper
                </div>
                <div className="mt-1.5 flex items-center justify-end gap-1.5">
                  <GiftChip g={g("corgi")} size={24} />
                  <GiftChip g={g("lion")} size={24} />
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/15">
                  <div className="ml-auto h-full rounded-full bg-[#4ED6A4] transition-all duration-300" style={{ width: `${Math.round(Math.min(1, st.reachCoins / 2000) * 100)}%` }} />
                </div>
                <div className="mt-0.5 text-[9.5px] font-bold text-white/55">REACH — longer dive</div>
                {st.instinctCoins > 0 && <div className="mt-0.5 text-[9.5px] font-black text-amber-300">INSTINCT ARMED</div>}
              </div>
            </>
          )}

          {/* ── match end ── */}
          {st.phase === "matchEnd" && st.winner && (
            <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-4">
              <div className="rounded-2xl bg-white/97 px-5 py-3 text-center shadow-xl">
                <div className="text-[22px] font-black" style={{ color: PLAYERS[st.winner].accent }}>
                  {PLAYERS[st.winner].name} WINS {st.score.ronaldo}–{st.score.messi}
                </div>
                {st.mvp && (
                  <div className="mt-0.5 text-[12px] font-bold text-black/60">
                    Top supporter: {st.mvp.name} · {st.mvp.coins.toLocaleString()} coins
                  </div>
                )}
                <div className="mt-0.5 text-[11px] font-semibold text-black/50">Next match starting — voting is already open</div>
              </div>
            </div>
          )}

          {/* ── bottom line: ticker / hint ── */}
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex flex-col items-center gap-1 px-4">
            {ui!.ticker ? (
              <div className="max-w-[520px] truncate rounded-full bg-black/55 px-3 py-1 text-center text-[12px] font-bold text-white/95 backdrop-blur-sm">{ui!.ticker}</div>
            ) : (
              <div className="rounded-full bg-black/40 px-3 py-1 text-center text-[11px] font-bold text-white/70 backdrop-blur-sm">
                Send a gift to take the kick · comment LEFT · CENTER · RIGHT to aim it
              </div>
            )}
            {st.jumbotron && (
              <div className="max-w-[520px] truncate text-center text-[10px] font-black uppercase tracking-widest text-amber-300">
                ⭐ Legendary supporter: {st.jumbotron}
              </div>
            )}
          </div>

          {/* sound is blocked until a click reaches this window */}
          {ui!.audioSuspended && (
            <div className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white/85 backdrop-blur-sm">
              🔊 click for sound
            </div>
          )}
        </>
      )}
    </div>
  );
}
