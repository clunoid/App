"use client";

/**
 * CRYPTO MT5 AI AUTOMATION — this bot's own page.
 *
 * Self-contained like the gold bot (no signal feed, no WebRequest whitelist),
 * but multi-symbol and 24/7. The page leads with the three things we MEASURED on
 * real BTC/ETH data, because those measurements are the reason this bot differs
 * from the gold one — including the finding that crypto does not trend the way
 * the folklore says.
 */
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Shield, Zap, Gauge, Download, CheckCircle2, CircleDashed,
  Layers, Crosshair, Scissors, AlertTriangle, Clock, Link2,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { CRYPTO_PROFILES, CRYPTO_TEST, CRYPTO_EVIDENCE, type CryptoProfile } from "@/lib/deriv/mt5/crypto";

const ACCENT = "#a78bfa";

const PROFILE_ICON: Record<CryptoProfile["key"], typeof Shield> = {
  conservative: Shield,
  moderate: Gauge,
  aggressive: Zap,
};

const HOW = [
  {
    icon: Link2,
    title: "One risk ceiling across every coin",
    body: "Because Bitcoin and Ether move together, their risk is added up at full weight against a single account-wide limit. On Aggressive that means 5% of crypto exposure in total — not 5% per coin. This is the feature a single-market bot does not need and the one most likely to save your account in a crash.",
  },
  {
    icon: Crosshair,
    title: "It trades rarely, on purpose",
    body: "Raising the confidence floor improved results steadily right across the range we tested, so the bar is set high: H4 and H1 must agree on direction, ADX must confirm strength on both, and structure has to line up. That is roughly one trade a week, not one an hour.",
  },
  {
    icon: Layers,
    title: "Entries on the pause, never the run",
    body: "Price has to pull back toward value and then resume before the bot will act. Since crypto momentum does not reliably persist, joining a move already in flight is exactly how you buy the top.",
  },
  {
    icon: Scissors,
    title: "Stops that respect the tails",
    body: "Every stop is placed beyond real structure and sized from current volatility, never in fixed dollars — the same coin can trade at $20,000 or $100,000. If structure sits too far away to stop sensibly, the setup is skipped instead of stretched.",
  },
];

export function CryptoMt5() {
  const [profile, setProfile] = useState<CryptoProfile["key"]>("aggressive");
  const active = CRYPTO_PROFILES.find((p) => p.key === profile)!;

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
            <Bot size={16} style={{ color: ACCENT }} /> CRYPTO AUTOMATION
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: "rgba(167,139,250,0.14)", color: ACCENT }}>
            <Clock size={12} /> 24/7
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Crypto (BTC + ETH) — AI automation</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            A Bitcoin and Ether specialist that runs around the clock, because crypto never closes. One chart drives both
            coins, every decision is made on your own terminal from your broker&rsquo;s own prices, and the two coins
            share a single risk ceiling — the thing that matters most when everything in crypto falls at once.
          </p>
        </div>

        {/* what the data actually said */}
        <Section n={1} title="What we measured before designing it">
          <div className="grid gap-3 sm:grid-cols-3">
            {CRYPTO_EVIDENCE.map((e) => (
              <div key={e.label} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
                <div className="text-[24px] font-bold" style={{ color: ACCENT }}>{e.stat}</div>
                <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{e.label}</div>
                <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{e.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
            Measured on {CRYPTO_TEST.dataset}. The first of those is the uncomfortable one:{" "}
            <b style={{ color: TC.text }}>crypto does not trend as reliably as it is said to</b>, at least not at the
            hours-to-days horizon a bot trades. We would rather tell you that than sell you a momentum story.
          </p>
        </Section>

        {/* risk profile */}
        <Section n={2} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {CRYPTO_PROFILES.map((p) => {
              const Icon = PROFILE_ICON[p.key];
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5"
                  style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(167,139,250,0.08)" : TC.panel }}>
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
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: TC.faint }}>
            Set the same level in the EA&rsquo;s <code style={cx}>InpProfile</code> input. &ldquo;Max open&rdquo; is the
            ceiling for <b style={{ color: TC.text }}>all coins combined</b>, not per coin.
          </p>
        </Section>

        {/* how it decides */}
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

        {/* management */}
        <Section n={4} title="What it does once you are in">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <ul className="space-y-2.5">
              {[
                <>Banks <b style={{ color: TC.text }}>half the position at 1R</b> and moves the stop to break-even, so the trade can no longer cost you anything.</>,
                <>Trails the rest behind the market, giving a winner room to reach its 2R target and beyond.</>,
                <>Adds to a position only while it is already in profit <b style={{ color: TC.text }}>and</b> the account-wide crypto ceiling still allows it.</>,
                <>If the trend flips while the trade is green, it banks the profit rather than giving it back.</>,
                <>The real stop and target sit on the broker&rsquo;s server from the moment a trade opens — crypto moves hardest at 3am, and your account stays protected whether or not your PC is on.</>,
              ].map((li, i) => (
                <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: ACCENT }} /> <span>{li}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* results */}
        <Section n={5} title="What it did in testing" right={CRYPTO_TEST.dataset}>
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: TC.line, background: TC.panel }}>
            <table className="w-full text-left text-[12px]" style={{ minWidth: 540 }}>
              <thead>
                <tr style={{ color: TC.faint }}>
                  {["Profile", "Return", "Trades", "Win rate", "Profit factor", "Max drawdown"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CRYPTO_TEST.profiles.map((r) => (
                  <tr key={r.profile} style={{ borderTop: `1px solid ${TC.line}` }}>
                    <td className="px-4 py-2.5 font-semibold">{r.profile}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.profit }}>+{r.ret}%</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.trades}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.winRate}%</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: ACCENT }}>{r.profitFactor}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.maxDD}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
            {CRYPTO_TEST.costNote}. Split in half, the year gives a profit factor of{" "}
            <b style={{ color: TC.text }}>{CRYPTO_TEST.halves.first}</b> in the first six months and{" "}
            <b style={{ color: TC.text }}>{CRYPTO_TEST.halves.second}</b> in the second, so it is not one lucky stretch.
            Two honest caveats: this is <b style={{ color: TC.text }}>49 trades</b>, which is a modest sample, and the
            two coins did not contribute equally — Bitcoin{" "}
            {CRYPTO_TEST.perCoin[0].profitFactor} over {CRYPTO_TEST.perCoin[0].trades} trades versus Ether{" "}
            {CRYPTO_TEST.perCoin[1].profitFactor} over only {CRYPTO_TEST.perCoin[1].trades}. Ether&rsquo;s figure is
            flattering and rests on too few trades to lean on.{" "}
            <b style={{ color: TC.text }}>Past results are not a prediction.</b>
          </p>
        </Section>

        {/* install */}
        <Section n={6} title="Put it on your MT5">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              <b style={{ color: TC.text }}>No account, no permissions, no pairing.</b> This EA never talks to Clunoid.
              One chart runs every coin — you do not need a chart per coin.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                <>Download the EA and copy it into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder (<code style={cx}>File → Open Data Folder</code>).</>,
                <>In MetaEditor press <b style={{ color: TC.text }}>Compile</b>, or just restart MT5.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any chart at all</b> — the chart&rsquo;s symbol and timeframe are irrelevant, it reads what it needs for each coin itself.</>,
                <>Set <code style={cx}>InpProfile</code> and enable <b style={{ color: TC.text }}>Algo Trading</b>. It reports what it sees for every coin in the Experts tab straight away.</>,
                <>(Recommended) Right-click → <b style={{ color: TC.text }}>Register a Virtual Server</b>. Crypto trades through the night, so this one really benefits from a VPS.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(167,139,250,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a href="/deriv/ClunoidCryptoMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: ACCENT, color: TC.ink }}>
                <Download size={15} /> Download Crypto EA
              </a>
              <span className="text-[11.5px]" style={{ color: TC.faint }}>
                Want more coins? The <code style={cx}>InpSymbols</code> input takes any list your broker offers.
              </span>
            </div>
          </div>
        </Section>

        {/* balance reality check */}
        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border p-4" style={{ borderColor: "rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.07)" }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>On balance size.</b> Crypto is friendlier to a small account than gold: Deriv&rsquo;s
            minimum is {CRYPTO_TEST.minLots.btc} on Bitcoin and {CRYPTO_TEST.minLots.eth} on Ether, so a typical stop
            costs single-digit dollars. From roughly{" "}
            <b style={{ color: TC.text }}>${CRYPTO_TEST.comfortableBalanceUsd.toLocaleString()}</b> the bot can size every
            trade to your chosen risk exactly. Below that it takes the broker minimum only while the true risk still fits
            inside your cap, and <b style={{ color: TC.text }}>skips what it cannot take safely</b> — it prints the exact
            numbers for your account in the Experts tab on startup.
          </p>
        </div>

        <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          On {active.label} the bot risks {active.riskPerTradePct}% of your balance per trade and never lets total open
          crypto risk pass {active.maxOpenRiskPct}% across all coins combined. Crypto is volatile and trades through the
          night; this is an automated tool, not financial advice or a profit guarantee. Run it on a demo account first.
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(167,139,250,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
        {right && <span className="ml-auto text-[11px]" style={{ color: TC.faint }}>{right}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
