"use client";

/**
 * DERIV BOTS — the catalog. A card per bot (BotsLab order); opening a card goes to
 * that bot's own trading page. Reuses the command-center Deriv connection; with no
 * connection at all it bounces to the command center.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Loader2, Star, ChevronRight } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { loadDerivAccess } from "@/lib/deriv/oauth";
import { BOTS, type BotBadge } from "@/lib/deriv/bots/registry";

const BADGE_STYLE: Record<BotBadge, { bg: string; color: string }> = {
  Popular: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  Beginner: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  Fast: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  Stable: { bg: "rgba(168,85,247,0.15)", color: "#c084fc" },
};

export function DerivBotsList() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loadDerivAccess()) { router.replace("/trading/command"); return; }
    setReady(true);
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
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]"><Bot size={16} style={{ color: TC.profit }} /> DERIV BOTS</span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Choose a bot</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Each bot runs in your browser and trades directly on your connected Deriv account. Open one to pick Demo or Real, configure it, and watch live trades and statistics.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BOTS.map((b) => (
            <Link key={b.id} href={`/trading/deriv/bots/${b.id}`}
              className="group relative flex flex-col rounded-2xl border p-5 transition hover:-translate-y-0.5"
              style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(56,189,248,0.12)", color: TC.profit }}>{b.chip}</span>
                {b.badge && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: BADGE_STYLE[b.badge].bg, color: BADGE_STYLE[b.badge].color }}>{b.badge}</span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "#fcd34d" }}>
                  <Star size={12} fill="#fcd34d" /> {b.rating.toFixed(1)}
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
          ))}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          Trading carries risk. Several of these bots use martingale-style recovery which can escalate stakes quickly — always test on a Demo account first and never risk more than you can afford to lose.
        </p>
      </div>
    </main>
  );
}
