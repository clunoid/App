"use client";

/**
 * Opening Range Breakout — the fourth MT5 automation's page. A one-time
 * purchase (intraday), with setup and risk profiles. The session-hour input
 * must match the broker's US-index open, or it won't trade the right range.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Shield, Zap, Gauge, CheckCircle2, CircleDashed, Clock, AlertTriangle } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { Mt5Download } from "@/components/deriv/mt5/Mt5Download";

const ACCENT = "#38bdf8";

type Profile = { key: "conservative" | "moderate" | "aggressive"; label: string; risk: string; blurb: string; icon: typeof Shield };
const PROFILES: Profile[] = [
  { key: "aggressive", label: "Aggressive", risk: "1.0% per trade", blurb: "Full size on every opening-range break, the widest risk cap.", icon: Zap },
  { key: "moderate", label: "Moderate", risk: "0.5% per trade", blurb: "The default. Balanced size and a firm account-wide cap.", icon: Gauge },
  { key: "conservative", label: "Conservative", risk: "0.3% per trade", blurb: "The same breaks at the smallest size, for the calmest ride.", icon: Shield },
];

const HERO = "Some of the day's clearest moves happen in the first hour. Opening Range Breakout goes to work the moment the market opens, catching the break across major stock indices, then steps aside before the close. You end every day in cash.";
const BENEFIT_LEAD = "This is the active side of your portfolio, engineered to move fast in the open and stand down by the close, entirely on its own.";
const BENEFITS = [
  { t: "Flat every night", d: "Closes every position before the bell, so you never carry risk overnight." },
  { t: "Protected on entry", d: "Every trade opens with a hard stop, sized to your balance." },
  { t: "Fully hands-free", d: "Runs on your own MT5 terminal — you keep custody, we never see a password." },
];
const DISCLAIMER = "Trading involves substantial risk. This is not financial advice; never risk more than you can afford to lose. Past performance does not guarantee future results.";

export function OrbMt5() {
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
            <Bot size={16} style={{ color: ACCENT }} /> OPENING RANGE BREAKOUT
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(56,189,248,0.14)", color: ACCENT }}>
            <Clock size={12} /> Intraday
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Opening Range Breakout</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>{HERO}</p>
        </div>

        <Section n={1} title="Why traders choose it">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[13px] leading-relaxed" style={{ color: TC.muted }}>{BENEFIT_LEAD}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {BENEFITS.map((b) => (
                <div key={b.t} className="rounded-xl border p-4" style={{ borderColor: TC.line, background: "rgba(56,189,248,0.05)" }}>
                  <div className="text-[13px] font-bold" style={{ color: ACCENT }}>{b.t}</div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* the one thing that will break it if ignored */}
        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border p-4" style={{ borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.07)" }}>
          <AlertTriangle size={17} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
          <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>Set the session hour.</b> The <code style={cx}>InpSessionStartHour</code> input
            is your broker&rsquo;s server-time hour for the US index open (09:30 New York) — on most GMT+2/+3 brokers
            that is 15 or 16. If it is wrong, the opening range forms at the wrong time and it won&rsquo;t work as intended. Check your
            broker&rsquo;s server time and set it once.
          </p>
        </div>

        <Section n={2} title="Get it running">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex flex-wrap items-center gap-3">
              <Mt5Download
                botId="orb"
                botName="Opening Range Breakout"
                accent={ACCENT}
                label="Download EA"
                freeLabel="Use our free trading bots instead."
                freeBlurb={<>Not ready to buy? Use our <b style={{ color: TC.text }}>free, fully automated trading bots</b> at no cost — connect your account or create one to get started.</>}
              />
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Attach to a stock-index chart and add US500, US30, NAS100 to Market Watch.</span>
            </div>
            <ol className="mt-4 space-y-3">
              {[
                <>Copy the file into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder — find it via <code style={cx}>File → Open Data Folder</code>.</>,
                <>Restart MT5, or press <b style={{ color: TC.text }}>Compile</b> in MetaEditor. The automation then appears under Expert Advisors.</>,
                <>Drag it onto a <b style={{ color: TC.text }}>stock-index chart</b>, <b style={{ color: TC.text }}>set <code style={cx}>InpSessionStartHour</code></b> to your broker&rsquo;s US-open hour, pick a risk profile, and enable <b style={{ color: TC.text }}>Algo Trading</b>.</>,
                <>(Recommended) Right-click the chart → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it keeps trading with your computer off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(56,189,248,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You keep full custody — it runs entirely on your own terminal and we never see a password. It trades only
              during the index cash session and is always flat overnight.
            </p>
          </div>
        </Section>

        <Section n={3} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILES.map((p) => {
              const Icon = p.icon;
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5" style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(56,189,248,0.08)" : TC.panel }}>
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(56,189,248,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
