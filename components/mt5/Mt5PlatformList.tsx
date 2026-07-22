"use client";

/**
 * METATRADER 5 — the standalone platform catalog. A card per automation; the
 * available ones open their own page (/trading/mt5/<id>) to download and set a
 * risk profile. Broker-agnostic, free, no connection required.
 */
import Link from "next/link";
import { ArrowLeft, Star, ChevronRight, LineChart, ShieldCheck, Cpu, Wallet } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { MT5_AUTOS, RATING_HOT } from "@/lib/mt5/registry";

export function Mt5PlatformList() {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-2 text-[14px] font-bold tracking-[0.12em]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/metatrader5.svg" alt="MetaTrader 5" className="h-4 w-auto" style={{ maxWidth: 120 }} /> AUTOMATIONS
          </span>
        </header>

        <div className="mt-3 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Automations for MetaTrader 5</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Professional Expert Advisors that run hands-free on your own MT5 terminal — any broker, any balance. Every
            trade is sized to your account and carries a hard stop the instant it opens. One is free; the rest, a simple
            one-time purchase — no subscriptions, no connection needed.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]" style={{ color: TC.faint }}>
            <span className="inline-flex items-center gap-1.5"><Wallet size={13} style={{ color: TC.profit }} /> Manages any balance</span>
            <span className="inline-flex items-center gap-1.5"><Cpu size={13} style={{ color: TC.profit }} /> Any MT5 broker</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} style={{ color: TC.profit }} /> Stop loss on every trade</span>
          </div>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MT5_AUTOS.map((b) => {
            const hot = b.rating >= RATING_HOT;
            const ratingColor = hot ? "#34d399" : "#fcd34d";
            const live = b.status === "available";
            const inner = (
              <>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(56,189,248,0.12)", color: TC.profit }}>{b.chip}</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: ratingColor }}>
                    <Star size={12} fill={ratingColor} /> {b.rating}/10
                  </span>
                </div>
                <h3 className="mt-3 text-[16px] font-bold">{b.name}</h3>
                <p className="mt-1 text-[12px]" style={{ color: TC.muted }}>{b.tagline}</p>
                <p className="mt-2 flex-1 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>{b.blurb}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider" style={{ ...monoFont, color: TC.faint }}>
                    <LineChart size={12} /> {b.markets}
                  </span>
                  <div className="flex items-center gap-2">
                    {b.free ? (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(52,211,153,0.16)", color: "#34d399" }}>Free</span>
                    ) : null}
                    {live ? (
                      <span className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition group-hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                        Open <ChevronRight size={14} />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ borderColor: TC.line, color: TC.faint }}>
                        In testing
                      </span>
                    )}
                  </div>
                </div>
              </>
            );
            return live ? (
              <Link key={b.id} href={`/trading/mt5/${b.id}`} className="group relative flex flex-col rounded-2xl border p-5 transition hover:-translate-y-0.5" style={{ borderColor: "rgba(52,211,153,0.35)", background: TC.panel }}>
                {inner}
              </Link>
            ) : (
              <div key={b.id} className="relative flex flex-col rounded-2xl border p-5 opacity-75" style={{ borderColor: TC.line, background: TC.panel }}>
                {inner}
              </div>
            );
          })}
        </div>

        <p className="mt-7 max-w-3xl text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          Trading carries risk; these are automated tools, not financial advice or a profit guarantee. Never risk more
          than you can afford to lose.
        </p>
      </div>
    </main>
  );
}
