"use client";

/**
 * Momentum Trend Breakout — the flagship MT5 automation's page.
 * A one-time purchase, risk profiles, and an honest performance panel (the edge is
 * documented and the validation is real — including the drawdowns).
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Shield, Zap, Gauge, CheckCircle2, CircleDashed, TrendingUp } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { Mt5Download } from "@/components/deriv/mt5/Mt5Download";

const ACCENT = "#34d399";

type Profile = { key: "conservative" | "moderate" | "aggressive"; label: string; risk: string; blurb: string; icon: typeof Shield };
const PROFILES: Profile[] = [
  { key: "aggressive", label: "Aggressive", risk: "0.75% per trade", blurb: "Full size, a wider open-risk cap — the most trades and the deepest swings.", icon: Zap },
  { key: "moderate", label: "Moderate", risk: "0.5% per trade", blurb: "The default. A balanced size and a firm account-wide risk cap.", icon: Gauge },
  { key: "conservative", label: "Conservative", risk: "0.3% per trade", blurb: "The same trades at the smallest size, for the calmest ride.", icon: Shield },
];

const STATS = [
  { v: "+711%", l: "15-year net return", s: "22-market basket, after realistic spread" },
  { v: "1.26", l: "profit factor", s: "gross win ÷ gross loss" },
  { v: "+124% / +274%", l: "both halves positive", s: "robust across sub-periods" },
  { v: "~2 / week", l: "trade frequency", s: "a position system, not a scalper" },
];

export function MomentumMt5() {
  const [profile, setProfile] = useState<Profile["key"]>("moderate");
  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/mt5" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> All MT5 automations
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]">
            <Bot size={16} style={{ color: ACCENT }} /> MOMENTUM TREND BREAKOUT
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Momentum Trend Breakout</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            One Expert Advisor that trades a diversified basket of indices, metals, currencies and crypto — taking
            breakouts only in the direction of the 12-month trend. It runs on your own MT5 terminal, on any broker.
          </p>
        </div>

        {/* honest performance */}
        <Section n={1} title="What it does, proven">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.l} className="rounded-xl border p-4" style={{ borderColor: TC.line, background: "rgba(52,211,153,0.05)" }}>
                  <div className="text-[20px] font-bold leading-none" style={{ ...monoFont, color: ACCENT }}>{s.v}</div>
                  <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{s.l}</div>
                  <div className="mt-1 text-[11px] leading-snug" style={{ color: TC.muted }}>{s.s}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
              <TrendingUp size={15} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
              Trend-following is the most independently documented edge in markets — positive in every decade for over
              a century. It earns from a handful of big winners, so it has a low win rate and real drawdowns: this is a
              patient, position-holding automation, not a quick-win bot. Sized right and left alone, that patience is
              the point.
            </p>
          </div>
        </Section>

        <Section n={2} title="Get it running">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex flex-wrap items-center gap-3">
              <Mt5Download
                botId="momentum"
                botName="Momentum Trend Breakout"
                accent={ACCENT}
                label="Download EA"
                freeHref="/trading/mt5"
                freeLabel="Use the free automation instead."
                freeBlurb={<>Not ready to buy? Our <b style={{ color: TC.text }}>Aggressive MT5 automation</b> is free and fully automated — use it right now at no cost.</>}
              />
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Add the index, metal, FX and crypto symbols to Market Watch so it can trade the full basket.</span>
            </div>

            <ol className="mt-4 space-y-3">
              {[
                <>Copy the file into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder — find it via <code style={cx}>File → Open Data Folder</code>.</>,
                <>Restart MT5, or press <b style={{ color: TC.text }}>Compile</b> in MetaEditor. The automation then appears under Expert Advisors.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any one chart</b> — it manages the whole basket itself — set <code style={cx}>InpProfile</code>, and enable <b style={{ color: TC.text }}>Algo Trading</b>.</>,
                <>(Recommended) Right-click the chart → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it keeps trading with your computer off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(52,211,153,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You keep full custody — it runs entirely on your own terminal and we never see a password. The more of
              the basket your broker offers, the better it works (diversification is where the edge lives).
            </p>
          </div>
        </Section>

        <Section n={3} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILES.map((p) => {
              const Icon = p.icon;
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5" style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(52,211,153,0.08)" : TC.panel }}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} style={{ color: on ? ACCENT : TC.muted }} />
                    <span className="text-[14px] font-bold">{p.label}</span>
                    {on && <CheckCircle2 size={15} className="ml-auto" style={{ color: ACCENT }} />}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{p.blurb}</p>
                  <div className="mt-2.5 text-[10.5px]" style={{ ...monoFont, color: TC.faint }}>Risk {p.risk}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: TC.faint }}>
            Set the same level in the automation&rsquo;s <code style={cx}>InpProfile</code> input. You can change it any
            time without reinstalling.
          </p>
        </Section>

        <p className="mt-7 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          Trading carries risk; this is an automated tool, not financial advice or a profit guarantee. Past
          performance does not predict future results. Never risk more than you can afford to lose.
        </p>
      </div>
    </main>
  );
}

const cx = { background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, ...monoFont, fontSize: 11 } as const;

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(52,211,153,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
