"use client";

/**
 * GOLD MT5 AI AUTOMATION — this bot's own page.
 *
 * Unlike the general EA, this one is SELF-CONTAINED: it needs no signal feed and
 * no WebRequest whitelist, because every decision is made on the user's own
 * terminal from their broker's own gold prices. The page therefore explains the
 * strategy and the install, and reports what the strategy actually did in
 * testing rather than promising anything.
 */
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Shield, Zap, Gauge, Download, CheckCircle2, CircleDashed,
  Layers, TrendingUp, Crosshair, Scissors, AlertTriangle,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { GOLD_PROFILES, GOLD_TEST, type GoldProfile } from "@/lib/deriv/mt5/gold";

const PROFILE_ICON: Record<GoldProfile["key"], typeof Shield> = {
  conservative: Shield,
  moderate: Gauge,
  aggressive: Zap,
};

const HOW = [
  {
    icon: TrendingUp,
    title: "Direction before anything else",
    body: "H4 sets the bias with EMA50 against EMA200, then H1 has to agree. If the two timeframes disagree the bot stands down — that is how it reads high and low timeframes together without talking itself into a trade.",
  },
  {
    icon: Crosshair,
    title: "Confidence, scored 0–100",
    body: "Trend alignment, ADX strength on both timeframes, market structure (higher highs and higher lows, or the reverse) and how close price is to value. Below 55 it does not trade at all.",
  },
  {
    icon: Layers,
    title: "Entries on the pullback, never mid-move",
    body: "Price has to pull back toward value and then resume in the trend direction before it will buy. Chasing a move that has already run was the single biggest loser in testing.",
  },
  {
    icon: Scissors,
    title: "Levels that come from the chart",
    body: "The stop sits beyond the last real swing plus an ATR buffer; the target is the next structural level at 2R or better. If structure is too far away to stop sensibly, it skips the setup instead of inventing a level.",
  },
];

export function GoldMt5() {
  const [profile, setProfile] = useState<GoldProfile["key"]>("aggressive");
  const active = GOLD_PROFILES.find((p) => p.key === profile)!;

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
            <Bot size={16} style={{ color: "#fcd34d" }} /> GOLD AUTOMATION
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Gold (XAU/USD) — AI automation</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            A dedicated gold Expert Advisor that reads the trend, waits for a pullback, and only then trades in the
            direction of the market — with the stop and target placed at real levels on the chart. It runs entirely on
            your own terminal, so it uses <b style={{ color: TC.text }}>your broker&rsquo;s own gold prices</b> and needs
            no internet permissions from you.
          </p>
        </div>

        {/* 1 · Risk profile */}
        <Section n={1} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {GOLD_PROFILES.map((p) => {
              const Icon = PROFILE_ICON[p.key];
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => setProfile(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5"
                  style={{ borderColor: on ? "#fcd34d" : TC.line, background: on ? "rgba(252,211,77,0.08)" : TC.panel }}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} style={{ color: on ? "#fcd34d" : TC.muted }} />
                    <span className="text-[14px] font-bold">{p.label}</span>
                    {on && <CheckCircle2 size={15} className="ml-auto" style={{ color: "#fcd34d" }} />}
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
            Set the same level in the EA&rsquo;s <code style={cx}>InpProfile</code> input. The profiles differ only in{" "}
            <b style={{ color: TC.text }}>how much they risk</b> — all three read the market and pick setups exactly the
            same way, so a calmer profile means smaller trades, not a fussier bot.
          </p>
        </Section>

        {/* 2 · How it decides */}
        <Section n={2} title="How it decides">
          <div className="grid gap-3 sm:grid-cols-2">
            {HOW.map((h) => (
              <div key={h.title} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
                <div className="flex items-center gap-2">
                  <h.icon size={16} style={{ color: "#fcd34d" }} />
                  <span className="text-[13px] font-bold">{h.title}</span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{h.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 3 · Managing the trade */}
        <Section n={3} title="What it does once you are in">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <ul className="space-y-2.5">
              {[
                <>Banks <b style={{ color: TC.text }}>half the position at 1R</b> and moves the stop to break-even, so the trade can no longer cost you anything.</>,
                <>Trails the remainder behind the market so a winner is given room to keep running toward 2R and beyond.</>,
                <>Adds to a position <b style={{ color: TC.text }}>only while it is already in profit</b> and the total open risk still fits inside your cap.</>,
                <>If the trend flips while the trade is green, it takes the money rather than giving it back.</>,
                <>Every trade carries a real stop and target on the broker&rsquo;s server from the moment it opens — your account stays protected even if your PC goes off.</>,
              ].map((li, i) => (
                <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: "#fcd34d" }} /> <span>{li}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* 4 · Tested results */}
        <Section n={4} title="What it did in testing" right={GOLD_TEST.dataset}>
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: TC.line, background: TC.panel }}>
            <table className="w-full text-left text-[12px]" style={{ minWidth: 520 }}>
              <thead>
                <tr style={{ color: TC.faint }}>
                  {["Profile", "Trades", "Win rate", "Profit factor", "Avg reward", "Max drawdown"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GOLD_TEST.strategy.map((r) => (
                  <tr key={r.profile} style={{ borderTop: `1px solid ${TC.line}` }}>
                    <td className="px-4 py-2.5 font-semibold">{r.profile}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.trades}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.winRate}%</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: "#fcd34d" }}>{r.profitFactor}</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.avgRR}R</td>
                    <td className="px-4 py-2.5" style={{ ...monoFont, color: TC.muted }}>{r.maxDD}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
            {GOLD_TEST.spreadNote}. The EA itself was then run in the{" "}
            <b style={{ color: TC.text }}>{GOLD_TEST.terminal.label}</b> — {GOLD_TEST.terminal.trades} trades,{" "}
            {GOLD_TEST.terminal.takeProfits} targets hit, {GOLD_TEST.terminal.partials} partials banked,{" "}
            {GOLD_TEST.terminal.returnPct}% return. A win rate near 45% is normal for a method that wins about twice what
            it risks — the edge is in the size of the wins, not how often they come.{" "}
            <b style={{ color: TC.text }}>Past results are not a prediction.</b>
          </p>
        </Section>

        {/* 5 · Install */}
        <Section n={5} title="Put it on your MT5">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              <b style={{ color: TC.text }}>No account, no permissions, no pairing.</b> This EA never talks to Clunoid —
              it analyses gold on your terminal and trades your account directly, so you keep full custody and we never
              see a password.
            </p>

            <ol className="mt-4 space-y-3">
              {[
                <>Download the EA and copy it into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder (<code style={cx}>File → Open Data Folder</code>).</>,
                <>In MetaEditor press <b style={{ color: TC.text }}>Compile</b>, or just restart MT5 — the bot then appears under Expert Advisors.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any XAUUSD chart</b>. The chart&rsquo;s timeframe does not matter; it reads the timeframes it needs itself.</>,
                <>Set <code style={cx}>InpProfile</code> to your risk level and enable <b style={{ color: TC.text }}>Algo Trading</b>. It analyses immediately and reports what it sees in the Experts tab.</>,
                <>(Recommended) Right-click the EA → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it keeps trading with your PC off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(252,211,77,0.16)", color: "#fcd34d" }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a href="/deriv/ClunoidGoldMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: "#fcd34d", color: TC.ink }}>
                <Download size={15} /> Download Gold EA
              </a>
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Set it once — it needs nothing from this page afterwards.</span>
            </div>
          </div>
        </Section>

        {/* account-size reality check */}
        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border p-4" style={{ borderColor: "rgba(252,211,77,0.35)", background: "rgba(252,211,77,0.07)" }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "#fcd34d" }} />
          <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>On balance size.</b> One gold lot is 100 ounces, so even the smallest position
            your broker allows carries real money. Around{" "}
            <b style={{ color: TC.text }}>${GOLD_TEST.comfortableBalanceUsd.toLocaleString()}</b> and up, the bot can size
            every trade to your chosen risk exactly. Below that the broker&rsquo;s minimum lot is larger than your risk
            budget, so the bot takes it only while it still fits inside your cap and{" "}
            <b style={{ color: TC.text }}>skips the trades it cannot take safely</b> — it tells you so in the Experts tab
            on startup rather than quietly over-risking your account.
          </p>
        </div>

        {/* risk footer */}
        <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: "#fcd34d" }} />
          On {active.label} the bot risks {active.riskPerTradePct}% of your balance per trade and never lets total open
          risk pass {active.maxOpenRiskPct}%. Trading carries risk; this is an automated tool, not financial advice or a
          profit guarantee. Run it on a demo account first.
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(252,211,77,0.16)", color: "#fcd34d" }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
        {right && <span className="ml-auto text-[11px]" style={{ color: TC.faint }}>{right}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
