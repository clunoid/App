"use client";

/**
 * Index Dip Reversion — the second MT5 automation's page. Free download, risk
 * profiles, honest performance (high win rate, but a shallow mean-reversion edge
 * that must respect its stop).
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Shield, Zap, Gauge, Download, CheckCircle2, CircleDashed, Repeat } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";

const ACCENT = "#f472b6";

type Profile = { key: "conservative" | "moderate" | "aggressive"; label: string; risk: string; blurb: string; icon: typeof Shield };
const PROFILES: Profile[] = [
  { key: "aggressive", label: "Aggressive", risk: "1.0% per trade", blurb: "Full size across every qualifying dip, a wider open-risk cap.", icon: Zap },
  { key: "moderate", label: "Moderate", risk: "0.6% per trade", blurb: "The default. A balanced size and a firm account-wide cap.", icon: Gauge },
  { key: "conservative", label: "Conservative", risk: "0.35% per trade", blurb: "The same dips at the smallest size, for the calmest ride.", icon: Shield },
];

const STATS = [
  { v: "+134%", l: "15-year net return", s: "8 indices, after realistic spread" },
  { v: "71%", l: "win rate", s: "the mean-reversion signature" },
  { v: "+44% / +63%", l: "both halves positive", s: "robust across sub-periods" },
  { v: "~18 / month", l: "trade frequency", s: "trades most days, holds only days" },
];

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
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Buys short-term dips in stock indices that are still in a long-term uptrend, then exits fast when the
            bounce plays out. The mirror of trend-following — a high win rate and quick, frequent trades. Runs on your
            own MT5 terminal, on any broker.
          </p>
        </div>

        <Section n={1} title="What it does, proven">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.l} className="rounded-xl border p-4" style={{ borderColor: TC.line, background: "rgba(244,114,182,0.05)" }}>
                  <div className="text-[20px] font-bold leading-none" style={{ ...monoFont, color: ACCENT }}>{s.v}</div>
                  <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{s.l}</div>
                  <div className="mt-1 text-[11px] leading-snug" style={{ color: TC.muted }}>{s.s}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
              <Repeat size={15} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
              Stock indices bounce after short, sharp dips inside an uptrend — a documented effect, and the opposite of
              how currencies behave. It wins often but each win is small, so the discipline is a hard stop and a quick
              exit: it never adds to a losing position and never fights a falling market (it only buys above the
              200-day trend). Pairs naturally with the trend automation, which profits when this one sits out.
            </p>
          </div>
        </Section>

        <Section n={2} title="Get it running">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex flex-wrap items-center gap-3">
              <a href="/mt5/ClunoidDipMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: ACCENT, color: TC.ink }}>
                <Download size={15} /> Download EA — free
              </a>
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
              stock indices; the dip effect does not hold on currencies.
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
          Trading carries risk; this is an automated tool, not financial advice or a profit guarantee. Mean reversion
          wins often but loses can be larger than wins — respect the stop. Never risk more than you can afford to lose.
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
