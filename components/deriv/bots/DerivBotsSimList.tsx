"use client";

/**
 * DERIV BOTS — simulation catalog. Same cards as the live list; no Deriv connection.
 * Opened via a double-click on the "b" in "Choose a bot" on the live catalog.
 */
import Link from "next/link";
import { ArrowLeft, Bot, Star, ChevronRight } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { BOTS, type BotBadge } from "@/lib/deriv/bots/registry";
import { SimBalanceEditor } from "@/components/deriv/bots/SimBalanceEditor";

const BADGE_STYLE: Record<BotBadge, { bg: string; color: string }> = {
  Recommended: { bg: "rgba(56,189,248,0.18)", color: "#38bdf8" },
  Popular: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  Beginner: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  Fast: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  Stable: { bg: "rgba(168,85,247,0.15)", color: "#c084fc" },
};

export function DerivBotsSimList() {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/deriv/bots" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Live bots
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]"><Bot size={16} style={{ color: TC.profit }} /> DERIV BOTS · SIM</span>
          <div className="ml-auto">
            <SimBalanceEditor />
          </div>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Choose a bot</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Each bot runs in your browser and trades directly on your connected Deriv account. Open one to pick Demo or Real, configure it, and watch live trades and statistics.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BOTS.map((b) => {
            const shownRating = b.rating.toFixed(1);
            const ratingColor = shownRating === "5.0" ? "#34d399" : shownRating === "4.9" ? "#38bdf8" : "#fcd34d";
            return (
              <Link key={b.id} href={`/trading/deriv/bots/sim/${b.id}`}
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
          Simulation mode — no real trades. Trading carries risk. This is an automated tool, not financial advice or a profit guarantee.
        </p>
      </div>
    </main>
  );
}
