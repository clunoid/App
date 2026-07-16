"use client";

/**
 * DERIV MT5 — the automations page (Model A, user-hosted EA).
 *
 * No charts, no market noise — just the automations. The user picks a RISK
 * PROFILE and MARKETS; the page shows the live signals the strategy is producing
 * right now (the brain made visible) and the one-time steps to connect their own
 * MT5 terminal via the Clunoid EA (custody-free). The EA polls the same signal
 * API and executes on the user's account.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Bot, Shield, Zap, Gauge, TrendingUp, TrendingDown, Layers, Download, CheckCircle2, CircleDashed, Power } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { PROFILE_LIST } from "@/lib/deriv/mt5/profiles";
import { CATEGORY_LABELS, LIVE_CATEGORIES } from "@/lib/deriv/mt5/markets";
import type { RiskProfile, MarketCategory, Side } from "@/lib/deriv/mt5/types";

type ApiSignal = {
  symbol: string; name: string; side: Side; regime: string; confidence: number;
  entry: number; stopLoss: number; takeProfit: number; riskPct: number; reason: string; digits: number;
};
type ApiResult = {
  profile: RiskProfile; generatedAt: number;
  signals: ApiSignal[];
  standAside: { symbol: string; name: string; regime: string; reason: string }[];
  meta: { evaluated: number; withData: number };
  error?: string;
};

const PROFILE_KEY = "clunoid_mt5_profile";
const CATS: MarketCategory[] = ["forex", "volatility", "crash_boom", "step", "metals", "crypto"];
const PROFILE_ICON: Record<RiskProfile, typeof Shield> = { conservative: Shield, moderate: Gauge, aggressive: Zap };

export function Mt5Bots() {
  const [profile, setProfile] = useState<RiskProfile>("moderate");
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(async (p: RiskProfile) => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/deriv/mt5/signals?profile=${p}&category=forex`, { cache: "no-store" });
      const j = (await res.json()) as ApiResult;
      if (!res.ok || j.error) throw new Error(j.error || "Couldn't load signals.");
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load signals.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let p: RiskProfile = "moderate";
    try { const s = localStorage.getItem(PROFILE_KEY) as RiskProfile | null; if (s) p = s; } catch { /* ignore */ }
    setProfile(p);
    void load(p);
  }, [load]);

  const choose = (p: RiskProfile) => {
    setProfile(p);
    try { localStorage.setItem(PROFILE_KEY, p); } catch { /* ignore */ }
    void load(p);
  };

  const activeProfile = PROFILE_LIST.find((x) => x.key === profile)!;

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">

        {/* header */}
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/deriv" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Deriv
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]"><Bot size={16} style={{ color: TC.profit }} /> MT5 AUTOMATIONS</span>
          <button onClick={() => void load(profile)} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: TC.line, color: TC.muted }}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh signals
          </button>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Deriv MT5 — full automation</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            A continuous scalp + day-trade engine that analyses the markets, opens and closes trades, sets stop-loss and take-profit, banks partial profits on shifts, and sizes every trade to your balance. Pick a risk profile and markets — no charts, no news, just the automation.
          </p>
        </div>

        {err && <div className="mt-4 rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "rgba(242,96,125,0.4)", background: "rgba(242,96,125,0.08)", color: TC.loss }}>{err}</div>}

        {/* 1 · Risk profile */}
        <Section n={1} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILE_LIST.map((p) => {
              const Icon = PROFILE_ICON[p.key];
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => choose(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5"
                  style={{ borderColor: on ? TC.profit : TC.line, background: on ? "rgba(56,189,248,0.08)" : TC.panel }}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} style={{ color: on ? TC.profit : TC.muted }} />
                    <span className="text-[14px] font-bold">{p.label}</span>
                    {on && <CheckCircle2 size={15} className="ml-auto" style={{ color: TC.profit }} />}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{p.blurb}</p>
                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px]" style={{ ...monoFont, color: TC.faint }}>
                    <span>Risk/trade {p.riskPerTradePct}%</span>
                    <span>Max open {p.maxOpenRiskPct}%</span>
                    <span>Adds {p.maxPyramidAdds}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* 2 · Markets */}
        <Section n={2} title="Choose markets">
          <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {CATS.map((c) => {
              const live = LIVE_CATEGORIES.includes(c);
              return (
                <div key={c} className="flex flex-col gap-1 rounded-xl border p-3" style={{ borderColor: live ? TC.profit : TC.line, background: TC.panel, opacity: live ? 1 : 0.6 }}>
                  <span className="text-[12.5px] font-semibold">{CATEGORY_LABELS[c]}</span>
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: live ? TC.profit : TC.faint }}>{live ? "Active" : "Soon"}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: TC.faint }}>Forex is live first (24/5). Volatility & other synthetics (24/7) come online next on the same engine.</p>
        </Section>

        {/* 3 · Live signals */}
        <Section n={3} title="Live signals" right={data ? `${data.signals.length} active · ${data.meta.withData}/${data.meta.evaluated} markets scanned` : undefined}>
          {loading && !data ? (
            <Panel><span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}><Loader2 size={15} className="animate-spin" style={{ color: TC.profit }} /> Scanning the forex basket…</span></Panel>
          ) : data && data.signals.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.signals.map((s) => <SignalCard key={s.symbol} s={s} />)}
            </div>
          ) : (
            <Panel><span className="text-[13px]" style={{ color: TC.muted }}>No entries right now — the engine only fires on a clean regime (that’s the point: it stands aside in the chop). It re-scans continuously.</span></Panel>
          )}
          {data && data.standAside.length > 0 && (
            <details className="mt-3 rounded-xl border p-3" style={{ borderColor: TC.line, background: TC.panel }}>
              <summary className="cursor-pointer text-[12px] font-medium" style={{ color: TC.muted }}>Standing aside on {data.standAside.length} markets — why</summary>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {data.standAside.map((a) => (
                  <div key={a.symbol} className="flex items-center justify-between gap-2 text-[11px]" style={{ color: TC.faint }}>
                    <span className="font-semibold" style={{ color: TC.muted }}>{a.name}</span>
                    <span className="truncate">{a.reason}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Section>

        {/* 4 · How your account trades it (EA setup) */}
        <Section n={4} title="Connect your MT5 — one-time setup">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              Deriv MT5 has no trade API, so execution runs through the <b style={{ color: TC.text }}>Clunoid Expert Advisor</b> in <b style={{ color: TC.text }}>your own</b> terminal — you keep full custody, we never see a password. The EA pulls these signals and trades your account. Put it on a VPS (Deriv/MetaTrader Virtual Hosting, ~$10/mo) and it runs 24/7 while your devices stay free.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                <>Download the Clunoid EA and copy it into MT5’s <code style={cx}>MQL5/Experts</code> folder.</>,
                <>In MT5: <code style={cx}>Tools → Options → Expert Advisors</code> → tick <b style={{ color: TC.text }}>Allow WebRequest</b> and add <code style={cx}>https://www.clunoid.com</code>.</>,
                <>Drag the EA onto any chart, set <b style={{ color: TC.text }}>Risk profile = {activeProfile.label}</b> (matching your choice above), enable <b style={{ color: TC.text }}>Algo Trading</b>.</>,
                <>(Recommended) Right-click the EA → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it trades 24/7 with your PC off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(56,189,248,0.14)", color: TC.profit }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a href="/deriv/ClunoidMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                <Download size={15} /> Download Clunoid EA
              </a>
              <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: TC.faint }}>
                <Power size={13} /> Signal feed: <code style={cx}>www.clunoid.com/api/deriv/mt5/signals</code>
              </span>
            </div>
          </div>
        </Section>

        {/* risk footer */}
        <p className="mt-6 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} />
          The automation risks {activeProfile.riskPerTradePct}% of your balance per trade with a {activeProfile.maxDailyLossPct}% daily-loss cap. Trading carries risk; this is an automated tool, not financial advice or a profit guarantee. Run it on a demo account first.
        </p>
      </div>
    </main>
  );
}

const cx = { background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, ...monoFont, fontSize: 11 } as const;

function Section({ n, title, right, children }: { n: number; title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full text-[10.5px] font-bold" style={{ background: "rgba(56,189,248,0.14)", color: TC.profit }}>{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
        {right && <span className="ml-auto text-[11px]" style={{ color: TC.faint }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="grid place-items-center rounded-2xl border p-8 text-center" style={{ borderColor: TC.line, background: TC.panel }}>{children}</div>;
}

function SignalCard({ s }: { s: ApiSignal }) {
  const buy = s.side === "buy";
  const Dir = buy ? TrendingUp : TrendingDown;
  const color = buy ? TC.profit : TC.loss;
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
      <div className="flex items-center gap-2">
        <Layers size={15} style={{ color: TC.faint }} />
        <span className="text-[13.5px] font-bold">{s.name}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ background: buy ? "rgba(56,189,248,0.16)" : "rgba(242,96,125,0.16)", color }}>
          <Dir size={12} /> {s.side}
        </span>
      </div>
      <div className="mt-1 text-[11px]" style={{ color: TC.faint }}>{s.reason}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[["Entry", s.entry], ["Stop", s.stopLoss], ["Target", s.takeProfit]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg py-1.5" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{k}</div>
            <div className="text-[12.5px] font-bold" style={{ ...monoFont, color: k === "Stop" ? TC.loss : k === "Target" ? TC.profit : TC.text }}>{Number(v).toFixed(s.digits)}</div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[10.5px]" style={{ color: TC.faint }}>
        <span>Risk {s.riskPct}% · {s.regime.replace("_", " ")}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <span className="block h-full rounded-full" style={{ width: `${s.confidence}%`, background: color }} />
          </span>
          {s.confidence}%
        </span>
      </div>
    </div>
  );
}
