"use client";

/**
 * General MT5 bot — this bot's page.
 *
 * Install first, then the risk profile, then the live signals the engine is
 * producing right now. The signal panel is unique to this bot: it is the only
 * one driven by Clunoid's cloud feed, so there is something live to show.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, RefreshCw, Bot, Shield, Zap, Gauge, TrendingUp, TrendingDown,
  Layers, Download, CheckCircle2, CircleDashed,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { PROFILE_LIST } from "@/lib/deriv/mt5/profiles";
import { LIVE_CATEGORIES } from "@/lib/deriv/mt5/markets";
import type { RiskProfile, Side } from "@/lib/deriv/mt5/types";

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

const ACCENT = TC.profit;
const PROFILE_KEY = "clunoid_mt5_profile";
const REFRESH_MS = 60_000; // auto-refresh the signal panel every minute

const PROFILE_ICON: Record<RiskProfile, typeof Shield> = {
  conservative: Shield, moderate: Gauge, aggressive: Zap,
};

export function GeneralMt5() {
  const [profile, setProfile] = useState<RiskProfile>("aggressive");
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const started = useRef(false);

  const load = useCallback(async (p: RiskProfile) => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/deriv/mt5/signals?profile=${p}&categories=${LIVE_CATEGORIES.join(",")}`, { cache: "no-store" });
      const j = (await res.json()) as ApiResult;
      if (!res.ok || j.error) throw new Error(j.error || "Couldn't load signals.");
      setData(j); setUpdatedAt(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load signals.");
    } finally { setLoading(false); }
  }, []);

  // initial load, restoring the last-picked profile
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let p: RiskProfile = "aggressive";
    try { const s = localStorage.getItem(PROFILE_KEY) as RiskProfile | null; if (s) p = s; } catch { /* ignore */ }
    setProfile(p);
    void load(p);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => { void load(profile); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [profile, load]);

  const choose = (p: RiskProfile) => {
    setProfile(p);
    try { localStorage.setItem(PROFILE_KEY, p); } catch { /* ignore */ }
    void load(p);
  };

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
            <Bot size={16} style={{ color: ACCENT }} /> MT5 AUTOMATIONS
          </span>
          <div className="ml-auto flex items-center gap-2">
            {updatedAt > 0 && <span className="text-[11px]" style={{ color: TC.faint }}>updated {new Date(updatedAt).toLocaleTimeString()} · auto every 60s</span>}
            <button onClick={() => void load(profile)} disabled={loading} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: TC.line, color: TC.muted }}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
            </button>
          </div>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Deriv MT5 — full automation</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            One Expert Advisor that trades forex and Volatility Indices automatically on your own MetaTrader 5 terminal.
            Install it once on a single chart and it handles the rest.
          </p>
        </div>

        {err && <div className="mt-4 rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "rgba(242,96,125,0.4)", background: "rgba(242,96,125,0.08)", color: TC.loss }}>{err}</div>}

        <Section n={1} title="Get it running">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className="flex flex-wrap items-center gap-3">
              <a href="/deriv/ClunoidMT5.mq5" download className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90" style={{ background: ACCENT, color: TC.ink }}>
                <Download size={15} /> Download Clunoid EA
              </a>
              <span className="text-[11.5px]" style={{ color: TC.faint }}>One EA, one chart — no per-market setup.</span>
            </div>

            <ol className="mt-4 space-y-3">
              {[
                <>Copy the file into MT5&rsquo;s <code style={cx}>MQL5/Experts</code> folder — find it via <code style={cx}>File → Open Data Folder</code>.</>,
                <>In MT5 go to <code style={cx}>Tools → Options → Expert Advisors</code>, tick <b style={{ color: TC.text }}>Allow WebRequest</b> and add <code style={cx}>https://www.clunoid.com</code>.</>,
                <>Restart MT5, or press <b style={{ color: TC.text }}>Compile</b> in MetaEditor. The bot then appears under Expert Advisors.</>,
                <>Drag it onto <b style={{ color: TC.text }}>any one chart</b>, set <code style={cx}>InpProfile</code> to your risk level, and enable <b style={{ color: TC.text }}>Algo Trading</b>.</>,
                <>(Recommended) Right-click the bot → <b style={{ color: TC.text }}>Register a Virtual Server</b> so it keeps trading with your computer off.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "rgba(56,189,248,0.16)", color: ACCENT }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{step}</span>
                </li>
              ))}
            </ol>

            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You keep full custody — it runs on your own terminal and we never see a password. Once it is set up it
              needs nothing further from this page.
            </p>
          </div>
        </Section>

        <Section n={2} title="Choose your risk profile">
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILE_LIST.map((p) => {
              const Icon = PROFILE_ICON[p.key];
              const on = p.key === profile;
              return (
                <button key={p.key} onClick={() => choose(p.key)} className="rounded-2xl border p-4 text-left transition hover:bg-white/5"
                  style={{ borderColor: on ? ACCENT : TC.line, background: on ? "rgba(56,189,248,0.08)" : TC.panel }}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} style={{ color: on ? ACCENT : TC.muted }} />
                    <span className="text-[14px] font-bold">{p.label}</span>
                    {on && <CheckCircle2 size={15} className="ml-auto" style={{ color: ACCENT }} />}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>{p.blurb}</p>
                  <div className="mt-2.5 text-[10.5px]" style={{ ...monoFont, color: TC.faint }}>
                    Risk per trade {p.riskPerTradePct}%
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: TC.faint }}>
            Set the same level in the bot&rsquo;s <code style={cx}>InpProfile</code> input. You can change it at any time
            without reinstalling.
          </p>
        </Section>

        <Section n={3} title="Live signals" right={data ? `${data.signals.length} active · ${data.meta.withData}/${data.meta.evaluated} markets scanned · highest-confidence first` : undefined}>
          {loading && !data ? (
            <Panel><span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}><Loader2 size={15} className="animate-spin" style={{ color: ACCENT }} /> Scanning forex + Volatility…</span></Panel>
          ) : data && data.signals.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.signals.map((s) => <SignalCard key={s.symbol} s={s} />)}
            </div>
          ) : (
            <Panel><span className="text-[13px]" style={{ color: TC.muted }}>No entries right now — the engine only fires on a clean setup. It re-scans continuously and refreshes here every minute.</span></Panel>
          )}
          {data && data.standAside.length > 0 && (
            <details className="mt-3 rounded-xl border p-3" style={{ borderColor: TC.line, background: TC.panel }}>
              <summary className="cursor-pointer text-[12px] font-medium" style={{ color: TC.muted }}>Standing aside on {data.standAside.length} markets</summary>
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

        <p className="mt-7 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          Trading carries risk; this is an automated tool, not financial advice or a profit guarantee. Never risk more
          than you can afford to lose.
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
