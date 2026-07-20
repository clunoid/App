"use client";

/**
 * SYNTHETIC INDEX MT5 AI AUTOMATION — this bot's own page.
 *
 * The story is a search: nearly every synthetic Deriv offers is a generated
 * random walk, and one is not. The page leads with the measurement that
 * separated them, because that is the whole reason to trust this bot over the
 * dozens of "volatility index EAs" sold elsewhere.
 */
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Shield, Zap, Gauge, Download, CheckCircle2, CircleDashed,
  XCircle, Clock, Crosshair, Scissors, AlertTriangle, Search,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { VOL_PROFILES, VOL_SEARCH, VOL_SHOOTOUT, VOL_TEST, type VolProfile } from "@/lib/deriv/mt5/volatility";

const ACCENT = "#38bdf8";

const PROFILE_ICON: Record<VolProfile["key"], typeof Shield> = {
  conservative: Shield, moderate: Gauge, aggressive: Zap,
};

export function VolatilityMt5() {
  const [profile, setProfile] = useState<VolProfile["key"]>("aggressive");
  const active = VOL_PROFILES.find((p) => p.key === profile)!;

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/deriv/mt5" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> All MT5 bots
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]">
            <Bot size={16} style={{ color: ACCENT }} /> SYNTHETIC AUTOMATION
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: "rgba(56,189,248,0.14)", color: ACCENT }}>
            <Clock size={12} /> 24/7
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Synthetic indices — AI automation</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            We measured every synthetic Deriv offers. Almost all of them are generated random walks with nothing to
            trade. <b style={{ color: TC.text }}>Range Break 200 is the exception</b> — and this bot trades it the way it
            is actually built: wait for a genuine consolidation, then take the break. Runs around the clock, because
            synthetics never close.
          </p>
        </div>

        {/* the measurement that found it */}
        <Section n={1} title="The number that found it">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex items-start gap-2.5">
              <Search size={16} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
              <p className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                The <b style={{ color: TC.text }}>efficiency ratio</b> measures how much ground a market actually covers
                against how far it travels to get there. A pure random walk scores{" "}
                <b style={{ color: TC.text }}>{VOL_SEARCH.randomWalkRef}</b>. Score below that and the market zigzags
                more than chance — there is no trend to catch and every trade just pays the spread. Score above it and
                the market genuinely goes somewhere.
              </p>
            </div>
            <div className="mt-4 space-y-1.5">
              {VOL_SEARCH.efficiency.map((e) => {
                const pct = Math.min(100, Math.max(0, ((e.value - 0.18) / (0.31 - 0.18)) * 100));
                return (
                  <div key={e.name} className="flex items-center gap-3">
                    <span className="w-[150px] shrink-0 text-[11.5px]" style={{ color: e.ok ? TC.text : TC.muted, fontWeight: e.ok ? 700 : 400 }}>{e.name}</span>
                    <div className="relative h-[18px] flex-1 overflow-hidden rounded" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: e.ok ? ACCENT : "rgba(255,255,255,0.14)" }} />
                      <div className="absolute inset-y-0" style={{ left: `${((0.256 - 0.18) / (0.31 - 0.18)) * 100}%`, width: 2, background: TC.loss }} />
                    </div>
                    <span className="w-[54px] shrink-0 text-right text-[11px]" style={{ ...monoFont, color: e.ok ? ACCENT : TC.faint }}>{e.value}</span>
                    <span className="w-[168px] shrink-0 text-[10.5px]" style={{ color: TC.faint }}>{e.note}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
              The red line is the random-walk score. Everything Deriv sells as a &ldquo;volatility index&rdquo; sits{" "}
              <b style={{ color: TC.text }}>below</b> it. Range Break 200 sits{" "}
              <b style={{ color: TC.text }}>14.3% above</b> — the only one that does.
            </p>
          </div>
        </Section>

        {/* shootout */}
        <Section n={2} title="Range-breakout, tested on every candidate">
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: TC.line, background: TC.panel }}>
            <table className="w-full text-left text-[12px]" style={{ minWidth: 500 }}>
              <thead>
                <tr style={{ color: TC.faint }}>
                  {["Market", "Settings that held both halves", "Best profit factor", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VOL_SHOOTOUT.map((r, i) => (
                  <tr key={r.name} style={{ borderTop: `1px solid ${TC.line}`, background: i === 0 ? "rgba(56,189,248,0.08)" : undefined }}>
                    <td className="px-4 py-2.5 font-bold">{r.name}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: r.ok ? ACCENT : TC.muted }}>{r.robust}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.profitFactor}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: r.ok ? ACCENT : TC.faint }}>
                        {r.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {r.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
            Before this, the same markets were run through a trend system and a mean-reversion system across{" "}
            <b style={{ color: TC.text }}>{VOL_SEARCH.combinations} combinations</b>, and only{" "}
            <b style={{ color: TC.text }}>{VOL_SEARCH.profitableShare}%</b> were even profitable — where a coin flip
            gives 50% before costs. Doing worse than chance is what paying a spread on a random walk looks like. Range
            Break 200 only works when it is traded as a breakout, which is what it was built to be.
          </p>
        </Section>

        {/* profiles */}
        <Section n={3} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {VOL_PROFILES.map((p) => {
              const Icon = PROFILE_ICON[p.key];
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5"
                  style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(56,189,248,0.08)" : TC.panel }}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} style={{ color: on ? ACCENT : TC.muted }} />
                    <span className="text-[14px] font-bold">{p.label}</span>
                    {on && <CheckCircle2 size={15} className="ml-auto" style={{ color: ACCENT }} />}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{p.blurb}</p>
                  <div className="mt-2 border-t pt-2 text-[10.5px]" style={{ borderColor: TC.line, ...monoFont, color: TC.muted }}>
                    risk {p.riskPerTradePct}% · tested +{p.ret}% · PF {p.profitFactor} · {p.maxDD}% drawdown
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: TC.faint }}>
            This bot holds <b style={{ color: TC.text }}>one position at a time</b>, so there is no portfolio cap to set
            — the per-trade risk is the whole exposure.
          </p>
        </Section>

        {/* how it works */}
        <Section n={4} title="How it trades">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: Crosshair,
                title: "It waits for a real consolidation",
                body: "The last 12 hours must have held a range tighter than 2.5 times current volatility. Anything wider is not a coiled spring, it is just a market already moving, and the bot stands aside. A 12-hour window was decisive: 36 of 108 settings held up with it, and none at all with a 24-hour window.",
              },
              {
                icon: Zap,
                title: "Then it takes the break",
                body: "When a bar closes outside that range, it enters in the break direction — long or short, whichever way it goes. No opinion about direction is needed, which is the point: the market is built to break, not to trend.",
              },
              {
                icon: Scissors,
                title: "Cut small, run far",
                body: "The stop is the wider of 1.2 times volatility and half the broken range, and the target is three times the risk. Beyond 1R the stop trails. About 4 breaks in 10 work — the winners are three times the size of the losers, and that is where the money is.",
              },
              {
                icon: Clock,
                title: "Around the clock",
                body: "Synthetics never close, so there is no session filter and no weekend gap. Decisions are made on closed hourly bars, while the real stop and target sit on the broker's server the entire time.",
              },
            ].map((h) => (
              <div key={h.title} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
                <div className="flex items-center gap-2">
                  <h.icon size={16} style={{ color: ACCENT }} />
                  <span className="text-[13px] font-bold">{h.title}</span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{h.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* results */}
        <Section n={5} title="What it did in testing" right={VOL_TEST.dataset}>
          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
              <ul className="space-y-2.5">
                {[
                  <>Profit factor <b style={{ color: TC.text }}>1.65</b> over <b style={{ color: TC.text }}>{VOL_TEST.trades} trades</b> in a year — the largest sample of any bot here.</>,
                  <>Split in half, the year gives {VOL_TEST.halves.first} and {VOL_TEST.halves.second}. Two independent six-month periods, essentially the same result.</>,
                  <>A <b style={{ color: TC.text }}>{VOL_TEST.winRate}% win rate is by design</b>, not a flaw — most breaks fail small and get cut, and the ones that run pay for them three times over.</>,
                  <>36 of 144 settings survived both halves, so the result is a broad region rather than one lucky needle.</>,
                ].map((li, i) => (
                  <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: ACCENT }} /> <span>{li}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Cost stress test</div>
              <div className="mt-2 space-y-2">
                {VOL_TEST.stress.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span style={{ color: TC.muted }}>{s.label}</span>
                    <span style={{ ...monoFont, color: ACCENT }}>PF {s.profitFactor}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
                Everything was tested at {VOL_TEST.assumedSpread}% spread. The live feed actually quotes{" "}
                <b style={{ color: TC.text }}>{VOL_TEST.liveSpread}%</b>, so the test charged roughly{" "}
                <b style={{ color: TC.text }}>seven times</b> the real dealing cost — and it still held up at four times
                that again.
              </p>
            </div>
          </div>
        </Section>

        {/* install */}
        <Section n={6} title="Put it on your MT5">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              <b style={{ color: TC.text }}>No account, no permissions, no pairing.</b> This EA never talks to Clunoid.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                <>Download the EA into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder (<code style={cx}>File → Open Data Folder</code>).</>,
                <>In MetaEditor press <b style={{ color: TC.text }}>Compile</b>, or restart MT5.</>,
                <>In Market Watch, make sure <code style={cx}>Range Break 200 Index</code> is shown.</>,
                <>Drag the EA onto <b style={{ color: TC.text }}>any chart</b>, set <code style={cx}>InpProfile</code>, enable <b style={{ color: TC.text }}>Algo Trading</b>. It reports whether the market is coiled or too wide straight away.</>,
                <>(Recommended) Right-click → <b style={{ color: TC.text }}>Register a Virtual Server</b> — this market trades through the night.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(56,189,248,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a href="/deriv/ClunoidVolatilityMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: ACCENT, color: TC.ink }}>
                <Download size={15} /> Download Synthetic EA
              </a>
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Minimum lot is {VOL_TEST.minLot} — small accounts are fine here.</span>
            </div>
          </div>
        </Section>

        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border p-4" style={{ borderColor: "rgba(56,189,248,0.35)", background: "rgba(56,189,248,0.07)" }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>Read this before running it.</b> Drawdown on Aggressive reached{" "}
            <b style={{ color: TC.text }}>15.9%</b> in testing — deeper than our other bots, because a breakout system
            takes a run of small losses while it waits for the move that pays. If that would unsettle you, Moderate
            halves it and Conservative more than halves it again, at the same profit factor. Synthetic indices are
            generated products, not real markets, and Deriv can change how they are produced.
          </p>
        </div>

        <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          On {active.label} the bot risks {active.riskPerTradePct}% of your balance per break and holds one position at a
          time. Tested over {VOL_TEST.trades} trades in a single year on one market. Trading carries risk; this is an
          automated tool, not financial advice or a profit guarantee. Past results are not a prediction. Run it on a demo
          account first.
        </p>
      </div>
    </main>
  );
}

const cx = { background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, ...monoFont, fontSize: 11 } as const;

function Section({ n, title, right, children }: { n: number; title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(56,189,248,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
        {right && <span className="ml-auto text-[11px]" style={{ color: TC.faint }}>{right}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
