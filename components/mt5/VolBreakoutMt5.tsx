"use client";

/**
 * Volatility Breakout — the third MT5 automation's page. A one-time purchase,
 * with setup and risk profiles.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Shield, Zap, Gauge, CheckCircle2, CircleDashed } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { Mt5Download } from "@/components/deriv/mt5/Mt5Download";

const ACCENT = "#fb923c";

type Profile = { key: "conservative" | "moderate" | "aggressive"; label: string; risk: string; blurb: string; icon: typeof Shield };
const PROFILES: Profile[] = [
  { key: "aggressive", label: "Aggressive", risk: "1.0% per trade", blurb: "Full size, add-to-winners enabled, the widest risk cap — biggest runs and swings.", icon: Zap },
  { key: "moderate", label: "Moderate", risk: "0.6% per trade", blurb: "The default. Balanced size and a firm account-wide risk cap.", icon: Gauge },
  { key: "conservative", label: "Conservative", risk: "0.35% per trade", blurb: "The same breakouts at the smallest size, for the calmest ride.", icon: Shield },
];

const HERO = "Some markets move harder than the rest. This automation lives in gold, silver, oil, copper and crypto, stepping in when a real move takes hold and holding on with a wide, patient exit — so your biggest winners have room to run.";
const BENEFIT_LEAD = "Built to do one thing beautifully — capture the market's most powerful moves and stay with them — while keeping you protected and fully in control from the first trade on.";
const BENEFITS = [
  { t: "Winners run further", d: "A wide trailing exit stays with strong moves instead of cutting them short." },
  { t: "Protected on every trade", d: "Each position is sized to your balance and opens with a hard stop in place." },
  { t: "Diversified by design", d: "Risk is shared across metals, oil and the major coins, never one lone bet." },
];
const DISCLAIMER = "Trading carries real risk and this is not financial advice; past moves never guarantee future ones, so never risk more than you can afford to lose.";

export function VolBreakoutMt5() {
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
            <Bot size={16} style={{ color: ACCENT }} /> VOLATILITY BREAKOUT
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Volatility Breakout</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>{HERO}</p>
        </div>

        <Section n={1} title="Why traders choose it">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[13px] leading-relaxed" style={{ color: TC.muted }}>{BENEFIT_LEAD}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {BENEFITS.map((b) => (
                <div key={b.t} className="rounded-xl border p-4" style={{ borderColor: TC.line, background: "rgba(251,146,60,0.05)" }}>
                  <div className="text-[13px] font-bold" style={{ color: ACCENT }}>{b.t}</div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section n={2} title="Get it running">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex flex-wrap items-center gap-3">
              <Mt5Download
                botId="volatility-breakout"
                botName="Volatility Breakout"
                accent={ACCENT}
                label="Download EA"
                freeLabel="Use our free trading bots instead."
                freeBlurb={<>Not ready to buy? Use our <b style={{ color: TC.text }}>free, fully automated trading bots</b> at no cost — connect your account or create one to get started.</>}
              />
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Add gold, silver, oil, copper and the major coins to Market Watch.</span>
            </div>
            <ol className="mt-4 space-y-3">
              {[
                <>Copy the file into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder — find it via <code style={cx}>File → Open Data Folder</code>.</>,
                <>Restart MT5, or press <b style={{ color: TC.text }}>Compile</b> in MetaEditor. The automation then appears under Expert Advisors.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any one chart</b> — it manages the whole basket itself — set <code style={cx}>InpProfile</code>, and enable <b style={{ color: TC.text }}>Algo Trading</b>.</>,
                <>(Recommended) Right-click the chart → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it keeps trading with your computer off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(251,146,60,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You keep full custody — it runs entirely on your own terminal and we never see a password. The crypto and
              metals legs are the core; give it as many of the basket as your broker offers.
            </p>
          </div>
        </Section>

        <Section n={3} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILES.map((p) => {
              const Icon = p.icon;
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5" style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(251,146,60,0.08)" : TC.panel }}>
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
          {DISCLAIMER}
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(251,146,60,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
