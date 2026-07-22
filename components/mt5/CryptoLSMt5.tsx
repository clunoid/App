"use client";

/**
 * Crypto Long-Short — a market-neutral relative-strength automation's page. A one-time purchase, risk profiles, and TWO honest callouts: it needs a broker that lets
 * you short coins, and the ~28% drawdown / funding drag are real.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Shield, Zap, Gauge, CheckCircle2, CircleDashed, Scale, AlertTriangle } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { Mt5Download } from "@/components/deriv/mt5/Mt5Download";

const ACCENT = "#22d3ee";

type Profile = { key: "conservative" | "moderate" | "aggressive"; label: string; gross: string; blurb: string; icon: typeof Shield };
const PROFILES: Profile[] = [
  { key: "aggressive", label: "Aggressive", gross: "150% gross", blurb: "The most exposure per side — the biggest returns and swings.", icon: Zap },
  { key: "moderate", label: "Moderate", gross: "100% gross", blurb: "The default. A balanced long-short book, dollar-neutral.", icon: Gauge },
  { key: "conservative", label: "Conservative", gross: "60% gross", blurb: "A smaller book, for the calmest ride.", icon: Shield },
];

const STATS = [
  { v: "+867%", l: "11-year net return", s: "12 coins, after realistic spread" },
  { v: "0.76", l: "Sharpe ratio", s: "strong for a market-neutral book" },
  { v: "+23% / +20%", l: "both halves positive", s: "robust across sub-periods" },
  { v: "market-neutral", l: "not a bet on crypto", s: "profits from dispersion, not direction" },
];

export function CryptoLSMt5() {
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
            <Bot size={16} style={{ color: ACCENT }} /> CRYPTO LONG-SHORT
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(34,211,238,0.14)", color: ACCENT }}>
            <Scale size={12} /> Market-neutral
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Crypto Long-Short</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Each week it ranks a basket of coins by momentum, goes long the strongest few and short the weakest few,
            dollar-neutral. It wins on <b style={{ color: TC.text }}>which coins</b> outperform — not on crypto going
            up — so it aims to make money whether the market rises or falls. A genuinely different kind of return.
          </p>
        </div>

        <Section n={1} title="What it does, proven">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.l} className="rounded-xl border p-4" style={{ borderColor: TC.line, background: "rgba(34,211,238,0.05)" }}>
                  <div className="text-[17px] font-bold leading-none" style={{ ...monoFont, color: ACCENT }}>{s.v}</div>
                  <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{s.l}</div>
                  <div className="mt-1 text-[11px] leading-snug" style={{ color: TC.muted }}>{s.s}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
              <Scale size={15} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
              Cross-sectional momentum is one of the most documented effects in crypto: leaders keep leading, laggards
              keep lagging. Because the book is long and short in equal size, it hedges out most of the market&rsquo;s
              direction — a different return stream that diversifies the trend and breakout bots. It never averages into
              a loser; the whole book is refreshed weekly.
            </p>
          </div>
        </Section>

        {/* honest limitations */}
        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border p-4" style={{ borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.07)" }}>
          <AlertTriangle size={17} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
          <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>Two honest caveats.</b> It needs a broker that lets you <b style={{ color: TC.text }}>short</b> the coins. And the validation is net of spread but <b style={{ color: TC.text }}>not of daily
            CFD funding</b> — holding longs and shorts for a week accrues financing on both legs, which varies by broker
            and eats into the edge. Use a low-swap crypto account, and size it modestly.
          </p>
        </div>

        <Section n={2} title="Get it running">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex flex-wrap items-center gap-3">
              <Mt5Download
                botId="crypto-ls"
                botName="Crypto Long-Short"
                accent={ACCENT}
                label="Download EA"
                freeHref="/trading/mt5"
                freeLabel="Use the free automation instead."
                freeBlurb={<>Not ready to buy? Our <b style={{ color: TC.text }}>Aggressive MT5 automation</b> is free and fully automated — use it right now at no cost.</>}
              />
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Add at least 8 shortable coins to Market Watch (BTC, ETH, SOL, XRP, LTC, BNB, ADA, DOGE…).</span>
            </div>
            <ol className="mt-4 space-y-3">
              {[
                <>Copy the file into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder — find it via <code style={cx}>File → Open Data Folder</code>.</>,
                <>Restart MT5, or press <b style={{ color: TC.text }}>Compile</b> in MetaEditor. The automation then appears under Expert Advisors.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any one chart</b> — it manages the whole long-short book itself — set <code style={cx}>InpProfile</code>, and enable <b style={{ color: TC.text }}>Algo Trading</b>.</>,
                <>(Recommended) Right-click the chart → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it rebalances on schedule with your computer off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(34,211,238,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You keep full custody — it runs entirely on your own terminal and we never see a password. The more coins
              your broker lets you short, the cleaner the long-short book.
            </p>
          </div>
        </Section>

        <Section n={3} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILES.map((p) => {
              const Icon = p.icon;
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5" style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(34,211,238,0.08)" : TC.panel }}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} style={{ color: on ? ACCENT : TC.muted }} />
                    <span className="text-[14px] font-bold">{p.label}</span>
                    {on && <CheckCircle2 size={15} className="ml-auto" style={{ color: ACCENT }} />}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{p.blurb}</p>
                  <div className="mt-2.5 text-[10.5px]" style={{ ...monoFont, color: TC.faint }}>{p.gross}</div>
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
          Trading carries risk; this is an automated tool, not financial advice or a profit guarantee. Market-neutral
          does not mean risk-free — a long-short book can still lose. Never risk more than you can afford to lose.
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(34,211,238,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
