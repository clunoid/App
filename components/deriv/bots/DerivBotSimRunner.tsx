"use client";

/**
 * DERIV BOT SIM RUNNER — same three-column layout as DerivBotRunner; uses
 * SimulatedDerivBot + editable balance instead of a live Deriv connection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Square, Loader2, TrendingUp, TrendingDown, Wallet, Star, Trophy, ShieldAlert, X, PiggyBank, Lightbulb, Check } from "lucide-react";
import { TC, DOT_GRID, monoFont, fmtBalance } from "@/lib/trading/theme";
import { BOT_DEFAULTS } from "@/lib/deriv/bots/config";
import { SimulatedDerivBot } from "@/lib/deriv/bots/simEngine";
import { getSimBalance } from "@/lib/deriv/bots/simBalance";
import { getBot } from "@/lib/deriv/bots/registry";
import type { BotUI, BotStats, TradeRow } from "@/lib/deriv/bots/types";

type StatusKind = "info" | "success" | "warning" | "error";
const RECOMMENDED_BALANCE = 1000;

export function DerivBotSimRunner({ botId }: { botId: string }) {
  const router = useRouter();
  const meta = getBot(botId);

  const [ready, setReady] = useState(false);
  const [simBalance, setSimBalance] = useState(1000);

  const [stake, setStake] = useState(String(BOT_DEFAULTS.initialStake));
  const [takeProfit, setTakeProfit] = useState(String(BOT_DEFAULTS.takeProfit));
  const [stopLoss, setStopLoss] = useState(String(BOT_DEFAULTS.stopLoss));
  const [martingale, setMartingale] = useState(String(meta?.defaultMartingale ?? BOT_DEFAULTS.martingaleMultiplier));

  const [runningState, setRunning] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind: StatusKind } | null>(null);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [liveBalance, setLiveBalance] = useState<{ balance: number | null; currency: string }>({ balance: null, currency: "USD" });
  const [finish, setFinish] = useState<{ kind: "take-profit" | "stop-loss"; summary: BotStats } | null>(null);
  const [lowBalOpen, setLowBalOpen] = useState(false);
  const lowBalDecided = useRef(false);
  const botRef = useRef<SimulatedDerivBot | null>(null);

  useEffect(() => {
    if (!meta) { router.replace("/trading/deriv/bots/sim"); return; }
    const bal = getSimBalance();
    setSimBalance(bal);
    setLiveBalance({ balance: bal, currency: "USD" });
    setReady(true);
  }, [router, meta]);

  useEffect(() => () => { botRef.current?.stop("Left the page.", "info"); }, []);

  const shownBalance = liveBalance;

  useEffect(() => {
    if (!ready || lowBalDecided.current) return;
    lowBalDecided.current = true;
    if (simBalance >= RECOMMENDED_BALANCE) return;
    const key = `clunoid_sim_lowbal_${botId}`;
    let stored = "";
    try { stored = localStorage.getItem(key) || ""; } catch { /* ignore */ }
    const today = new Date().toISOString().slice(0, 10);
    if (stored === "never" || stored === today) return;
    try { localStorage.setItem(key, today); } catch { /* ignore */ }
    setLowBalOpen(true);
  }, [ready, simBalance, botId]);

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
    const v = validate();
    if (!v.ok) { setStatus({ msg: v.msg!, kind: "error" }); return; }

    const curBal = shownBalance.balance ?? simBalance;
    if (curBal <= 0 || curBal < parseFloat(stake)) {
      setStatus({ msg: "Your balance is too low for this stake.", kind: "warning" });
      return;
    }

    botRef.current?.stop("Restarting.", "info");
    botRef.current = null;
    setTrades([]); setStats(null); setStatus(null); setFinish(null);

    const ui: BotUI = {
      onStatus: (msg, kind) => setStatus({ msg, kind }),
      onStats: (s) => setStats(s),
      onTrade: (t) => setTrades((prev) => [t, ...prev].slice(0, 100)),
      onRunning: (r) => setRunning(r),
      onBalance: (balance, currency) => {
        setLiveBalance({ balance, currency });
        setSimBalance(balance);
      },
      onFinish: (kind, summary) => setFinish({ kind, summary }),
    };

    const bot = new SimulatedDerivBot(ui, meta.createStrategy(), curBal, "USD");
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
      <div className="relative z-10 w-full px-4 py-4 sm:px-6 lg:px-10">

        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/trading/deriv/bots/sim" className="flex items-center gap-1 text-[12.5px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={14} /> All bots
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 truncate text-[15px] font-bold">
            {meta.name}
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color: "#fcd34d" }}><Star size={11} fill="#fcd34d" /> {meta.rating.toFixed(1)}</span>
          </span>

          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px]" style={{ borderColor: TC.line, color: TC.text }}>
              <Wallet size={13} style={{ color: TC.profit }} />
              <span style={{ ...monoFont }}>{fmtBalance(shownBalance.balance, shownBalance.currency)}</span>
            </span>
            <div className="inline-flex rounded-full border p-0.5" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.2)" }}>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: TC.profit, color: TC.ink }}>Live</span>
            </div>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Col title="Configuration">
            <div className="grid gap-3">
              <Field label="Initial stake (USD)" value={stake} onChange={setStake} min={BOT_DEFAULTS.minStake} step={0.01} disabled={runningState} />
              <Field label="Take profit (USD)" value={takeProfit} onChange={setTakeProfit} min={1} step={1} disabled={runningState} />
              <Field label="Stop loss (USD)" value={stopLoss} onChange={setStopLoss} min={1} step={1} disabled={runningState} />
              {meta.supportsMartingale && <Field label="Martingale ×" value={martingale} onChange={setMartingale} min={1} step={0.1} disabled={runningState} />}
            </div>
            {!runningState ? (
              <button onClick={startBot} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                <Play size={15} /> Start on Real
              </button>
            ) : (
              <button onClick={stopBot} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.loss, color: "#fff" }}>
                <Square size={15} /> Stop bot
              </button>
            )}
            {runningState && <div className="mt-2 inline-flex items-center gap-1.5 text-[12px]" style={{ color: TC.profit }}><Loader2 size={13} className="animate-spin" /> running on real</div>}
            {status && <div className="mt-2 text-[12px] leading-snug" style={{ color: status.kind === "error" ? TC.loss : status.kind === "success" ? TC.profit : status.kind === "warning" ? "#f5c451" : TC.muted }}>{status.msg}</div>}
            <p className="mt-3 text-[10.5px] leading-relaxed" style={{ color: TC.faint }}>Stops automatically at your take-profit or stop-loss (realised P/L).</p>
          </Col>

          <Col title="Live Performance" right={stats ? `${fmtTime(stats.runningSeconds)}` : "00:00:00"}>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="Session P/L" value={stats ? `${stats.totalProfit >= 0 ? "+" : ""}${stats.totalProfit.toFixed(2)}` : "—"} tone={stats ? (stats.totalProfit >= 0 ? "profit" : "loss") : undefined} />
              <Stat label="Win rate" value={stats ? `${stats.winRate.toFixed(1)}%` : "—"} sub={stats ? `${stats.wins}/${stats.totalTrades}` : undefined} />
              <Stat label="Trades" value={stats ? String(stats.totalTrades) : "0"} />
              <Stat label="Current stake" value={stats ? stats.currentStake.toFixed(2) : "—"} />
              <Stat label="Loss streak" value={stats ? String(stats.consecutiveLosses) : "0"} tone={stats && stats.consecutiveLosses > 0 ? "loss" : undefined} />
              <Stat label="Market" value={stats?.market ?? "—"} />
              <Stat label="Target" value={stats?.target ?? "—"} />
              <Stat label="Balance" value={fmtBalance(shownBalance.balance, shownBalance.currency)} />
            </div>
          </Col>

          <Col title="Recent Trades" right={trades.length ? `${trades.length}` : undefined}>
            {trades.length === 0 ? (
              <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center" style={{ borderColor: TC.line }}>
                <span className="text-[12px]" style={{ color: TC.muted }}>No trades yet — start the bot.</span>
              </div>
            ) : (
              <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                {trades.map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: t.win ? "rgba(56,189,248,0.3)" : "rgba(242,96,125,0.3)", background: "rgba(255,255,255,0.02)" }}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: t.win ? TC.profit : TC.loss }}>
                        {t.win ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {t.target}
                      </div>
                      <div className="truncate text-[10.5px]" style={{ color: TC.faint }}>{t.market} · ${t.stake.toFixed(2)}</div>
                    </div>
                    <div className="text-[12.5px] font-bold" style={{ ...monoFont, color: t.win ? TC.profit : TC.loss }}>{t.profit >= 0 ? "+" : ""}{t.profit.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </Col>
        </div>

        <p className="mt-5 text-[10.5px] leading-relaxed" style={{ color: TC.faint }}>
          Trading carries risk. This is an automated tool, not financial advice or a profit guarantee. Never risk more than you can afford to lose.
        </p>
      </div>

      {finish && <FinishModal finish={finish} onClose={() => setFinish(null)} />}

      {lowBalOpen && (
        <RecommendBalanceModal
          balance={simBalance}
          onClose={(dontShowAgain) => {
            if (dontShowAgain) { try { localStorage.setItem(`clunoid_sim_lowbal_${botId}`, "never"); } catch { /* ignore */ } }
            setLowBalOpen(false);
          }}
        />
      )}
    </main>
  );
}

function RecommendBalanceModal({ balance, onClose }: { balance: number; onClose: (dontShowAgain: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);
  const downOnBackdrop = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(dontShow); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dontShow]);

  const tips = ["Start with a low stake.", "Set a take profit so the bot doesn't run too long.", "Let it run to your take profit — no need to stop it early."];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sim-reco-bal-title"
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: "rgba(4,10,20,0.72)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(dontShow); }}>
      <div className="relative w-full max-w-[400px] rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
        <button onClick={() => onClose(dontShow)} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-lg p-1 transition hover:bg-white/10" style={{ color: TC.faint }}>
          <X size={16} />
        </button>
        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "rgba(52,211,153,0.14)" }}>
          <PiggyBank size={20} style={{ color: TC.profit }} />
        </span>
        <h3 id="sim-reco-bal-title" className="mt-3 text-[21px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>Recommendation</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Your balance is <b style={{ color: TC.text }}>{fmtBalance(balance, "USD")}</b>. These bots trade on any
          balance, but we recommend <b style={{ color: TC.text }}>1,000 USD or more</b> — profits add up faster,
          without long waits for a target to hit.
        </p>
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: TC.line, background: "rgba(56,189,248,0.06)" }}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.profit }}>
            <Lightbulb size={13} /> A few tips
          </div>
          <ul className="mt-2 space-y-1.5">
            {tips.map((t) => (
              <li key={t} className="flex gap-1.5 text-[12px] leading-snug" style={{ color: TC.muted }}>
                <Check size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} /> {t}
              </li>
            ))}
          </ul>
        </div>
        <button onClick={() => onClose(dontShow)} className="mt-4 w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:bg-white/5" style={{ background: TC.profit, color: TC.ink }}>
          Continue
        </button>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-[11.5px]" style={{ color: TC.faint }}>
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} className="h-3.5 w-3.5" style={{ accentColor: TC.profit }} />
          Don&rsquo;t show this again
        </label>
      </div>
    </div>
  );
}

function FinishModal({ finish, onClose }: { finish: { kind: "take-profit" | "stop-loss"; summary: BotStats }; onClose: () => void }) {
  const tp = finish.kind === "take-profit";
  const s = finish.summary;
  const c = tp ? TC.profit : TC.loss;
  const rgb = tp ? "56,189,248" : "242,96,125";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(6,10,18,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border p-7 text-center"
        style={{ borderColor: `rgba(${rgb},0.45)`, background: TC.panel, boxShadow: `0 24px 70px -20px rgba(${rgb},0.5)` }}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: `radial-gradient(120% 90% at 50% 0%, rgba(${rgb},0.20), transparent 70%)` }} />
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-full p-1.5 transition hover:bg-white/10" style={{ color: TC.muted }}>
          <X size={16} />
        </button>
        <div className="relative">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl" style={{ background: `rgba(${rgb},0.16)`, boxShadow: `inset 0 0 0 1px rgba(${rgb},0.4)` }}>
            {tp ? <Trophy size={30} style={{ color: c }} /> : <ShieldAlert size={30} style={{ color: c }} />}
          </span>
          <div className="mt-3.5 text-[10.5px] font-bold uppercase tracking-[0.22em]" style={{ color: c }}>{tp ? "Take Profit" : "Stop Loss"}</div>
          <h2 className="mt-1 text-[20px] font-bold" style={{ color: TC.text }}>{tp ? "Target reached 🎯" : "Stop-loss hit"}</h2>
          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: `rgba(${rgb},0.25)`, background: `rgba(${rgb},0.06)` }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Session P/L</div>
            <div className="mt-0.5 text-[30px] font-bold leading-none" style={{ ...monoFont, color: c }}>
              {s.totalProfit >= 0 ? "+" : ""}{s.totalProfit.toFixed(2)} <span className="text-[16px]">{s.currency}</span>
            </div>
          </div>
          <button onClick={onClose} className="mt-5 w-full rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: c, color: TC.ink }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Col({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: TC.panel }}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
        {right && <span className="ml-auto text-[11px]" style={{ ...monoFont, color: TC.faint }}>{right}</span>}
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

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "profit" | "loss" }) {
  const color = tone === "profit" ? TC.profit : tone === "loss" ? TC.loss : TC.text;
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.15)" }}>
      <div className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{label}</div>
      <div className="mt-1 truncate text-[15px] font-bold" style={{ ...monoFont, color }}>{value}</div>
      {sub && <div className="text-[9.5px]" style={{ color: TC.faint }}>{sub}</div>}
    </div>
  );
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
