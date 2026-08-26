"use client";

/**
 * TRADINGVIEW — the free forex signals channel.
 *
 * The page has one job: explain what arrives in the channel, show what a signal
 * looks like before anybody joins, and be honest about what it is not. Nobody
 * installs anything — the script runs on our TradingView account and posts to
 * Telegram, so the reader's only action is to join.
 *
 * What the page deliberately does NOT do is explain how the engine decides.
 * The logic is the same one the Deriv and MT5 bots run, and publishing the
 * entry rules would hand them to anyone who wanted to trade against them.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowUpRight, Activity, BellRing, CandlestickChart, Clock,
  LineChart, ShieldCheck, Target, TriangleAlert,
} from "lucide-react";
import { TC, DOT_GRID } from "@/lib/trading/theme";
import { SupportChat } from "@/components/support/SupportChat";
import { TELEGRAM_CHANNEL } from "@/components/mt5/Mt5Testing";

const MONEY = "#34d399";

/** The majors the engine trades. Spread on anything wider was a losing tax. */
const PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD"];

const STEPS = [
  {
    icon: CandlestickChart,
    title: "The chart is read every 15 minutes",
    body: "Each closed 15-minute candle on every pair is checked against the same engine our bots run. Most bars produce nothing, which is the point.",
  },
  {
    icon: Target,
    title: "A setup gets exact levels",
    body: "When one qualifies it comes with an entry, a stop and a target already calculated from that pair's own volatility — not round numbers picked by eye.",
  },
  {
    icon: BellRing,
    title: "It lands in Telegram in seconds",
    body: "Automatically, from TradingView's servers. Nothing has to be open on anyone's phone or computer, including ours.",
  },
];

export function TradingViewHub() {
  /**
   * Double-click the logo to pull the Pine source down.
   *
   * Undiscoverable rather than secret — the route itself refuses anyone who is
   * not an admin, so a visitor who finds this gesture gets a 404 and learns
   * nothing. The message below is deliberately flat for the same reason.
   */
  const [grab, setGrab] = useState<"" | "busy" | "ok" | "no">("");

  const grabScript = useCallback(async () => {
    setGrab("busy");
    try {
      const res = await fetch("/api/trading/pine", { cache: "no-store" });
      if (!res.ok) {
        setGrab("no");
        setTimeout(() => setGrab(""), 4000);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ClunoidARDE.pine";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setGrab("ok");
    } catch {
      setGrab("no");
    }
    setTimeout(() => setGrab(""), 4000);
  }, []);

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(56,189,248,0.16), transparent 60%)" }}
      />

      <div className="relative z-10 w-full px-5 py-5 sm:px-8 lg:px-12 xl:px-16">
        <header className="flex w-full flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Home
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span
            onDoubleClick={grabScript}
            title=""
            className="inline-flex select-none items-center rounded-lg px-2.5 py-1.5"
            style={{ background: "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/tradingview.svg" alt="TradingView" className="h-4 w-auto object-contain" style={{ maxWidth: 110 }} draggable={false} />
          </span>
          {grab ? (
            <span className="text-[12px]" style={{ color: grab === "no" ? TC.loss : TC.muted }}>
              {grab === "busy" ? "Fetching…" : grab === "ok" ? "Downloaded" : "Not available on this account"}
            </span>
          ) : null}
        </header>

        <div className="w-full">

          {/* ── hero ── */}
          <section className="grid gap-10 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pt-14 xl:gap-16 2xl:gap-24">
            <div>
              <span
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.16em]"
                style={{ borderColor: TC.line, background: "rgba(56,189,248,0.07)", color: TC.profit }}
              >
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: MONEY, boxShadow: `0 0 0 3px rgba(52,211,153,0.18)` }} />
                Free signals · forex majors · 15m
              </span>

              <h1 className="mt-5 text-[32px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[42px] xl:text-[52px] 2xl:text-[58px]">
                Day-trading setups, sent to you the moment they appear
              </h1>

              <p className="mt-4 max-w-[58ch] text-[15.5px] leading-relaxed xl:text-[17px]" style={{ color: TC.muted }}>
                Our engine watches the forex majors on the 15-minute chart. When a setup qualifies, the entry,
                stop and target go straight to Telegram — <b style={{ color: TC.text }}>free, automatic, and the same
                signal our own bots take</b>. You copy it on your own account, or you just watch.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href={TELEGRAM_CHANNEL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-bold transition hover:brightness-110 max-sm:w-full"
                  style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#04202e" }}
                >
                  Join the channel — free <ArrowUpRight size={16} />
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-[14.5px] font-medium transition hover:bg-white/5 max-sm:w-full"
                  style={{ borderColor: TC.line, color: TC.text }}
                >
                  See how it works
                </a>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px]" style={{ color: TC.faint }}>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} style={{ color: TC.profit }} /> Nothing to pay</span>
                <span className="inline-flex items-center gap-1.5"><Clock size={14} style={{ color: TC.profit }} /> Runs while you sleep</span>
                <span className="inline-flex items-center gap-1.5"><Activity size={14} style={{ color: TC.profit }} /> Levels, not vague calls</span>
              </div>
            </div>

            {/* ── what a signal looks like ── */}
            <SampleSignal />
          </section>

          {/* ── how ── */}
          <section id="how" className="scroll-mt-6 pt-16">
            <h2 className="text-[22px] font-extrabold tracking-[-0.015em] sm:text-[27px] xl:text-[31px]">How a signal reaches you</h2>
            <div className="mt-5 grid gap-3.5 sm:grid-cols-3 xl:gap-5">
              {STEPS.map(({ icon: I, title, body }) => (
                <div key={title} className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: "rgba(255,255,255,0.032)" }}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(56,189,248,0.12)" }}>
                    <I size={19} style={{ color: TC.profit }} />
                  </span>
                  <h3 className="mt-3.5 text-[15px] font-bold">{title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── what it watches ── */}
          <section className="pt-14">
            <h2 className="text-[22px] font-extrabold tracking-[-0.015em] sm:text-[27px] xl:text-[31px]">What it watches</h2>
            <p className="mt-3.5 max-w-[62ch] text-[15.5px] leading-relaxed xl:text-[16.5px]" style={{ color: TC.muted }}>
              Seven forex majors, on the 15-minute chart, during the London and New York hours. The list is short
              deliberately: on wider-spread pairs the cost of getting in and out eats the trade before it starts.
            </p>
            <ul className="mt-5 flex list-none flex-wrap gap-2 p-0">
              {PAIRS.map((p) => (
                <li
                  key={p}
                  className="rounded-lg border px-3 py-1.5 text-[13px] font-semibold"
                  style={{ borderColor: TC.line, background: "rgba(255,255,255,0.03)", color: TC.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {p}
                </li>
              ))}
            </ul>

            <div className="mt-5 grid gap-3.5 sm:grid-cols-2 xl:gap-5">
              <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: "rgba(255,255,255,0.032)" }}>
                <h3 className="text-[15px] font-bold">It stands aside more than it trades</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
                  Most of the time the market has not made up its mind, and the engine posts nothing at all. A quiet
                  day in the channel is the system working, not a fault.
                </p>
              </div>
              <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: "rgba(255,255,255,0.032)" }}>
                <h3 className="text-[15px] font-bold">Every signal carries its own risk</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
                  The stop is set from that pair&apos;s current volatility, so you always know what the trade costs you
                  if it is wrong — before you take it.
                </p>
              </div>
            </div>
          </section>

          {/* ── the honest bit ── */}
          <section className="pt-14">
            <div className="rounded-2xl border p-6 xl:p-8" style={{ borderColor: "rgba(242,96,125,0.25)", background: "rgba(242,96,125,0.05)" }}>
              <h2 className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.015em]">
                <TriangleAlert size={20} style={{ color: TC.loss }} /> Read this before you copy anything
              </h2>
              <p className="mt-3.5 max-w-[86ch] text-[14.5px] leading-relaxed" style={{ color: TC.muted }}>
                <b style={{ color: TC.text }}>These are not predictions and they are not advice.</b> They are setups our
                engine rates as worth taking, published so you can decide for yourself. Trading real money carries real
                risk and you can lose what you put in.
              </p>
              <p className="mt-3 max-w-[86ch] text-[14.5px] leading-relaxed" style={{ color: TC.muted }}>
                Some of these trades will hit the stop. That is not a malfunction — a strategy that never loses does not
                exist, and anyone showing you one is selling something. What matters is that the winners are bigger than
                the losers over a long run of trades, which is why every signal carries a reward-to-risk figure.
              </p>
              <p className="mt-3 max-w-[86ch] text-[14.5px] leading-relaxed" style={{ color: TC.muted }}>
                <b style={{ color: TC.text }}>Use the stop. Every time.</b> Risk a small, fixed share of your balance per
                trade and no single signal can hurt you. Never risk money you cannot afford to lose.
              </p>
            </div>
          </section>

          {/* ── join ── */}
          <section className="pt-12 pb-16">
            <div
              className="rounded-[18px] border p-6 xl:p-8"
              style={{ borderColor: TC.line, background: "radial-gradient(130% 150% at 0% 0%, rgba(56,189,248,0.15), transparent 58%), rgba(255,255,255,0.032)" }}
            >
              <h2 className="text-[21px] font-extrabold tracking-[-0.015em] sm:text-[26px]">Free to join. Nothing to install.</h2>
              <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed" style={{ color: TC.muted }}>
                No subscription, no upgrade, no card. The setups arrive whether you trade them or not — plenty of people
                sit and watch for a few weeks before copying anything, which is a sensible way to start.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={TELEGRAM_CHANNEL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-bold transition hover:brightness-110 max-sm:w-full"
                  style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#04202e" }}
                >
                  Join the signals channel <ArrowUpRight size={16} />
                </a>
                <Link
                  href="/trading/deriv/bots"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-[14.5px] font-medium transition hover:bg-white/5 max-sm:w-full"
                  style={{ borderColor: TC.line, color: TC.text }}
                >
                  <LineChart size={16} /> Let a bot trade it instead
                </Link>
              </div>
            </div>
          </section>

        </div>
      </div>

      <SupportChat source="TradingView" />
    </main>
  );
}

/**
 * A real example of the message format, rendered rather than screenshotted so
 * it stays readable at every width and can never go stale against the sender.
 */
function SampleSignal() {
  const rows: [string, string][] = [
    ["Entry", "1.08421"],
    ["Stop", "1.08194"],
    ["Target", "1.08818"],
  ];

  return (
    <div className="relative">
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: TC.line, background: "linear-gradient(180deg, rgba(56,189,248,0.06), rgba(255,255,255,0.015))" }}
      >
        <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: TC.line }}>
          <span className="h-2 w-2 rounded-full" style={{ background: MONEY }} />
          <span className="text-[12px] font-semibold" style={{ color: TC.muted }}>Clunoid Signals</span>
          <span className="ml-auto text-[11.5px]" style={{ color: TC.faint }}>example</span>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[17px] font-extrabold" style={{ color: MONEY }}>🟢 BUY EUR/USD</span>
            <span className="text-[12.5px]" style={{ color: TC.faint }}>· 15m</span>
          </div>

          <dl className="mt-3.5 space-y-1.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center gap-3">
                <dt className="w-[62px] shrink-0 text-[13px]" style={{ color: TC.muted }}>{k}</dt>
                <dd
                  className="text-[14.5px] font-bold"
                  style={{ color: TC.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-3.5 border-t pt-3.5 text-[13px] leading-relaxed" style={{ borderColor: TC.line, color: TC.muted }}>
            Reward:risk <b style={{ color: TC.text }}>1.75</b> · confidence <b style={{ color: TC.text }}>78%</b>
            <br />
            Trend · up · ADX 29
            <div className="mt-2 text-[12.5px]" style={{ color: TC.faint }}>
              Suggested risk: 0.75% of your balance on this trade.
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px]" style={{ color: TC.faint }}>
        Illustrative format — not a past or current trade.
      </p>
    </div>
  );
}
