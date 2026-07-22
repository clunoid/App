"use client";

/**
 * Aggressive MT5 — the free all-in-one automation's page. Unlike the paid MT5
 * automations, this one is FREE and SELF-CONTAINED: its full analysis runs on the
 * user's own terminal (no signal feed, no connection), and it trades in a single
 * aggressive risk mode — there is no profile selector.
 */
import Link from "next/link";
import { ArrowLeft, Bot, Shield, Zap, Download, CircleDashed, Cpu, Clock, Gauge } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";

const ACCENT = "#34d399";

const FEATURES = [
  { icon: Cpu, t: "Runs entirely on your terminal", s: "The full strategy is inside the Expert Advisor — no signal feed, no connection, nothing to sign into. It analyses and trades on its own." },
  { icon: Zap, t: "One aggressive setting", s: "Full position size and the widest open-risk cap. No profile to choose — it trades at full throttle out of the box." },
  { icon: Clock, t: "Forex + Volatility, together", s: "Forex majors during the London/New York overlap; Deriv Volatility indices around the clock. One chart runs the whole basket." },
  { icon: Shield, t: "Sized to your balance, always stopped", s: "Every position is volatility-sized to your account and carries a hard stop the moment it opens." },
];

export function AggressiveMt5() {
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
            <Bot size={16} style={{ color: ACCENT }} /> AGGRESSIVE MT5
          </span>
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(52,211,153,0.16)", color: ACCENT }}>Free</span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Aggressive MT5</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            The free all-in-one automation. One Expert Advisor covers forex majors and Deriv Volatility indices
            together, running its whole analysis on your own MT5 terminal — no signal feed, no connection required. It
            trades in a single aggressive risk mode, sized to your balance with a hard stop on every position.
          </p>
        </div>

        <Section n={1} title="What it does">
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.t} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} style={{ color: ACCENT }} />
                    <span className="text-[14px] font-bold">{f.t}</span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: TC.muted }}>{f.s}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <Gauge size={15} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
            Under the hood it&rsquo;s a disciplined trend engine — it waits for a pullback in the direction of the
            prevailing trend, enters on the resumption, and manages risk to a fixed fraction of your balance. It&rsquo;s
            the same core strategy as our forex automation, tuned to run wide-open across the whole basket.
          </p>
        </Section>

        <Section n={2} title="Get it running">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex flex-wrap items-center gap-3">
              <a href="/mt5/ClunoidAggressiveMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: ACCENT, color: TC.ink }}>
                <Download size={15} /> Download EA — free
              </a>
              <span className="text-[11.5px]" style={{ color: TC.faint }}>Add the forex majors and Volatility indices to Market Watch so it can trade the full basket.</span>
            </div>

            <ol className="mt-4 space-y-3">
              {[
                <>Copy the file into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder — find it via <code style={cx}>File → Open Data Folder</code>.</>,
                <>Restart MT5, or press <b style={{ color: TC.text }}>Compile</b> in MetaEditor. The automation then appears under Expert Advisors.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any one chart</b> — it manages the whole basket itself — and enable <b style={{ color: TC.text }}>Algo Trading</b>. There&rsquo;s no risk profile to set: it runs in aggressive mode by design.</>,
                <>(Recommended) Right-click the chart → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it keeps trading with your computer off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(52,211,153,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You keep full custody — it runs entirely on your own terminal and we never see a password. Forex trades
              only during the London/New York overlap; the Volatility indices trade 24/7.
            </p>
          </div>
        </Section>

        <p className="mt-7 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          Trading carries risk. This is an automated tool, not financial advice or a profit guarantee. Never risk more than you can afford to lose.
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
        <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold" style={{ background: "rgba(52,211,153,0.16)", color: ACCENT }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
