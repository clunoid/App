"use client";

/**
 * STOCK INDEX MT5 AI AUTOMATION — this bot's own page.
 *
 * Two stories run side by side here: the indices that earned a place, and the
 * volatility/synthetic bot we tested thoroughly and deliberately did not build.
 * The second is on the page because a negative result honestly reported is worth
 * as much to a trader as a product.
 */
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Shield, Zap, Gauge, Download, CheckCircle2, CircleDashed,
  XCircle, Clock, Crosshair, Layers, Scissors, AlertTriangle, Ban,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import {
  INDEX_PROFILES, INDEX_SHOOTOUT, INDEX_TEST, SYNTHETICS_VERDICT, type IndexProfile,
} from "@/lib/deriv/mt5/indices";

const ACCENT = "#f472b6";

const PROFILE_ICON: Record<IndexProfile["key"], typeof Shield> = {
  conservative: Shield, moderate: Gauge, aggressive: Zap,
};

const HOW = [
  {
    icon: Crosshair,
    title: "Chosen for a wide winning region",
    body: "Swiss 20 held up in 27 of 34 tested settings and Wall Street 30 in 31 of 42, while most other indices managed one or none. A result that survives almost anywhere in the parameter space is a property of the market; one that survives at exactly one setting is usually a property of the search.",
  },
  {
    icon: Clock,
    title: "European and US hours only",
    body: `Trading is restricted to ${INDEX_TEST.session}, which spans the European session and the New York open. Outside those hours index quotes drift on thin volume, and the bot simply stands aside. The window is enforced in GMT so it is right whatever time zone your broker's server runs on.`,
  },
  {
    icon: Layers,
    title: "Entries on the pullback",
    body: "H4 sets the direction with EMA50 against EMA200, H1 has to agree, and price must pull back toward value and then resume before anything is bought. Confidence is scored from trend strength on both timeframes plus market structure.",
  },
  {
    icon: Scissors,
    title: "Levels taken from the chart",
    body: "The stop goes beyond the last real swing plus an ATR buffer and the target is the next structural level at 2R or better. If structure sits too far away to stop sensibly, the setup is skipped rather than stretched.",
  },
];

export function IndicesMt5() {
  const [profile, setProfile] = useState<IndexProfile["key"]>("aggressive");
  const active = INDEX_PROFILES.find((p) => p.key === profile)!;

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
            <Bot size={16} style={{ color: ACCENT }} /> INDEX AUTOMATION
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: "rgba(244,114,182,0.14)", color: ACCENT }}>
            <Clock size={12} /> {INDEX_TEST.session}
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Stock indices — AI automation</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Eleven indices were tested identically; two earned a place. The bot trades{" "}
            <b style={{ color: TC.text }}>Swiss 20 and Wall Street 30</b> through European and US hours, from your own
            terminal and your broker&rsquo;s own prices. One chart runs both.
          </p>
        </div>

        {/* shootout */}
        <Section n={1} title="Every index, tested the same way" right={INDEX_TEST.dataset}>
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: TC.line, background: TC.panel }}>
            <table className="w-full text-left text-[12px]" style={{ minWidth: 520 }}>
              <thead>
                <tr style={{ color: TC.faint }}>
                  {["Index", "Settings that held both halves", "Best profit factor", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INDEX_SHOOTOUT.map((r, i) => (
                  <tr key={r.name} style={{
                    borderTop: `1px solid ${TC.line}`,
                    background: i < 2 ? "rgba(244,114,182,0.08)" : undefined,
                  }}>
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
            Read the middle column, not the right one. Australia 200 posts a flattering 1.92 but reached it in only 4 of
            48 settings — that is a needle, not an edge. Traded together, Swiss 20 and Wall Street 30 held a profit
            factor above 1.20 in both halves of the year across{" "}
            <b style={{ color: TC.text }}>{INDEX_TEST.sharedConfigs.robust} of {INDEX_TEST.sharedConfigs.tested}</b> shared settings.
          </p>
        </Section>

        {/* profiles */}
        <Section n={2} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {INDEX_PROFILES.map((p) => {
              const Icon = PROFILE_ICON[p.key];
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5"
                  style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(244,114,182,0.08)" : TC.panel }}>
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
            &ldquo;Max open&rdquo; is the ceiling for <b style={{ color: TC.text }}>both indices combined</b> — equities
            fall together in a shock, so their risk is summed at full weight rather than treated as diversified.
          </p>
        </Section>

        {/* how */}
        <Section n={3} title="How it decides">
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

        {/* results */}
        <Section n={4} title="What it did in testing">
          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
              <ul className="space-y-2.5">
                {[
                  <>Banks <b style={{ color: TC.text }}>half at 1R</b> and moves the stop to break-even, so the trade can no longer cost you anything.</>,
                  <>Trails the rest behind the market, giving a winner room to reach its target and beyond.</>,
                  <>Adds to a position only while it is already in profit and the account-wide ceiling allows it.</>,
                  <>Banks the profit if the trend flips while the trade is green.</>,
                  <>Both indices were profitable on their own: {INDEX_TEST.perIndex.map((p) => `${p.name} ${p.profitFactor} over ${p.trades} trades`).join(", ")}.</>,
                  <>Split in half, the year gives {INDEX_TEST.halves.first} and {INDEX_TEST.halves.second} — not one lucky stretch.</>,
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
                {INDEX_TEST.stress.map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-[12px]">
                    <span style={{ color: TC.muted }}>{s.label}</span>
                    <span style={{ ...monoFont, color: ACCENT }}>PF {s.profitFactor}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
                {INDEX_TEST.trades} trades at a {INDEX_TEST.winRate}% win rate. Still profitable at four times the real
                dealing cost.
              </p>
            </div>
          </div>
        </Section>

        {/* the bot we did not build */}
        <Section n={5} title="The volatility bot we tested and did not build">
          <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(244,114,182,0.35)", background: "rgba(244,114,182,0.06)" }}>
            <div className="flex items-center gap-2">
              <Ban size={16} style={{ color: ACCENT }} />
              <span className="text-[13px] font-bold">Volatility, Crash, Boom and Jump indices are not tradable</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              We tested {SYNTHETICS_VERDICT.families} — {SYNTHETICS_VERDICT.tested} markets in total — with both a trend
              system and a mean-reversion system, across {SYNTHETICS_VERDICT.combinations} market-by-setting
              combinations. Only <b style={{ color: TC.text }}>{SYNTHETICS_VERDICT.profitableShare}%</b> were even
              profitable, where a coin flip gives 50% before costs. Doing worse than chance is the signature of paying a
              spread on something with no edge in it.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[11.5px]" style={{ minWidth: 460 }}>
                <thead>
                  <tr style={{ color: TC.faint }}>
                    {["Fingerprint", "Deriv synthetics", "A real market"].map((h) => (
                      <th key={h} className="py-1.5 pr-4 text-[10px] font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SYNTHETICS_VERDICT.signatures.map((s) => (
                    <tr key={s.label} style={{ borderTop: `1px solid ${TC.line}` }}>
                      <td className="py-1.5 pr-4" style={{ color: TC.muted }}>{s.label}</td>
                      <td className="py-1.5 pr-4" style={{ ...monoFont, color: TC.loss }}>{s.synthetic}</td>
                      <td className="py-1.5 pr-4" style={{ ...monoFont, color: TC.muted }}>{s.real}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              They carry none of the fingerprints of a real market: no volatility clustering, no fat tails, no momentum,
              and no correlation even to one another. They behave exactly like the generated random walks they are. We
              would rather tell you that than sell you a bot for them.
            </p>
          </div>
        </Section>

        {/* install */}
        <Section n={6} title="Put it on your MT5">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              <b style={{ color: TC.text }}>No account, no permissions, no pairing.</b> This EA never talks to Clunoid.
              One chart runs both indices.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                <>Download the EA and copy it into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder (<code style={cx}>File → Open Data Folder</code>).</>,
                <>In MetaEditor press <b style={{ color: TC.text }}>Compile</b>, or just restart MT5.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any chart</b> — symbol and timeframe do not matter.</>,
                <>Set <code style={cx}>InpProfile</code> and enable <b style={{ color: TC.text }}>Algo Trading</b>. It prints its read for each index and whether the window is open.</>,
                <>(Recommended) Right-click → <b style={{ color: TC.text }}>Register a Virtual Server</b> so the European open is never missed.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(244,114,182,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a href="/deriv/ClunoidIndicesMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: ACCENT, color: TC.ink }}>
                <Download size={15} /> Download Indices EA
              </a>
              <span className="text-[11.5px]" style={{ color: TC.faint }}>
                <code style={cx}>InpSymbols</code> accepts any indices your broker lists.
              </span>
            </div>
          </div>
        </Section>

        {/* balance */}
        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border p-4" style={{ borderColor: "rgba(244,114,182,0.35)", background: "rgba(244,114,182,0.07)" }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>On balance size.</b> Measured on Deriv&rsquo;s live feed, a typical stop at the
            0.10 minimum lot costs about <b style={{ color: TC.text }}>${INDEX_TEST.typicalStopCostUsd}</b>. To hold that
            inside a 1% risk budget you want roughly <b style={{ color: TC.text }}>$2,000</b> or more. Below that the bot
            takes the broker minimum only while the true risk still fits inside your cap and{" "}
            <b style={{ color: TC.text }}>skips what it cannot take safely</b>, printing the exact numbers for your
            account on startup.
          </p>
        </div>

        <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          On {active.label} the bot risks {active.riskPerTradePct}% per trade and never lets total open risk pass{" "}
          {active.maxOpenRiskPct}% across both indices. Tested over {INDEX_TEST.trades} trades in a single year — a
          modest sample chosen from eleven candidates, so weigh it accordingly. Trading carries risk; this is an
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(244,114,182,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
        {right && <span className="ml-auto text-[11px]" style={{ color: TC.faint }}>{right}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
