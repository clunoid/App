"use client";

/**
 * EXNESS — onboarding hub. Open an affiliate account, then join the Telegram
 * community for signals and free MT5 bots. Matches Clunoid Trading chrome.
 */
import Link from "next/link";
import { ArrowLeft, ChevronRight, Users, LineChart, Gift, ShieldCheck, Sparkles } from "lucide-react";
import { TC, DOT_GRID } from "@/lib/trading/theme";
import { EXNESS_SIGNUP_URL, EXNESS_TELEGRAM_URL } from "@/lib/exness/config";

const STEPS = [
  {
    n: 1,
    color: "#38bdf8",
    title: "Create your Exness account",
    body: "Use the button below to open Exness with our link — fast signup, MT5-ready, and built for traders at every level.",
    cta: { label: "Create Exness account", href: EXNESS_SIGNUP_URL, logo: "/logos/exness.svg", logoAlt: "Exness" },
  },
  {
    n: 2,
    color: "#34d399",
    title: "Join our Telegram channel",
    body: "Get profitable trading signals and powerful free MT5 trading bots delivered to your phone — the same community our team uses.",
    cta: { label: "Join Telegram channel", href: EXNESS_TELEGRAM_URL, logo: "/logos/telegram.svg", logoAlt: "Telegram" },
  },
] as const;

const BENEFITS = [
  { color: "#38bdf8", title: "You don\u2019t have to trade alone", text: "Whether you\u2019re just starting or you\u2019ve been in the markets for years, you get a clear path and people beside you — not a blank chart and guesswork." },
  { color: "#34d399", title: "Beginner-friendly, pro-ready", text: "Step-by-step guidance, risk-aware signals, and automation that scales as you grow — no gatekeeping, no jargon for its own sake." },
  { color: "#a78bfa", title: "Free MT5 bots + live ideas", text: "Download capable Expert Advisors and follow signal flow built for real accounts — hands-free when you want it, manual when you don\u2019t." },
  { color: "#fbbf24", title: "One broker, full toolkit", text: "Exness for execution, Telegram for community and tools — everything linked from one place so you\u2019re never hunting for the next step." },
] as const;

export function ExnessHub() {
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
            <img src="/logos/exness.svg" alt="Exness" className="h-4 w-auto" style={{ maxWidth: 88 }} />
          </span>
        </header>

        <div className="mt-4 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Trade Exness with a team behind you</h1>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: TC.muted }}>
            Open your account, join the channel, and tap into signals plus free MT5 bots — for beginners and professional traders alike. You never have to figure it out on your own.
          </p>
        </div>

        <div className="mt-8 grid max-w-3xl gap-4">
          {STEPS.map((s) => (
            <section key={s.n} className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold" style={{ background: `${s.color}22`, color: s.color, boxShadow: `inset 0 0 0 1px ${s.color}55` }}>
                  {s.n}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-bold">{s.title}</h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: TC.muted }}>{s.body}</p>
                  <a href={s.cta.href} target="_blank" rel="noopener noreferrer"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-[13.5px] font-semibold transition hover:opacity-90 sm:w-auto"
                    style={{ background: s.n === 1 ? TC.profit : "#2AABEE", color: s.n === 1 ? TC.ink : "#fff" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.cta.logo} alt="" className="h-4 w-auto shrink-0 object-contain" aria-hidden style={{ maxWidth: s.n === 1 ? 72 : 22 }} />
                    {s.cta.label}
                    <ChevronRight size={16} className="opacity-80" />
                  </a>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 max-w-3xl">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
            <Sparkles size={14} style={{ color: TC.profit }} /> Why traders onboard here
          </h2>
          <ul className="mt-4 space-y-4">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3 rounded-2xl border p-4" style={{ borderColor: TC.line, background: "rgba(255,255,255,0.02)" }}>
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color, boxShadow: `0 0 10px ${b.color}88` }} aria-hidden />
                <div>
                  <div className="text-[14px] font-bold">{b.title}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          {[
            { icon: Users, label: "Community-first" },
            { icon: LineChart, label: "Signals + MT5" },
            { icon: Gift, label: "Free bot access" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-medium" style={{ borderColor: TC.line, color: TC.muted }}>
              <Icon size={15} style={{ color: TC.profit }} /> {label}
            </div>
          ))}
        </div>

        <p className="mt-8 flex max-w-2xl items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} />
          Trading carries risk. This is education and tooling, not financial advice. You open and fund your own Exness account; Clunoid never holds your credentials.
        </p>
      </div>
    </main>
  );
}
