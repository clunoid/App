"use client";

/**
 * CLUNOID TRADING DESK — the /trading terminal. Admin-only (server-enforced by
 * both API routes; this component just renders what the state route returns).
 *
 * Behaviors:
 *  • loads /api/trading/state on mount, refreshes every 60s while visible
 *  • self-healing scans: if the newest heartbeat is stale (>12 min) it POSTs
 *    /api/trading/scan itself — the desk keeps analyzing even without cron
 *  • Web Push alerts (opt-in bell): a validated signal is pushed from the SERVER,
 *    so it lands even with this tab closed/refreshed; the bell reflects the REAL
 *    subscription state, so it stays on across reloads
 *  • tabs: Desk (live) · Playbooks (validation dossiers) · History (outcomes)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Activity, Bell, BellOff, CalendarClock, History as HistoryIcon, Loader2, RefreshCw, ShieldAlert, TrendingUp } from "lucide-react";
import { PairChart, type Candle, type ChartLevels } from "./PairChart";
import { Playbooks } from "./Playbooks";
import { TerminalBackground } from "./TerminalBackground";
import { currentPushState, enablePush, disablePush, pushSupported } from "./push-client";

/* ── palette (desk-local, deliberately its own product surface) ──
 * Panels are slightly translucent so the grid material reads through them. */
const T = {
  ground: "#060709",
  panel: "rgba(13,17,26,0.82)",
  line: "rgba(140,150,175,0.12)",
  text: "#e8eaf2",
  muted: "#8b93a7",
  faint: "#5c6478",
  accent: "#4fd1c5",
  up: "#34d399",
  down: "#f87171",
  warn: "#d8b45a",
};

type Quote = { pair: string; price?: number; changePct?: number; atrPips?: number; volRegime?: string; ageMin?: number; candles?: Candle[]; error?: string };
type Sig = {
  id: string; pair: string; timeframe: string; direction: "long" | "short"; entry: number; stop: number; targets: number[];
  rr: number; confidence: number; strategy: string; factors: string[]; structure: string; vol_regime: string; session: string;
  news_risk: { level: string; events?: { title: string; currency: string; at: string }[] }; ai_narrative?: string | null;
  warnings: string[]; status: string; result_r?: number | null; created_at: string; resolved_at?: string | null;
};
type State = {
  now: string; marketOpen: boolean; session: string; quotes: Quote[]; signals: Sig[];
  stats: { closed: number; open: number; winRate: number | null; netR: number; profitFactor: number | null };
  scans: { started_at: string; duration_ms: number; market_open: boolean; pairs_ok: number; pairs_err: number; new_signals: number; resolved: number }[];
  calendar: { title: string; currency: string; at: string; forecast?: string; previous?: string }[];
  playbooks: { pair: string; champions: { strategy: string; timeframe: string; oosProfitFactor: number; oosTrades: number }[]; monitorOnly: boolean }[];
};

const digits = (pair: string) => (pair.includes("JPY") ? 3 : 5);
const px = (pair: string, v: number) => v.toFixed(digits(pair));
const fmtMins = (m: number) => (m < 60 ? `${m}m` : m < 60 * 48 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`);
const ago = (iso: string) => fmtMins(Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)));
/** Hold duration between two timestamps (creation → resolution). */
const held = (from: string, to: string) => fmtMins(Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000)));

function ConfidenceRing({ value }: { value: number }) {
  const R = 17;
  const c = 2 * Math.PI * R;
  const color = value >= 80 ? T.up : value >= 65 ? T.accent : T.muted;
  return (
    <div className="relative h-11 w-11 shrink-0" title={`Confidence ${value}%`}>
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(140,150,175,0.15)" strokeWidth="4" />
        <circle cx="22" cy="22" r={R} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[11px] font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "up" | "down" | "warn" | "dim" | "accent" }) {
  const map = { up: [T.up, "rgba(52,211,153,0.12)"], down: [T.down, "rgba(248,113,113,0.12)"], warn: [T.warn, "rgba(216,180,90,0.12)"], dim: [T.muted, "rgba(140,150,175,0.1)"], accent: [T.accent, "rgba(79,209,197,0.12)"] } as const;
  const [fg, bg] = map[tone];
  return <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: fg, background: bg }}>{children}</span>;
}

function SignalCard({ s, onView }: { s: Sig; onView: () => void }) {
  const long = s.direction === "long";
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: long ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)", background: T.panel }}>
      <div className="flex items-center gap-3">
        <ConfidenceRing value={s.confidence} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[16px] font-bold" style={{ color: T.text }}>{s.pair}</span>
            <Chip tone={long ? "up" : "down"}>{s.direction}</Chip>
            <Chip tone="dim">{s.timeframe}</Chip>
            <Chip tone="accent">{s.strategy}</Chip>
            {s.news_risk?.level === "caution" && <Chip tone="warn">news nearby</Chip>}
          </div>
          <div className="mt-0.5 font-mono text-[11px]" style={{ color: T.faint }}>{ago(s.created_at)} ago · {s.session} · vol {s.vol_regime}</div>
        </div>
        <button type="button" onClick={onView} className="ml-auto rounded-md px-2.5 py-1.5 font-mono text-[11px] font-bold transition hover:brightness-125" style={{ color: T.accent, background: "rgba(79,209,197,0.1)" }}>
          chart
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[12px] sm:grid-cols-5">
        <L k="entry" v={px(s.pair, s.entry)} c={T.text} />
        <L k="stop" v={px(s.pair, s.stop)} c={T.down} />
        {s.targets.map((t, i) => <L key={i} k={`tp${i + 1}`} v={px(s.pair, t)} c={T.up} />)}
        <L k="r:r" v={`${s.rr.toFixed(2)}`} c={T.accent} />
      </div>
      <ul className="mt-3 space-y-1">
        {s.factors.map((f) => <li key={f} className="text-[12px]" style={{ color: T.muted }}>▸ {f}</li>)}
        <li className="text-[12px]" style={{ color: T.muted }}>▸ {s.structure}</li>
      </ul>
      {!!s.warnings?.length && s.warnings.map((w) => (
        <p key={w} className="mt-2 flex items-start gap-1.5 text-[11.5px]" style={{ color: T.warn }}><ShieldAlert size={13} className="mt-0.5 shrink-0" />{w}</p>
      ))}
      {s.ai_narrative && (
        <details className="mt-2.5 rounded-lg p-2.5" style={{ background: "rgba(0,0,0,0.25)" }}>
          <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: T.faint }}>desk note (AI)</summary>
          <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed" style={{ color: T.muted }}>{s.ai_narrative}</p>
        </details>
      )}
    </div>
  );
}
const L = ({ k, v, c }: { k: string; v: string; c: string }) => (
  <div className="rounded-md px-2 py-1.5" style={{ background: "rgba(0,0,0,0.3)" }}>
    <div className="text-[9px] uppercase tracking-wider" style={{ color: T.faint }}>{k}</div>
    <div className="text-[13px] font-bold tabular-nums" style={{ color: c }}>{v}</div>
  </div>
);

export function Terminal() {
  const [state, setState] = useState<State | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<"desk" | "playbooks" | "history">("desk");
  const [chartPair, setChartPair] = useState("EURUSD");
  const [levels, setLevels] = useState<ChartLevels>(null);
  const [notify, setNotify] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // ref so the mount-only interval always reads the LATEST state (a captured
  // closure would silently go stale)
  const stateRef = useRef<State | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trading/state", { cache: "no-store" });
      if (res.status === 403) { setDenied(true); return null; }
      if (!res.ok) return null;
      const s = (await res.json()) as State;
      setState(s);
      stateRef.current = s;
      return s;
    } catch {
      return null; // transient — next tick retries
    }
  }, []);

  // self-healing: scan when heartbeats are stale, then refresh
  const maybeScan = useCallback(async (s: State | null) => {
    const last = s?.scans?.[0]?.started_at ? Date.parse(s.scans[0].started_at) : 0;
    if (Date.now() - last < 12 * 60_000) return;
    setScanning(true);
    try {
      await fetch("/api/trading/scan", { method: "POST" });
      await load();
    } finally {
      setScanning(false);
    }
  }, [load]);

  useEffect(() => {
    void load().then((s) => void maybeScan(s));
    // reflect the REAL push-subscription state so the bell is correct after a
    // refresh (the whole fix: the toggle is no longer ephemeral page state)
    void currentPushState().then(setNotify);
    // the interval reads refs, so it never captures a stale closure
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load().then(() => void maybeScan(stateRef.current));
    }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleNotify = useCallback(async () => {
    if (notifyBusy) return;
    setNotifyBusy(true);
    setNotifyMsg(null);
    try {
      if (notify) {
        await disablePush();
        setNotify(false);
      } else {
        if (!pushSupported()) { setNotifyMsg("This browser can't do background alerts."); return; }
        const r = await enablePush();
        setNotify(r.ok);
        setNotifyMsg(r.ok ? "Alerts on — a test push was just sent." : r.reason || "Couldn't enable alerts.");
      }
    } catch {
      setNotifyMsg("Couldn't change alert settings.");
    } finally {
      setNotifyBusy(false);
    }
  }, [notify, notifyBusy]);

  if (denied)
    return (
      <div className="relative grid min-h-[100dvh] place-items-center px-6 text-center" style={{ background: T.ground }}>
        <div className="pointer-events-none fixed inset-0 z-0">
          <TerminalBackground />
        </div>
        <div className="relative z-10">
          <ShieldAlert size={40} className="mx-auto" style={{ color: T.faint }} />
          <h1 className="mt-3 text-xl font-bold" style={{ color: T.text }}>Restricted terminal</h1>
          <p className="mt-1 text-sm" style={{ color: T.muted }}>The trading desk is limited to the Clunoid administrator account.</p>
          <Link href="/home" className="mt-4 inline-block rounded-md px-4 py-2 font-mono text-[12px] font-bold" style={{ color: T.accent, background: "rgba(79,209,197,0.1)" }}>← back home</Link>
        </div>
      </div>
    );

  const open = state?.signals.filter((s) => s.status === "open") ?? [];
  const hist = state?.signals.filter((s) => s.status !== "open") ?? [];
  const chartQuote = state?.quotes.find((q) => q.pair === chartPair);
  const lastScan = state?.scans?.[0];

  return (
    <div className="relative min-h-[100dvh] pb-16" style={{ background: T.ground, color: T.text }}>
      {/* the desk material — pinned to the viewport so it covers every scroll position */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <TerminalBackground />
      </div>
      {/* ── status strip ── */}
      <header className="sticky top-0 z-20 border-b backdrop-blur" style={{ borderColor: T.line, background: "rgba(8,10,14,0.85)" }}>
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 xl:px-10">
          <Link href="/home" aria-label="Home" className="flex items-center gap-1 font-mono text-[12px] font-bold transition hover:brightness-125" style={{ color: T.muted }}>
            <ArrowLeft size={14} /> clunoid
          </Link>
          <span className="font-mono text-[13px] font-bold tracking-wide" style={{ color: T.accent }}>TRADING DESK</span>
          <span className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color: state?.marketOpen ? T.up : T.down }}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: state?.marketOpen ? T.up : T.down }} />
            {state ? (state.marketOpen ? `OPEN · ${state.session}` : "MARKET CLOSED") : "…"}
          </span>
          <span className="hidden font-mono text-[11px] sm:inline" style={{ color: T.faint }}>
            last scan {lastScan ? `${ago(lastScan.started_at)} ago · ${lastScan.pairs_ok} pairs · ${lastScan.duration_ms}ms` : "—"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => void maybeScan(null)} disabled={scanning} title="Run a scan now" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[11px] font-bold transition hover:brightness-125 disabled:opacity-50" style={{ color: T.muted, background: "rgba(140,150,175,0.08)" }}>
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} scan
            </button>
            <button type="button" onClick={() => void toggleNotify()} disabled={notifyBusy} title="Background push alerts — survive refresh & closed tabs" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[11px] font-bold transition hover:brightness-125 disabled:opacity-50" style={{ color: notify ? T.accent : T.muted, background: notify ? "rgba(79,209,197,0.12)" : "rgba(140,150,175,0.08)" }}>
              {notifyBusy ? <Loader2 size={13} className="animate-spin" /> : notify ? <Bell size={13} /> : <BellOff size={13} />} {notify ? "alerts on" : "alerts"}
            </button>
          </div>
        </div>
        {notifyMsg && (
          <div className="flex items-center gap-2 border-t px-4 py-1.5 font-mono text-[11px] sm:px-6 xl:px-10" style={{ borderColor: T.line, color: T.accent, background: "rgba(79,209,197,0.06)" }}>
            <Bell size={12} /> {notifyMsg}
            <button type="button" onClick={() => setNotifyMsg(null)} className="ml-auto hover:brightness-125" style={{ color: T.faint }}>dismiss</button>
          </div>
        )}
      </header>

      <main className="relative z-10 w-full px-4 pt-4 sm:px-6 xl:px-10">
        {!state ? (
          <div className="grid h-[60dvh] place-items-center"><Loader2 size={28} className="animate-spin" style={{ color: T.faint }} /></div>
        ) : (
          <>
            {/* ── watchlist ── */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {state.quotes.map((q) => {
                const pb = state.playbooks.find((p) => p.pair === q.pair);
                return (
                  <button key={q.pair} type="button" onClick={() => { setChartPair(q.pair); setLevels(null); }} className="rounded-xl border p-3 text-left transition hover:brightness-110" style={{ borderColor: chartPair === q.pair ? "rgba(79,209,197,0.4)" : T.line, background: T.panel }}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[13px] font-bold">{q.pair}</span>
                      {pb?.monitorOnly ? <Chip tone="dim">monitor</Chip> : <Chip tone="accent">live</Chip>}
                    </div>
                    {q.error ? (
                      <p className="mt-1 text-[11px]" style={{ color: T.warn }}>data unavailable</p>
                    ) : (
                      <>
                        <div className="mt-1 font-mono text-[18px] font-bold tabular-nums">{q.price !== undefined ? px(q.pair, q.price) : "—"}</div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px]" style={{ color: T.faint }}>
                          <span style={{ color: (q.changePct ?? 0) >= 0 ? T.up : T.down }}>{(q.changePct ?? 0) >= 0 ? "+" : ""}{q.changePct}%</span>
                          <span>ATR {q.atrPips}p</span>
                          <span>{q.volRegime}</span>
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── tabs ── */}
            <div className="mt-4 flex items-center gap-1.5">
              {([["desk", "Desk", TrendingUp], ["playbooks", "Playbooks", Activity], ["history", "History", HistoryIcon]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[12px] font-bold transition" style={tab === id ? { color: T.accent, background: "rgba(79,209,197,0.12)" } : { color: T.muted }}>
                  <Icon size={13} /> {label}
                </button>
              ))}
              <span className="ml-auto font-mono text-[11px]" style={{ color: T.faint }}>
                {state.stats.closed} closed · net {state.stats.netR}R{state.stats.profitFactor ? ` · PF ${state.stats.profitFactor}` : ""}{state.stats.winRate !== null ? ` · ${Math.round(state.stats.winRate * 100)}% win` : ""}
              </span>
            </div>

            {tab === "playbooks" && <div className="mt-3"><Playbooks /></div>}

            {tab === "history" && (
              <div className="mt-3 overflow-x-auto rounded-xl border" style={{ borderColor: T.line, background: T.panel }}>
                <table className="w-full font-mono text-[12px]">
                  <thead>
                    <tr className="text-left" style={{ color: T.faint }}>
                      {["time", "pair", "dir", "strategy", "entry", "outcome", "R", "held"].map((h) => <th key={h} className="px-3 py-2 text-[10px] uppercase tracking-wider">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {hist.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center" style={{ color: T.faint }}>No resolved signals yet — history builds as the scanner runs.</td></tr>}
                    {hist.map((s) => (
                      <tr key={s.id} className="border-t" style={{ borderColor: T.line }}>
                        <td className="px-3 py-2" style={{ color: T.faint }}>{s.created_at.slice(5, 16).replace("T", " ")}</td>
                        <td className="px-3 py-2 font-bold">{s.pair}</td>
                        <td className="px-3 py-2"><Chip tone={s.direction === "long" ? "up" : "down"}>{s.direction}</Chip></td>
                        <td className="px-3 py-2" style={{ color: T.muted }}>{s.strategy}</td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: T.muted }}>{px(s.pair, s.entry)}</td>
                        <td className="px-3 py-2"><Chip tone={s.status === "tp" ? "up" : s.status === "sl" ? "down" : "dim"}>{s.status}</Chip></td>
                        <td className="px-3 py-2 font-bold tabular-nums" style={{ color: (s.result_r ?? 0) >= 0 ? T.up : T.down }}>{s.result_r?.toFixed(2) ?? "—"}</td>
                        <td className="px-3 py-2" style={{ color: T.faint }}>{s.resolved_at ? held(s.created_at, s.resolved_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "desk" && (
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0">
                  {/* chart */}
                  <div className="rounded-xl border p-3" style={{ borderColor: T.line, background: T.panel }}>
                    <div className="mb-1 flex items-center gap-2 font-mono text-[11px]" style={{ color: T.faint }}>
                      <span className="font-bold" style={{ color: T.text }}>{chartPair}</span> · H1 · data age {chartQuote?.ageMin ?? "—"}m
                      {levels?.entry && <span style={{ color: T.accent }}>· signal levels shown</span>}
                    </div>
                    {chartQuote?.candles?.length ? <PairChart candles={chartQuote.candles} levels={levels} height={380} /> : <div className="grid h-64 place-items-center text-[12px]" style={{ color: T.faint }}>no chart data</div>}
                  </div>
                  {/* signals */}
                  <h2 className="mt-4 mb-2 font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: T.faint }}>Active signals</h2>
                  {open.length === 0 ? (
                    <div className="rounded-xl border px-4 py-8 text-center" style={{ borderColor: T.line, background: T.panel }}>
                      <p className="text-[13px] font-semibold" style={{ color: T.muted }}>No qualifying setups right now.</p>
                      <p className="mt-1 text-[12px]" style={{ color: T.faint }}>The scanner only signals validated, high-confidence conditions — standing aside is a position too.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2 min-[1900px]:grid-cols-3">
                      {open.map((s) => (
                        <SignalCard key={s.id} s={s} onView={() => { setChartPair(s.pair); setLevels({ entry: s.entry, stop: s.stop, targets: s.targets, direction: s.direction }); }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* right rail */}
                <aside className="space-y-3">
                  <div className="rounded-xl border p-3" style={{ borderColor: T.line, background: T.panel }}>
                    <h3 className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: T.faint }}><CalendarClock size={12} /> High-impact calendar</h3>
                    <ul className="mt-2 space-y-2">
                      {state.calendar.length === 0 && <li className="text-[12px]" style={{ color: T.faint }}>Quiet — no high-impact events ahead this week.</li>}
                      {state.calendar.map((e) => (
                        <li key={`${e.at}-${e.title}`} className="flex items-baseline gap-2 text-[12px]">
                          <span className="font-mono text-[10px] font-bold" style={{ color: T.warn }}>{e.currency}</span>
                          <span className="min-w-0 flex-1 truncate" style={{ color: T.muted }}>{e.title}</span>
                          <span className="font-mono text-[10px]" style={{ color: T.faint }}>{new Date(e.at).toUTCString().slice(0, 22)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: T.line, background: T.panel }}>
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: T.faint }}>Playbooks in force</h3>
                    <ul className="mt-2 space-y-1.5">
                      {state.playbooks.map((p) => (
                        <li key={p.pair} className="flex items-center gap-2 font-mono text-[11.5px]">
                          <span className="font-bold" style={{ color: T.text }}>{p.pair}</span>
                          {p.monitorOnly ? (
                            <span style={{ color: T.faint }}>monitor only — no strategy passed validation</span>
                          ) : (
                            <span style={{ color: T.muted }}>{p.champions.map((c) => `${c.strategy}@${c.timeframe} (PF ${c.oosProfitFactor})`).join(", ")}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: T.line, background: T.panel }}>
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: T.faint }}>Scanner health</h3>
                    <ul className="mt-2 space-y-1 font-mono text-[10.5px]" style={{ color: T.faint }}>
                      {state.scans.slice(0, 8).map((s) => (
                        <li key={s.started_at} className="flex gap-2">
                          <span>{s.started_at.slice(11, 16)}Z</span>
                          <span style={{ color: s.pairs_err ? T.warn : T.muted }}>{s.pairs_ok}ok{s.pairs_err ? ` ${s.pairs_err}err` : ""}</span>
                          <span>{s.new_signals ? `+${s.new_signals} sig` : ""}{s.resolved ? ` ✓${s.resolved}` : ""}</span>
                          <span className="ml-auto">{s.duration_ms}ms</span>
                        </li>
                      ))}
                      {!state.scans.length && <li>No heartbeats yet — first scan runs on cron or via the scan button.</li>}
                    </ul>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
