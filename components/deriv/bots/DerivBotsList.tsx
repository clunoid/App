"use client";

/**
 * DERIV BOTS — the catalog. A card per bot (BotsLab order); opening a card goes to
 * that bot's own trading page. Reuses the command-center Deriv connection; with no
 * connection at all it bounces to the command center.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Loader2, Star, ChevronRight } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { loadDerivAccess } from "@/lib/deriv/oauth";
import { BOTS, type BotBadge } from "@/lib/deriv/bots/registry";

const BADGE_STYLE: Record<BotBadge, { bg: string; color: string }> = {
  Recommended: { bg: "rgba(56,189,248,0.18)", color: "#38bdf8" },
  Popular: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  Beginner: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  Fast: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  Stable: { bg: "rgba(168,85,247,0.15)", color: "#c084fc" },
};

export function DerivBotsList() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const simClicks = useRef(0);
  const simResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSim = () => {
    simClicks.current = 0;
    if (simResetTimer.current) clearTimeout(simResetTimer.current);
    router.push("/trading/deriv/bots/sim");
  };

  /** Two quick clicks on the "b" — onDoubleClick is unreliable on touch / some browsers. */
  const onSimLetterClick = () => {
    simClicks.current += 1;
    if (simResetTimer.current) clearTimeout(simResetTimer.current);
    simResetTimer.current = setTimeout(() => { simClicks.current = 0; }, 600);
    if (simClicks.current >= 2) openSim();
  };

  useEffect(() => {
    if (!loadDerivAccess()) { router.replace("/trading/command"); return; }
    setReady(true);
    // Arriving here from a paid page's "use free bots" exit while linked: greet
    // them with a success confirmation, then strip the flag so a refresh is clean.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1") {
      setWelcome(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [router]);

  if (!ready) {
    return (
      <main className="grid min-h-[100dvh] place-items-center" style={{ background: TC.bg, color: TC.text }}>
        <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}>
          <Loader2 size={16} className="animate-spin" style={{ color: TC.profit }} /> Loading…
        </span>
      </main>
    );
  }

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      {welcome && (
        <div role="dialog" aria-modal="true" aria-labelledby="deriv-welcome-title"
          className="fixed inset-0 z-50 grid place-items-center p-5"
          style={{ background: "rgba(4,10,20,0.72)", backdropFilter: "blur(3px)" }}
          onClick={() => setWelcome(false)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-[380px] rounded-2xl border p-6 text-center"
            style={{ borderColor: "rgba(52,211,153,0.45)", background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
            <style>{`
              @keyframes clnPop { 0% { transform: scale(0.6); opacity: 0 } 60% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
              @keyframes clnRing { 0% { transform: scale(0.7); opacity: 0.5 } 100% { transform: scale(1.6); opacity: 0 } }
              @keyframes clnDraw { to { stroke-dashoffset: 0 } }
            `}</style>
            <div className="relative mx-auto grid h-16 w-16 place-items-center" style={{ animation: "clnPop 0.45s ease-out both" }}>
              <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: "rgba(52,211,153,0.28)", animation: "clnRing 0.9s ease-out 0.2s both" }} />
              <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: "rgba(52,211,153,0.14)" }}>
                <svg width="38" height="38" viewBox="0 0 52 52" aria-hidden>
                  <circle cx="26" cy="26" r="23" fill="none" stroke="#34d399" strokeWidth="3" style={{ strokeDasharray: 145, strokeDashoffset: 145, animation: "clnDraw 0.5s ease-out 0.1s forwards" }} />
                  <path d="M15 27 l7.5 7.5 L38 19" fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 40, strokeDashoffset: 40, animation: "clnDraw 0.35s ease-out 0.5s forwards" }} />
                </svg>
              </span>
            </div>
            <h3 id="deriv-welcome-title" className="mt-4 text-[18px] font-bold" style={{ color: "#34d399" }}>You&rsquo;re in — free bots unlocked</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: TC.muted }}>
              You&rsquo;ve successfully accessed our free, fully automated trading bots. Choose any one below to start.
            </p>
            <button onClick={() => setWelcome(false)} className="mt-4 w-full rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: "#34d399", color: TC.ink }}>
              Choose a bot
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]"><Bot size={16} style={{ color: TC.profit }} /> DERIV BOTS</span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">
            Choose a <span
              role="button"
              tabIndex={0}
              className="cursor-default select-none"
              onClick={onSimLetterClick}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSim(); } }}
            >b</span>ot
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Each bot runs in your browser and trades directly on your connected Deriv account. Open one to pick Demo or Real, configure it, and watch live trades and statistics.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BOTS.map((b) => {
            // Colour off the SHOWN rating so it matches what's on the card: a
            // displayed 5.0 → green, 4.9 → blue, everything else keeps gold.
            const shownRating = b.rating.toFixed(1);
            const ratingColor = shownRating === "5.0" ? "#34d399" : shownRating === "4.9" ? "#38bdf8" : "#fcd34d";
            return (
            <Link key={b.id} href={`/trading/deriv/bots/${b.id}`}
              className="group relative flex flex-col rounded-2xl border p-5 transition hover:-translate-y-0.5"
              style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(56,189,248,0.12)", color: TC.profit }}>{b.chip}</span>
                {b.badges?.map((bd) => (
                  <span key={bd} className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: BADGE_STYLE[bd].bg, color: BADGE_STYLE[bd].color }}>{bd}</span>
                ))}
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: ratingColor }}>
                  <Star size={12} fill={ratingColor} /> {shownRating}
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-bold">{b.name}</h3>
              <p className="mt-1 text-[12px]" style={{ color: TC.muted }}>{b.tagline}</p>
              <p className="mt-2 flex-1 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>{b.blurb}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ ...monoFont, color: TC.faint }}>{b.markets}</span>
                <span className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition group-hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                  Open <ChevronRight size={14} />
                </span>
              </div>
            </Link>
            );
          })}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          Trading carries risk. This is an automated tool, not financial advice or a profit guarantee. Never risk more than you can afford to lose.
        </p>
      </div>
    </main>
  );
}
