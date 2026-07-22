"use client";

/**
 * Index Dip Reversion — the second MT5 automation's page. A one-time purchase,
 * with setup and risk profiles.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Shield, Zap, Gauge, CheckCircle2, CircleDashed } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { Mt5Download } from "@/components/deriv/mt5/Mt5Download";

const ACCENT = "#f472b6";

type Profile = { key: "conservative" | "moderate" | "aggressive"; label: string; risk: string; blurb: string; icon: typeof Shield };
const PROFILES: Profile[] = [
  { key: "aggressive", label: "Aggressive", risk: "1.0% per trade", blurb: "Full size across every qualifying dip, a wider open-risk cap.", icon: Zap },
  { key: "moderate", label: "Moderate", risk: "0.6% per trade", blurb: "The default. A balanced size and a firm account-wide cap.", icon: Gauge },
  { key: "conservative", label: "Conservative", risk: "0.35% per trade", blurb: "The same dips at the smallest size, for the calmest ride.", icon: Shield },
];

const HERO = "The best entries often come from a brief pullback in a market that's still heading higher. Index Dip Reversion watches the majors for exactly those moments, buys the dip, and books the rebound quickly, all hands-free on your own MT5 terminal.";
const BENEFIT_LEAD = "Built for traders who want quick, clean entries on the indices they already follow, working around the clock so they never have to.";
const BENEFITS = [
  { t: "Quick in, quick out", d: "Buys the dip in rising indices and banks the bounce within days, not months." },
  { t: "Protected on every trade", d: "Each position is sized to your balance with a hard stop set the moment it opens." },
  { t: "Balanced across the majors", d: "Trades a diversified basket of US500, US30, NAS100 and more to lower single-market risk." },
];
const DISCLAIMER = "Trading carries risk. This is an automated tool, not financial advice or a profit guarantee. Never risk more than you can afford to lose.";

export function DipMt5() {
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
            <Bot size={16} style={{ color: ACCENT }} /> INDEX DIP REVERSION
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Index Dip Reversion</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>{HERO}</p>
        </div>

        <Section n={1} title="Why traders choose it">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[13px] leading-relaxed" style={{ color: TC.muted }}>{BENEFIT_LEAD}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {BENEFITS.map((b) => (
                <div key={b.t} className="rounded-xl border p-4" style={{ borderColor: TC.line, background: "rgba(244,114,182,0.05)" }}>
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
                botId="index-dip"
                botName="Index Dip Reversion"
                accent={ACCENT}
                label="Download EA"
                freeLabel="Use our free trading bots instead."
                freeBlurb={<>Not ready to buy? Use our <b style={{ color: TC.text }}>free, fully automated trading bots</b> at no cost — connect your account or create one to get started.</>}
              />
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Add your broker&rsquo;s stock-index symbols (US500, US30, NAS100, GER40…) to Market Watch.</span>
            </div>
            <ol className="mt-4 space-y-3">
              {[
                <>Copy the file into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder — find it via <code style={cx}>File → Open Data Folder</code>.</>,
                <>Restart MT5, or press <b style={{ color: TC.text }}>Compile</b> in MetaEditor. The automation then appears under Expert Advisors.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any one chart</b> — it manages the whole index basket itself — set <code style={cx}>InpProfile</code>, and enable <b style={{ color: TC.text }}>Algo Trading</b>.</>,
                <>(Recommended) Right-click the chart → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it keeps trading with your computer off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(244,114,182,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You keep full custody — it runs entirely on your own terminal and we never see a password. It only trades
              stock indices only.
            </p>
          </div>
        </Section>

        <Section n={3} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILES.map((p) => {
              const Icon = p.icon;
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5" style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(244,114,182,0.08)" : TC.panel }}>
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(244,114,182,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
