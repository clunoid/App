"use client";

/**
 * MT5 AUTOMATIONS — the catalog. A card per MT5 bot; opening a card goes to that
 * bot's own page (/trading/deriv/mt5/<id>), where its Expert Advisor, live signals
 * and setup live. Mirrors the Deriv Bots catalog.
 */
import Link from "next/link";
import { ArrowLeft, Bot, Star, ChevronRight, LineChart } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { MT5_BOTS } from "@/lib/deriv/mt5/registry";

export function Mt5BotsList() {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]"><Bot size={16} style={{ color: TC.profit }} /> MT5 AUTOMATIONS</span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Choose an MT5 bot</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Each bot is an Expert Advisor you run in your own MetaTrader 5 terminal — you keep full custody. Open one to see its live signals, risk profiles and setup.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MT5_BOTS.map((b) => (
            <Link key={b.id} href={`/trading/deriv/mt5/${b.id}`}
              className="group relative flex flex-col rounded-2xl border p-5 transition hover:-translate-y-0.5"
              style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(56,189,248,0.12)", color: TC.profit }}>{b.chip}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "#fcd34d" }}>
                  <Star size={12} fill="#fcd34d" /> {b.rating}/10
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-bold">{b.name}</h3>
              <p className="mt-1 text-[12px]" style={{ color: TC.muted }}>{b.tagline}</p>
              <p className="mt-2 flex-1 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>{b.blurb}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider" style={{ ...monoFont, color: TC.faint }}>
                  <LineChart size={12} /> {b.markets}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition group-hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                  Open <ChevronRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          Trading carries risk. These automations run on your own MT5 terminal and trade your live account. This is an automated tool, not financial advice or a profit guarantee. Never risk more than you can afford to lose.
        </p>
      </div>
    </main>
  );
}
