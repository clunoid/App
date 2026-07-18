"use client";

/**
 * DERIV BOT RUNNER — one bot's trading page (reached from the bot cards). Reuses the
 * command-center connection, a Demo/Real toggle with live balance, config, and live
 * stats + recent trades. The bot is chosen by the route (botId); the engine + the
 * bot's Strategy do the work. Layout mirrors BotsLab's open-bot panel in our design.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Sparkles, Play, Square, Loader2, TrendingUp, TrendingDown, Wallet, Activity, Clock, Target, Layers, Star } from "lucide-react";
import { TC, DOT_GRID, monoFont, fmtBalance } from "@/lib/trading/theme";
import type { ConnectedAccount } from "@/lib/trading/accounts";
import { loadDerivAccess } from "@/lib/deriv/oauth";
import { fetchDerivPortfolioREST } from "@/lib/deriv/api";
import { BOT_DEFAULTS } from "@/lib/deriv/bots/config";
import { DerivBot } from "@/lib/deriv/bots/engine";
import { getBot } from "@/lib/deriv/bots/registry";
import type { BotUI, BotStats, TradeRow } from "@/lib/deriv/bots/types";

type StatusKind = "info" | "success" | "warning" | "error";
type Mode = "demo" | "real";
const SNAP_KEY = "clunoid_deriv_portfolio";
const onlyOptions = (accts: ConnectedAccount[]) => accts.filter((a) => a.kind === "options");

export function DerivBotRunner({ botId }: { botId: string }) {
  const router = useRouter();
  const meta = getBot(botId);

  const [ready, setReady] = useState(false);
  const [access, setAccess] = useState("");
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [mode, setMode] = useState<Mode>("demo");

  const [stake, setStake] = useState(String(BOT_DEFAULTS.initialStake));
  const [takeProfit, setTakeProfit] = useState(String(BOT_DEFAULTS.takeProfit));
  const [stopLoss, setStopLoss] = useState(String(BOT_DEFAULTS.stopLoss));
  const [martingale, setMartingale] = useState(String(meta?.defaultMartingale ?? BOT_DEFAULTS.martingaleMultiplier));

  const [runningState, setRunning] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind: StatusKind } | null>(null);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [liveBalance, setLiveBalance] = useState<{ balance: number | null; currency: string } | null>(null);
  const botRef = useRef<DerivBot | null>(null);

  const refreshAccounts = useCallback(async (acc: string): Promise<ConnectedAccount[]> => {
    try {
      const p = await fetchDerivPortfolioREST(acc);
      const opts = onlyOptions(p.accounts);
      if (opts.length) { setAccounts(opts); setMode((m) => (opts.some((a) => a.isVirtual) ? m : "real")); }
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(p)); } catch { /* ignore */ }
      return opts;
    } catch { return []; }
  }, []);

  useEffect(() => {
    if (!meta) { router.replace("/trading/deriv/bots"); return; }
    const acc = loadDerivAccess();
    if (!acc) { router.replace("/trading/command"); return; }
    setAccess(acc);
    let cached: ConnectedAccount[] = [];
    try {
      const raw = localStorage.getItem(SNAP_KEY);
      if (raw) cached = onlyOptions((JSON.parse(raw) as { accounts?: ConnectedAccount[] }).accounts ?? []);
    } catch { /* ignore */ }
    if (cached.length) { setAccounts(cached); setMode(cached.some((a) => a.isVirtual) ? "demo" : "real"); }
    setReady(true);
    void refreshAccounts(acc);
  }, [router, refreshAccounts, meta]);

  useEffect(() => () => { botRef.current?.stop("Left the page.", "info"); }, []);

  const demoAccount = accounts.find((a) => a.isVirtual) || null;
  const realAccount = accounts.find((a) => !a.isVirtual) || null;
  const selected = mode === "demo" ? demoAccount : realAccount;
  const shownBalance = liveBalance ?? { balance: selected?.balance ?? null, currency: selected?.currency ?? "" };
  const switchMode = (m: Mode) => { if (runningState) return; setMode(m); setLiveBalance(null); };

  const validate = useCallback((): { ok: boolean; msg?: string } => {
    const s = parseFloat(stake), tp = parseFloat(takeProfit), sl = parseFloat(stopLoss), mg = parseFloat(martingale);
    if (!(s >= BOT_DEFAULTS.minStake)) return { ok: false, msg: `Stake must be at least ${BOT_DEFAULTS.minStake}.` };
    if (!(tp > 0)) return { ok: false, msg: "Take profit must be greater than 0." };
    if (!(sl > 0)) return { ok: false, msg: "Stop loss must be greater than 0." };
    if (meta?.supportsMartingale && !(mg >= 1)) return { ok: false, msg: "Martingale multiplier must be at least 1." };
    return { ok: true };
  }, [stake, takeProfit, stopLoss, martingale, meta]);

  const startBot = () => {
    if (!meta) return;
    if (!access) { router.replace("/trading/command"); return; }
    if (!selected) { setStatus({ msg: `No ${mode} account found on your Deriv connection.`, kind: "error" }); return; }
    const v = validate();
    if (!v.ok) { setStatus({ msg: v.msg!, kind: "error" }); return; }

    botRef.current?.stop("Restarting.", "info");
    botRef.current = null;
    setTrades([]); setStats(null); setStatus(null);
    const tradedId = selected.loginid;
    setLiveBalance({ balance: selected.balance, currency: selected.currency });
    const ui: BotUI = {
      onStatus: (msg, kind) => setStatus({ msg, kind }),
      onStats: (s) => setStats(s),
      onTrade: (t) => setTrades((prev) => [t, ...prev].slice(0, 100)),
      onRunning: (r) => {
        setRunning(r);
        if (!r) void refreshAccounts(access).then((opts) => {
          const acct = opts.find((a) => a.loginid === tradedId);
          if (acct && acct.balance != null) setLiveBalance({ balance: acct.balance, currency: acct.currency });
        });
      },
      onBalance: (balance, currency) => setLiveBalance({ balance, currency }),
    };
    const bot = new DerivBot(ui, { accessToken: access, accountId: selected.loginid, currency: selected.currency }, meta.createStrategy());
    botRef.current = bot;
    bot.start({
      initialStake: parseFloat(stake),
      takeProfit: parseFloat(takeProfit),
      stopLoss: parseFloat(stopLoss),
      martingaleMultiplier: meta.supportsMartingale ? parseFloat(martingale) : 1,
    });
  };

  const stopBot = () => botRef.current?.stop("Bot stopped by you.", "info");

  if (!meta || !ready) {
    return (
      <main className="grid min-h-[100dvh] place-items-center" style={{ background: TC.bg, color: TC.text }}>
        <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}>
          <Loader2 size={16} className="animate-spin" style={{ color: TC.profit }} /> Loading…
        </span>
      </main>
    );
  }

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">

        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/deriv/bots" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> All bots
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]"><Bot size={16} style={{ color: TC.profit }} /> DERIV BOTS</span>
        </header>

        {/* bot header */}
        <div className="mt-4 flex flex-wrap items-start gap-3 rounded-2xl border p-5" style={{ borderColor: TC.profit, background: "rgba(56,189,248,0.08)" }}>
          <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "rgba(56,189,248,0.14)" }}><Sparkles size={22} style={{ color: TC.profit }} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-bold">{meta.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(56,189,248,0.16)", color: TC.profit }}><Star size={11} fill={TC.profit} /> {meta.rating.toFixed(1)}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(255,255,255,0.06)", color: TC.faint }}>{meta.markets}</span>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{meta.blurb}</p>
          </div>
        </div>

        {/* account toggle + balance */}
        <section className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(255,255,255,0.015))" }}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(56,189,248,0.14)" }}><Wallet size={19} style={{ color: TC.profit }} /></span>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{mode === "demo" ? "Demo balance" : "Real balance"}{selected ? ` · ${selected.loginid}` : ""}</div>
                <div className="mt-0.5 text-[26px] font-bold leading-none sm:text-[30px]" style={{ ...monoFont, color: mode === "demo" ? TC.text : TC.profit }}>{fmtBalance(shownBalance.balance, shownBalance.currency)}</div>
              </div>
            </div>
            <div className="inline-flex rounded-xl border p-1" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.2)" }}>
              {(["demo", "real"] as const).map((m) => {
                const avail = m === "demo" ? !!demoAccount : !!realAccount;
                const active = mode === m;
                return (
                  <button key={m} onClick={() => switchMode(m)} disabled={runningState || !avail}
                    title={!avail ? `No ${m} account on your Deriv connection` : runningState ? "Stop the bot to switch accounts" : ""}
                    className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold capitalize transition disabled:cursor-not-allowed disabled:opacity-40"
                    style={active ? { background: m === "real" ? TC.profit : "rgba(148,168,189,0.22)", color: m === "real" ? TC.ink : TC.text } : { color: TC.muted }}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          {mode === "real" && <p className="mt-2 text-[11.5px]" style={{ color: TC.loss }}>Real account selected — the bot trades with real money. Test on Demo first.</p>}
        </section>

        {/* configure + run */}
        <Section n={1} title="Configure & run">
          <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <div className={`grid gap-3 ${meta.supportsMartingale ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <Field label="Initial stake (USD)" value={stake} onChange={setStake} min={BOT_DEFAULTS.minStake} step={0.01} disabled={runningState} />
              <Field label="Take profit (USD)" value={takeProfit} onChange={setTakeProfit} min={1} step={1} disabled={runningState} />
              <Field label="Stop loss (USD)" value={stopLoss} onChange={setStopLoss} min={1} step={1} disabled={runningState} />
              {meta.supportsMartingale && <Field label="Martingale ×" value={martingale} onChange={setMartingale} min={1} step={0.1} disabled={runningState} />}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!runningState ? (
                <button onClick={startBot} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                  <Play size={15} /> Start on {mode === "demo" ? "Demo" : "Real"}
                </button>
              ) : (
                <button onClick={stopBot} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.loss, color: "#fff" }}>
                  <Square size={15} /> Stop bot
                </button>
              )}
              {runningState && <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: TC.profit }}><Loader2 size={13} className="animate-spin" /> running on {mode}</span>}
              {status && <span className="text-[12px]" style={{ color: status.kind === "error" ? TC.loss : status.kind === "success" ? TC.profit : status.kind === "warning" ? "#f5c451" : TC.muted }}>{status.msg}</span>}
            </div>
            <p className="mt-3 text-[11px]" style={{ color: TC.faint }}>
              The bot stops automatically at your take-profit or stop-loss (measured on this session&rsquo;s realised P/L). It places real trades on the selected account — test on Demo first.
            </p>
          </div>
        </Section>

        {/* live statistics */}
        <Section n={2} title="Live statistics" right={stats ? `${stats.totalTrades} trades` : undefined}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<Wallet size={14} />} label="Balance" value={fmtBalance(shownBalance.balance, shownBalance.currency)} />
            <Stat icon={<Activity size={14} />} label="Session P/L" value={stats ? `${stats.totalProfit >= 0 ? "+" : ""}${stats.totalProfit.toFixed(2)}` : "—"} tone={stats ? (stats.totalProfit >= 0 ? "profit" : "loss") : undefined} />
            <Stat icon={<Target size={14} />} label="Win rate" value={stats ? `${stats.winRate.toFixed(1)}%` : "—"} sub={stats ? `${stats.wins}/${stats.totalTrades}` : undefined} />
            <Stat icon={<Layers size={14} />} label="Current stake" value={stats ? stats.currentStake.toFixed(2) : "—"} sub={stats ? `${stats.consecutiveLosses} loss streak` : undefined} tone={stats && stats.consecutiveLosses > 0 ? "loss" : undefined} />
            <Stat icon={<Target size={14} />} label="Market" value={stats?.market ?? "—"} sub={stats?.target} />
            <Stat icon={<TrendingDown size={14} />} label="Loss streak" value={stats ? String(stats.consecutiveLosses) : "—"} />
            <Stat icon={<Clock size={14} />} label="Running" value={stats ? fmtTime(stats.runningSeconds) : "00:00:00"} />
            <Stat icon={<Sparkles size={14} />} label="Target" value={stats?.target ?? "—"} />
          </div>
        </Section>

        {/* recent trades */}
        <Section n={3} title="Recent trades" right={trades.length ? `${trades.length}` : undefined}>
          {trades.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border p-8 text-center" style={{ borderColor: TC.line, background: TC.panel }}>
              <span className="text-[13px]" style={{ color: TC.muted }}>No trades yet — start the bot to see live trades appear here.</span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: TC.line }}>
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ background: TC.panel, color: TC.faint }}>
                <span>Result</span><span>Market</span><span>Target</span><span>Stake</span><span className="text-right">Profit</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {trades.map((t, i) => (
                  <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] items-center gap-2 border-t px-4 py-2 text-[12px]" style={{ borderColor: TC.line }}>
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: t.win ? TC.profit : TC.loss }}>{t.win ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {t.win ? "Win" : "Loss"}</span>
                    <span style={{ color: TC.muted }}>{t.market}</span>
                    <span style={{ color: TC.muted }}>{t.target}</span>
                    <span style={{ ...monoFont, color: TC.muted }}>{t.stake.toFixed(2)}</span>
                    <span className="text-right font-bold" style={{ ...monoFont, color: t.win ? TC.profit : TC.loss }}>{t.profit >= 0 ? "+" : ""}{t.profit.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <p className="mt-6 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          Trading carries risk. This is an automated tool, not financial advice or a profit guarantee. Test on a Demo account first and never risk more than you can afford to lose.
        </p>
      </div>
    </main>
  );
}

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

function Field({ label, value, onChange, min, step, disabled }: { label: string; value: string; onChange: (v: string) => void; min: number; step: number; disabled?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{label}</span>
      <input type="number" value={value} min={min} step={step} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border px-3 py-2 text-[13.5px] outline-none transition focus:border-sky-400 disabled:opacity-60"
        style={{ ...monoFont, borderColor: TC.line, background: "rgba(0,0,0,0.2)", color: TC.text }} />
    </label>
  );
}

function Stat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "profit" | "loss" }) {
  const color = tone === "profit" ? TC.profit : tone === "loss" ? TC.loss : TC.text;
  return (
    <div className="rounded-2xl border p-3.5" style={{ borderColor: TC.line, background: TC.panel }}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{icon}{label}</div>
      <div className="mt-1.5 text-[17px] font-bold" style={{ ...monoFont, color }}>{value}</div>
      {sub && <div className="text-[10.5px]" style={{ color: TC.faint }}>{sub}</div>}
    </div>
  );
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
