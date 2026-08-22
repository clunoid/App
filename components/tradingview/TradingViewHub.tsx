"use client";

/**
 * TRADINGVIEW — charting hub. Open the charts, then the tools around them:
 * the screener, Pine Script and the public idea feed. Same chrome as the Exness
 * and MetaTrader hubs, so the platforms read as one family.
 *
 * Nothing to connect here — TradingView is where a trader reads the market, and
 * the trade itself still happens on the broker account.
 */
import Link from "next/link";
import { ArrowLeft, ChevronRight, LineChart, Code2, Users, ShieldCheck, Sparkles } from "lucide-react";
import { TC, DOT_GRID } from "@/lib/trading/theme";
import {
  TRADINGVIEW_URL,
  TRADINGVIEW_CHART_URL,
  TRADINGVIEW_SCREENER_URL,
  TRADINGVIEW_PINE_URL,
  TRADINGVIEW_IDEAS_URL,
} from "@/lib/tradingview/config";

const STEPS = [
  {
    n: 1,
    color: "#38bdf8",
    title: "Open the charts",
    body: "Every market on one canvas — forex, indices, crypto, stocks and commodities — with the drawing tools and timeframes most traders already work in.",
    cta: { label: "Open TradingView charts", href: TRADINGVIEW_CHART_URL },
  },
  {
    n: 2,
    color: "#34d399",
    title: "Create a free account",
    body: "Save your layouts, set price alerts that reach your phone, and keep your watchlists in one place across every device you trade from.",
    cta: { label: "Create a TradingView account", href: TRADINGVIEW_URL },
  },
] as const;

const TOOLS = [
  {
    color: "#38bdf8",
    title: "Screener",
    text: "Filter thousands of instruments down to the handful worth your attention, on the conditions you care about.",
    href: TRADINGVIEW_SCREENER_URL,
  },
  {
    color: "#a78bfa",
    title: "Pine Script",
    text: "Write your own indicators, strategies and alerts. The same language behind most published indicators you will find.",
    href: TRADINGVIEW_PINE_URL,
  },
  {
    color: "#fbbf24",
    title: "Idea feed",
    text: "The largest public library of trade ideas anywhere — read how other traders are framing the chart in front of you.",
    href: TRADINGVIEW_IDEAS_URL,
  },
] as const;

const BENEFITS = [
  { color: "#38bdf8", title: "Read the market properly", text: "Clean charts, real drawing tools and every timeframe — the analysis layer our bots automate, so you can see for yourself what they are acting on." },
  { color: "#34d399", title: "Alerts that reach you", text: "Set a level once and get told when price arrives, so you are not tied to a screen waiting for a move that may take days." },
  { color: "#a78bfa", title: "Your own indicators", text: "Pine Script turns an idea into something you can actually test on a chart, before it ever touches a live account." },
  { color: "#fbbf24", title: "Pairs with your broker", text: "Analyse on TradingView, execute on Deriv or MetaTrader 5. Charting and execution stay separate, which is how most desks run." },
] as const;

export function TradingViewHub() {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 w-full px-5 py-5 sm:px-8 lg:px-12 xl:px-16">
        <header className="flex w-full flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/tradingview.svg" alt="TradingView" className="h-4 w-auto object-contain" style={{ maxWidth: 110 }} />
          </span>
        </header>

        <div className="mt-6 w-full">
          <h1 className="text-[26px] font-bold sm:text-[32px] lg:text-[34px]">Read the market on TradingView</h1>
          <p className="mt-2 max-w-4xl text-[14px] leading-relaxed sm:text-[15px]" style={{ color: TC.muted }}>
            Charts, screeners, alerts and the largest public library of trade ideas — used by over 100 million traders. Analyse here, then execute on your own broker account.
          </p>
        </div>

        <div className="mt-8 grid w-full gap-4 lg:grid-cols-2">
          {STEPS.map((s) => (
            <section key={s.n} className="flex h-full flex-col rounded-2xl border p-5 sm:p-6" style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold" style={{ background: `${s.color}22`, color: s.color, boxShadow: `inset 0 0 0 1px ${s.color}55` }}>
                  {s.n}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-bold sm:text-[17px]">{s.title}</h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: TC.muted }}>{s.body}</p>
                </div>
              </div>
              <a href={s.cta.href} target="_blank" rel="noopener noreferrer"
                className="mt-5 inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-[13.5px] font-semibold transition hover:opacity-90"
                style={{ background: s.n === 1 ? TC.profit : "rgba(255,255,255,0.06)", color: s.n === 1 ? TC.ink : TC.text, boxShadow: s.n === 1 ? undefined : `inset 0 0 0 1px ${TC.line}` }}>
                <span className="inline-flex items-center rounded-md px-2 py-0.5" style={{ background: "rgba(0,0,0,0.35)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/tradingview.svg" alt="" className="h-3.5 w-auto shrink-0 object-contain" aria-hidden style={{ maxWidth: 84 }} />
                </span>
                {s.cta.label}
                <ChevronRight size={16} className="opacity-80" />
              </a>
            </section>
          ))}
        </div>

        <div className="mt-8 grid w-full gap-4 sm:grid-cols-3">
          {TOOLS.map((t) => (
            <a key={t.title} href={t.href} target="_blank" rel="noopener noreferrer"
              className="group flex flex-col rounded-2xl border p-4 transition hover:-translate-y-0.5 sm:p-5" style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}88` }} aria-hidden />
                <div className="text-[14px] font-bold">{t.title}</div>
                <ChevronRight size={14} className="ml-auto transition group-hover:translate-x-0.5" style={{ color: TC.faint }} />
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{t.text}</p>
            </a>
          ))}
        </div>

        <div className="mt-10 w-full">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
            <Sparkles size={14} style={{ color: TC.profit }} /> Why traders chart here
          </h2>
          <ul className="mt-4 grid w-full gap-4 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: "rgba(255,255,255,0.02)" }}>
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color, boxShadow: `0 0 10px ${b.color}88` }} aria-hidden />
                <div>
                  <div className="text-[14px] font-bold">{b.title}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
          {[
            { icon: LineChart, label: "Charts & alerts" },
            { icon: Code2, label: "Pine Script" },
            { icon: Users, label: "100M+ traders" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[12px] font-medium sm:justify-start" style={{ borderColor: TC.line, color: TC.muted }}>
              <Icon size={15} style={{ color: TC.profit }} /> {label}
            </div>
          ))}
        </div>

        <p className="mt-8 flex w-full items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} />
          Trading carries risk. This is education and tooling, not financial advice. TradingView is a charting service — your trades are still placed on your own broker account, and Clunoid never holds your credentials.
        </p>
      </div>
    </main>
  );
}
