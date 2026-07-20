"use client";

/**
 * FOREX MT5 AI AUTOMATION — this bot's own page.
 *
 * The story here is a shootout: all seven majors were tested identically and
 * only USD/JPY earned a place. The page leads with that table, because a bot
 * that quietly trades six markets which failed testing is the thing we are
 * deliberately not shipping.
 */
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Shield, Zap, Gauge, Download, CheckCircle2, CircleDashed,
  XCircle, Clock, Crosshair, Layers, Scissors, AlertTriangle, Link2,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import {
  FOREX_PROFILES, FOREX_SHOOTOUT, FOREX_SESSION_EVIDENCE, FOREX_TEST, type ForexProfile,
} from "@/lib/deriv/mt5/forex";

const ACCENT = "#34d399";

const PROFILE_ICON: Record<ForexProfile["key"], typeof Shield> = {
  conservative: Shield,
  moderate: Gauge,
  aggressive: Zap,
};

const HOW = [
  {
    icon: Clock,
    title: "It only trades the overlap",
    body: `Restricted to ${FOREX_SESSION_EVIDENCE.window}, when London and New York are both open, ${FOREX_SESSION_EVIDENCE.inSession.robust} of ${FOREX_SESSION_EVIDENCE.inSession.tested} tested configurations held up across both halves of the year. Allowed to trade around the clock, ${FOREX_SESSION_EVIDENCE.allHours.robust} of ${FOREX_SESSION_EVIDENCE.allHours.tested} did, and the typical one lost money. The window is enforced in GMT, so it stays correct whatever time zone your broker's server runs on.`,
  },
  {
    icon: Crosshair,
    title: "Direction agreed on two timeframes",
    body: "H4 sets the bias with EMA50 against EMA200 and H1 must agree, then confidence is scored from ADX strength on both and from market structure. Disagreement means no trade — the majors chop far more than they trend, so standing aside is most of the job.",
  },
  {
    icon: Layers,
    title: "Entries on the pullback",
    body: "Price has to pull back toward value and then resume in the trend direction. Momentum on the majors barely persists hour to hour, so joining a move already under way is how you buy the exhaustion.",
  },
  {
    icon: Scissors,
    title: "Levels from the chart, not from a formula",
    body: "The stop sits beyond the last real swing plus an ATR buffer, and the target is the next structural level at 2R or better. Setups whose structure is too far away to stop sensibly are skipped rather than stretched to fit.",
  },
];

export function ForexMt5() {
  const [profile, setProfile] = useState<ForexProfile["key"]>("aggressive");
  const active = FOREX_PROFILES.find((p) => p.key === profile)!;

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
            <Bot size={16} style={{ color: ACCENT }} /> FOREX AUTOMATION
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: "rgba(52,211,153,0.14)", color: ACCENT }}>
            <Clock size={12} /> {FOREX_SESSION_EVIDENCE.window}
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Major forex — AI automation</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            We tested all seven majors the same way and only one earned a place, so this bot trades{" "}
            <b style={{ color: TC.text }}>USD/JPY</b> during the London–New York overlap. It runs on your own terminal
            from your broker&rsquo;s own prices, and the other pairs are switchable if you want them — but they did not
            pass, and the bot says so rather than quietly trading markets that failed.
          </p>
        </div>

        {/* the shootout */}
        <Section n={1} title="Every major, tested the same way" right={FOREX_TEST.dataset}>
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: TC.line, background: TC.panel }}>
            <table className="w-full text-left text-[12px]" style={{ minWidth: 560 }}>
              <thead>
                <tr style={{ color: TC.faint }}>
                  {["Pair", "Profit factor", "Return", "First half / second half", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FOREX_SHOOTOUT.map((r, i) => (
                  <tr key={r.pair} style={{
                    borderTop: `1px solid ${TC.line}`,
                    background: i === 0 ? "rgba(52,211,153,0.08)" : undefined,
                  }}>
                    <td className="px-4 py-2.5 font-bold">{r.pair}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: r.ok ? ACCENT : TC.loss }}>{r.profitFactor}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: r.ret > 0 ? TC.muted : TC.loss }}>
                      {r.ret > 0 ? "+" : ""}{r.ret}%
                    </td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.halves}</td>
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
            Each pair got the identical strategy and the identical 128-configuration grid, and every candidate was scored
            on the first and second half of the year <b style={{ color: TC.text }}>separately</b> — a setting that only
            works across the whole sample is usually fitted to one regime. For every pair except USD/JPY,{" "}
            <b style={{ color: TC.text }}>not one configuration in the grid survived both halves</b>. USD/CHF and USD/CAD
            came out mildly positive and are available as options, but on too few trades to lean on.
          </p>
        </Section>

        {/* session evidence */}
        <Section n={2} title="The session is the whole edge">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border p-4" style={{ borderColor: ACCENT, background: "rgba(52,211,153,0.08)" }}>
              <div className="text-[24px] font-bold" style={{ color: ACCENT }}>
                {FOREX_SESSION_EVIDENCE.inSession.robust}/{FOREX_SESSION_EVIDENCE.inSession.tested}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>
                robust, trading only {FOREX_SESSION_EVIDENCE.window}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>
                Every single configuration restricted to the London–New York overlap held up across both halves. Median
                profit factor {FOREX_SESSION_EVIDENCE.inSession.medianPF}.
              </p>
            </div>
            <div className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="text-[24px] font-bold" style={{ color: TC.loss }}>
                {FOREX_SESSION_EVIDENCE.allHours.robust}/{FOREX_SESSION_EVIDENCE.allHours.tested}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>
                robust, trading around the clock
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>
                Not one. The typical unrestricted configuration <b style={{ color: TC.text }}>lost money</b>, median
                profit factor {FOREX_SESSION_EVIDENCE.allHours.medianPF}.
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
            That is not a tuned parameter — it is the difference between trading the pair when it is genuinely liquid and
            trading it while it drifts. It is the clearest single result in any of these bots.
          </p>
        </Section>

        {/* risk profile */}
        <Section n={3} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {FOREX_PROFILES.map((p) => {
              const Icon = PROFILE_ICON[p.key];
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5"
                  style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(52,211,153,0.08)" : TC.panel }}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} style={{ color: on ? ACCENT : TC.muted }} />
                    <span className="text-[14px] font-bold">{p.label}</span>
                    {on && <CheckCircle2 size={15} className="ml-auto" style={{ color: ACCENT }} />}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{p.blurb}</p>
                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px]" style={{ ...monoFont, color: TC.faint }}>
                    <span>Risk/trade {p.riskPerTradePct}%</span>
                    <span>Max open {p.maxOpenRiskPct}%</span>
                    <span>Adds {p.maxAdds}</span>
                  </div>
                  <div className="mt-2 border-t pt-2 text-[10.5px]" style={{ borderColor: TC.line, ...monoFont, color: TC.muted }}>
                    tested: +{p.ret}% · PF {p.profitFactor} · {p.maxDD}% drawdown
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: TC.faint }}>
            Set the same level in the EA&rsquo;s <code style={cx}>InpProfile</code> input. &ldquo;Max open&rdquo; is the
            ceiling for <b style={{ color: TC.text }}>all pairs combined</b> — the majors are close to one dollar bet, so
            risk is summed at full weight rather than treated as diversified.
          </p>
        </Section>

        {/* how it decides */}
        <Section n={4} title="How it decides">
          <div className="grid gap-3 sm:grid-cols-2">
            {HOW.map((h) => (
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

        {/* management + stress */}
        <Section n={5} title="What it does once you are in" right={FOREX_TEST.costNote}>
          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
              <ul className="space-y-2.5">
                {[
                  <>Banks <b style={{ color: TC.text }}>half the position at 1R</b> and moves the stop to break-even, so the trade can no longer cost you anything.</>,
                  <>Trails the rest behind the market — wider than the gold and crypto bots, because the majors retrace more inside a move.</>,
                  <>Adds to a position only while it is already in profit and the account-wide ceiling still allows it.</>,
                  <>If the trend flips while the trade is green, it banks the profit rather than giving it back.</>,
                  <>Positions are <b style={{ color: TC.text }}>managed around the clock</b> even though new trades only open in the window — the real stop and target sit on the broker&rsquo;s server from the moment a trade opens.</>,
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
                {FOREX_TEST.stress.map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-[12px]">
                    <span style={{ color: TC.muted }}>{s.label}</span>
                    <span style={{ ...monoFont, color: ACCENT }}>PF {s.profitFactor}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
                Still profitable at four times the real dealing cost — the edge is not a spread artefact.
              </p>
            </div>
          </div>
        </Section>

        {/* install */}
        <Section n={6} title="Put it on your MT5">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              <b style={{ color: TC.text }}>No account, no permissions, no pairing.</b> This EA never talks to Clunoid.
              One chart runs every pair you enable.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                <>Download the EA and copy it into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder (<code style={cx}>File → Open Data Folder</code>).</>,
                <>In MetaEditor press <b style={{ color: TC.text }}>Compile</b>, or just restart MT5.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any chart</b> — the chart&rsquo;s symbol and timeframe do not matter, it reads what it needs itself.</>,
                <>Set <code style={cx}>InpProfile</code> and enable <b style={{ color: TC.text }}>Algo Trading</b>. It prints its read for every pair, and tells you whether the trading window is currently open.</>,
                <>(Recommended) Right-click → <b style={{ color: TC.text }}>Register a Virtual Server</b> so the window is never missed because your PC was asleep.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(52,211,153,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a href="/deriv/ClunoidForexMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: ACCENT, color: TC.ink }}>
                <Download size={15} /> Download Forex EA
              </a>
              <span className="text-[11.5px]" style={{ color: TC.faint }}>
                <code style={cx}>InpSymbols</code> takes any pairs you want; the window is set by <code style={cx}>InpSessionStartGMT</code>.
              </span>
            </div>
          </div>
        </Section>

        {/* balance */}
        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border p-4" style={{ borderColor: "rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.07)" }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>On balance size.</b> This is the friendliest of the three bots for a small
            account. On Deriv a typical USD/JPY stop at the minimum 0.01 lots costs about{" "}
            <b style={{ color: TC.text }}>${FOREX_TEST.typicalStopCostUsd}</b> — measured on the live feed, not estimated
            — so even a few hundred dollars can be sized properly at 1% risk. Where a balance is too small to express the
            risk, the bot takes the broker minimum only while it still fits inside your cap and{" "}
            <b style={{ color: TC.text }}>skips what it cannot take safely</b>, printing the exact numbers for your
            account on startup.
          </p>
        </div>

        {/* the honest counter-argument */}
        <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} style={{ color: TC.faint }} />
            <span className="text-[12.5px] font-bold">What argues against this bot</span>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>
            Two things you should weigh before running it. First,{" "}
            <b style={{ color: TC.text }}>we chose USD/JPY out of 896 combinations</b> — seven pairs against a
            128-setting grid. Test enough combinations and something looks good by luck, which is exactly why every
            candidate had to survive both halves of the year and why the result is reported alongside the six pairs that
            failed. What makes us think it is real rather than lucky: the winners cluster (14 robust settings on USD/JPY,
            none at all on any other pair) and the session split is structural rather than a tuned number.
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>
            Second, the academic evidence for intraday forex rules is genuinely poor. Neely and Weller (2003) tested
            technical rules on intraday FX and found{" "}
            <i>&ldquo;no evidence of excess returns&rdquo;</i> once realistic transaction costs and trading hours were
            applied, and Olson (2004) found moving-average profits decayed from over 3% a year in the early 1980s to
            about zero by the 1990s. Most published FX work that does hold up uses daily bars and much longer lookbacks
            than this bot. Our result is one year of measurement on one broker&rsquo;s data over{" "}
            {FOREX_TEST.trades} trades; it is not a rebuttal of that literature, and you should size it accordingly.
          </p>
        </div>

        <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          On {active.label} the bot risks {active.riskPerTradePct}% per trade and never lets total open risk pass{" "}
          {active.maxOpenRiskPct}% across all pairs. Tested over {FOREX_TEST.trades} trades in a year at a{" "}
          {FOREX_TEST.winRate}% win rate — a deliberately small number of high-quality trades. Trading carries risk; this
          is an automated tool, not financial advice or a profit guarantee. Past results are not a prediction. Run it on
          a demo account first.
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(52,211,153,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
        {right && <span className="ml-auto text-[11px]" style={{ color: TC.faint }}>{right}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
