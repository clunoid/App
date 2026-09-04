"use client";

/**
 * MT5 AUTOMATIONS — the catalog. A card per MT5 bot; opening a card goes to that
 * bot's own page (/trading/deriv/mt5/<id>), where its Expert Advisor, live signals
 * and setup live. Mirrors the Deriv Bots catalog.
 *
 * The dedicated automations are not being offered yet. Their cards are locked:
 * they are not links, they carry a Soon chip in place of the rating, and opening
 * one says so and points at the two things that ARE available — the channel, and
 * the free bots. Nothing leads to a page that would ask for money for something
 * we are not handing over.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Star, ChevronRight, LineChart, Lock, Send, X } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { MT5_BOTS, RATING_HOT, type Mt5BotMeta } from "@/lib/deriv/mt5/registry";
import { SupportChat } from "@/components/support/SupportChat";
import { EXNESS_TELEGRAM_URL } from "@/lib/exness/config";

export function Mt5BotsList() {
  /** The locked bot whose card was pressed, or null when nothing is open. */
  const [soon, setSoon] = useState<Mt5BotMeta | null>(null);

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Home
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]"><Bot size={16} style={{ color: TC.profit }} /> MT5 AUTOMATIONS</span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Choose an MT5 bot</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Each bot is an Expert Advisor you run in your own MetaTrader 5 terminal — you keep full custody, and we never see a password. Open one to download it and set your risk profile.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MT5_BOTS.map((b) => {
            const hot = b.rating >= RATING_HOT; // the standout rating renders green
            const ratingColor = hot ? "#34d399" : "#fcd34d";
            const locked = !!b.soon;

            /* One body, two wrappers. A locked card is a button rather than a
               link so it cannot be opened in a new tab, middle-clicked or
               followed by a crawler into a page that is not ready. */
            const body = (
              <>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(56,189,248,0.12)", color: TC.profit }}>{b.chip}</span>
                  {b.free && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(52,211,153,0.16)", color: "#34d399" }}>Free</span>
                  )}
                  {locked ? (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(148,168,189,0.16)", color: TC.muted }}>
                      <Lock size={10} /> Soon
                    </span>
                  ) : (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: ratingColor }}>
                      <Star size={12} fill={ratingColor} /> {b.rating}/10
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-[16px] font-bold">{b.name}</h3>
                <p className="mt-1 text-[12px]" style={{ color: TC.muted }}>{b.tagline}</p>
                <p className="mt-2 flex-1 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>{b.blurb}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider" style={{ ...monoFont, color: TC.faint }}>
                    <LineChart size={12} /> {b.markets}
                  </span>
                  {locked ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold" style={{ borderColor: TC.line, color: TC.muted }}>
                      Available soon
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition group-hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                      Open <ChevronRight size={14} />
                    </span>
                  )}
                </div>
              </>
            );

            const shell = "group relative flex flex-col rounded-2xl border p-5 text-left transition";

            return locked ? (
              <button key={b.id} type="button" onClick={() => setSoon(b)}
                aria-label={`${b.name} — available soon`}
                className={`${shell} hover:border-white/20`}
                style={{ borderColor: TC.line, background: TC.panel, opacity: 0.72 }}>
                {body}
              </button>
            ) : (
              <Link key={b.id} href={`/trading/deriv/mt5/${b.id}`}
                className={`${shell} hover:-translate-y-0.5`}
                style={{ borderColor: TC.line, background: TC.panel }}>
                {body}
              </Link>
            );
          })}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          Trading carries risk. This is an automated tool, not financial advice or a profit guarantee. Never risk more than you can afford to lose.
        </p>
      </div>

      {soon && <SoonDialog bot={soon} onClose={() => setSoon(null)} />}

      <SupportChat source="MT5 bots" />
    </main>
  );
}

/**
 * What a locked card opens. Says the automation is not ready, then offers the
 * two things that are: the channel it will be announced on, and the bots that
 * can be run today. No price and no waiting list — nothing here asks for
 * anything.
 */
function SoonDialog({ bot, onClose }: { bot: Mt5BotMeta; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** A backdrop press only counts when it STARTED on the backdrop, so selecting
   *  text inside and releasing outside does not close it underneath you. */
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="mt5-soon-title"
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: "rgba(4,10,20,0.72)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-w-[400px] rounded-2xl border p-5 outline-none"
        style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-lg p-1 transition hover:bg-white/10" style={{ color: TC.faint }}>
          <X size={16} />
        </button>

        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(148,168,189,0.16)", color: TC.muted }}>
          <Lock size={10} /> Available soon
        </span>

        <h3 id="mt5-soon-title" className="mt-3 text-[17px] font-bold">{bot.name}</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          This automation is not ready yet. Join the channel and you will hear the
          moment it is — or run one of the free bots in the meantime.
        </p>

        <a href={EXNESS_TELEGRAM_URL} target="_blank" rel="noopener noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90"
          style={{ background: TC.profit, color: TC.ink }}>
          <Send size={15} /> Join Telegram
        </a>

        <Link href="/trading/deriv/bots" onClick={onClose}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-white/5"
          style={{ borderColor: TC.line, color: TC.text }}>
          <Bot size={15} style={{ color: TC.profit }} /> Use the free bots
        </Link>
      </div>
    </div>
  );
}
