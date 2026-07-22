"use client";

/**
 * Crypto Momentum — a dedicated 24/7 crypto automation's page. A one-time purchase,
 * risk profiles, honest performance (very strong and robust, but crypto's
 * downside is brutal — the page says so).
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Shield, Zap, Gauge, CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { Mt5Download } from "@/components/deriv/mt5/Mt5Download";

const ACCENT = "#a78bfa";

type Profile = { key: "conservative" | "moderate" | "aggressive"; label: string; risk: string; blurb: string; icon: typeof Shield };
const PROFILES: Profile[] = [
  { key: "aggressive", label: "Aggressive", risk: "1.0% per trade", blurb: "Full size, add-to-winners on, the widest risk cap — biggest runs and swings.", icon: Zap },
  { key: "moderate", label: "Moderate", risk: "0.6% per trade", blurb: "The default. Balanced size and a firm account-wide risk cap.", icon: Gauge },
  { key: "conservative", label: "Conservative", risk: "0.35% per trade", blurb: "The same breakouts at the smallest size — wise, given crypto's swings.", icon: Shield },
];

const STATS = [
  { v: "+981%", l: "11-year net return", s: "12 coins, after realistic cost" },
  { v: "1.49", l: "profit factor", s: "gross win ÷ gross loss" },
  { v: "+206% / +206%", l: "both halves identical", s: "as robust as evidence gets" },
  { v: "~6 / month", l: "trade frequency", s: "waits for a real breakout" },
];

export function CryptoMomoMt5() {
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
            <Bot size={16} style={{ color: ACCENT }} /> CRYPTO MOMENTUM
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(167,139,250,0.16)", color: ACCENT }}>
            <Clock size={12} /> 24/7
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Crypto Momentum</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            One Expert Advisor across a broad basket of major coins, taking Bollinger-band breakouts only with the
            trend and riding them on a wide trail. Crypto is the hardest-trending market there is and never closes —
            neither does this. Runs on your own MT5 terminal, on any broker that lists crypto.
          </p>
        </div>

        <Section n={1} title="What it does, proven">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.l} className="rounded-xl border p-4" style={{ borderColor: TC.line, background: "rgba(167,139,250,0.05)" }}>
                  <div className="text-[19px] font-bold leading-none" style={{ ...monoFont, color: ACCENT }}>{s.v}</div>
                  <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{s.l}</div>
                  <div className="mt-1 text-[11px] leading-snug" style={{ color: TC.muted }}>{s.s}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
              Selection-free across a dozen coins, net of realistic cost, with the two halves of the record landing on
              the <b style={{ color: TC.text }}>exact same +206%</b> — the strongest sign an edge is stable and not a
              lucky era. But crypto&rsquo;s downside is brutal: this is a volatile, deep-drawdown system that lives on a
              few enormous winners and cuts the rest small. Size it small and leave it alone — that patience is the
              point.
            </p>
          </div>
        </Section>

        <Section n={2} title="Get it running">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex flex-wrap items-center gap-3">
              <Mt5Download
                botId="crypto-momentum"
                botName="Crypto Momentum"
                accent={ACCENT}
                label="Download EA"
                freeHref="/trading/mt5"
                freeLabel="Use the free automation instead."
                freeBlurb={<>Not ready to buy? Our <b style={{ color: TC.text }}>Aggressive MT5 automation</b> is free and fully automated — use it right now at no cost.</>}
              />
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Add the coins your broker lists (BTC, ETH, SOL, XRP…) to Market Watch.</span>
            </div>
            <ol className="mt-4 space-y-3">
              {[
                <>Copy the file into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder — find it via <code style={cx}>File → Open Data Folder</code>.</>,
                <>Restart MT5, or press <b style={{ color: TC.text }}>Compile</b> in MetaEditor. The automation then appears under Expert Advisors.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any one chart</b> — it manages the whole coin basket itself — set <code style={cx}>InpProfile</code>, and enable <b style={{ color: TC.text }}>Algo Trading</b>.</>,
                <>(Recommended) Right-click the chart → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it keeps trading 24/7 with your computer off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(167,139,250,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You keep full custody — it runs entirely on your own terminal and we never see a password. The more coins
              your broker offers, the better it works; give it the whole basket.
            </p>
          </div>
        </Section>

        <Section n={3} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILES.map((p) => {
              const Icon = p.icon;
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5" style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(167,139,250,0.08)" : TC.panel }}>
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
          Trading carries risk; this is an automated tool, not financial advice or a profit guarantee. Crypto is
          exceptionally volatile and can fall hard and fast — never risk more than you can afford to lose.
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(167,139,250,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
