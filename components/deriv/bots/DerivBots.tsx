"use client";

/**
 * DERIV BOTS — browser-side, API-executed Deriv bots (the DBot-style track).
 *
 * The bots REUSE the Deriv connection the user already made in the command
 * center (/trading/command) — same OAuth app (33PP…), same token. There is no
 * separate "connect" step here; if the user somehow arrives without a connection
 * we bounce them to the command center. The bot runs entirely in the browser over
 * the Deriv WebSocket (proposal → buy → settle), placing real trades on the
 * user's account and streaming live stats + trades. First bot: Phoenix Recovery
 * Differ.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Sparkles, Play, Square, Loader2, TrendingUp, TrendingDown, Wallet, Activity, Clock, Target, Layers, CheckCircle2 } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { loadDerivTokens, loadDerivAccess, type DerivToken } from "@/lib/deriv/oauth";
import { BOT_DEFAULTS } from "@/lib/deriv/bots/config";
import { PhoenixRecoveryDiffer, type BotUI, type BotStats, type TradeRow } from "@/lib/deriv/bots/phoenixRecoveryDiffer";

type StatusKind = "info" | "success" | "warning" | "error";
const isDemo = (loginid: string) => /^vr/i.test(loginid) || /demo|virtual/i.test(loginid);

const BOT = {
  name: "Phoenix Recovery Differ",
  tagline: "Smart digit differ with intelligent market-analysis recovery",
  rating: 5.0,
  blurb:
    "Trades 1-tick Digit Differ on the Volatility indices. After a loss it escalates the stake and switches to a bias-analysed Over-4 / Under-5 recovery trade — so a single win claws the losses back, then it resets. Runs in your browser on your connected Deriv account.",
};

export function DerivBots() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  // a1- account tokens (paste / classic flow — one token per account) OR a single
  // OAuth access token that authorises the user's default account.
  const [tokens, setTokens] = useState<DerivToken[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [accountIdx, setAccountIdx] = useState(0);
  const [open, setOpen] = useState(true);

  const [stake, setStake] = useState(String(BOT_DEFAULTS.initialStake));
  const [takeProfit, setTakeProfit] = useState(String(BOT_DEFAULTS.takeProfit));
  const [stopLoss, setStopLoss] = useState(String(BOT_DEFAULTS.stopLoss));
  const [martingale, setMartingale] = useState(String(BOT_DEFAULTS.martingaleMultiplier));

  const [runningState, setRunning] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind: StatusKind } | null>(null);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const botRef = useRef<PhoenixRecoveryDiffer | null>(null);

  // Reuse the command-center connection. No connection → back to command center.
  useEffect(() => {
    const a1 = loadDerivTokens();
    const access = loadDerivAccess();
    if (!a1.length && !access) { router.replace("/trading/command"); return; }
    setTokens(a1);
    setAccessToken(access);
    const demoAt = a1.findIndex((x) => isDemo(x.loginid));
    setAccountIdx(demoAt >= 0 ? demoAt : 0);
    setReady(true);
  }, [router]);

  // stop the bot if the user navigates away
  useEffect(() => () => { botRef.current?.stop("Left the page.", "info"); }, []);

  // the token the bot trades with: the selected a1- account token, else the OAuth token
  const account = tokens[accountIdx];
  const authToken = account?.token || accessToken;

  const validate = useCallback((): { ok: boolean; msg?: string } => {
    const s = parseFloat(stake), tp = parseFloat(takeProfit), sl = parseFloat(stopLoss), m = parseFloat(martingale);
    if (!(s >= BOT_DEFAULTS.minStake)) return { ok: false, msg: `Stake must be at least ${BOT_DEFAULTS.minStake}.` };
    if (!(tp > 0)) return { ok: false, msg: "Take profit must be greater than 0." };
    if (!(sl > 0)) return { ok: false, msg: "Stop loss must be greater than 0." };
    if (!(m >= 1)) return { ok: false, msg: "Martingale multiplier must be at least 1." };
    return { ok: true };
  }, [stake, takeProfit, stopLoss, martingale]);

  const startBot = () => {
    if (!authToken) { router.replace("/trading/command"); return; }
    const v = validate();
    if (!v.ok) { setStatus({ msg: v.msg!, kind: "error" }); return; }

    setTrades([]);
    const ui: BotUI = {
      onStatus: (msg, kind) => setStatus({ msg, kind }),
      onStats: (s) => setStats(s),
      onTrade: (t) => setTrades((prev) => [t, ...prev].slice(0, 100)),
      onRunning: (r) => setRunning(r),
      onBalance: () => { /* stats carry balance */ },
    };
    const bot = new PhoenixRecoveryDiffer(ui, authToken);
    botRef.current = bot;
    bot.start({
      initialStake: parseFloat(stake),
      takeProfit: parseFloat(takeProfit),
      stopLoss: parseFloat(stopLoss),
      martingaleMultiplier: parseFloat(martingale),
    });
  };

  const stopBot = () => botRef.current?.stop("Bot stopped by you.", "info");

  if (!ready) {
    return (
      <main className="grid min-h-[100dvh] place-items-center" style={{ background: TC.bg, color: TC.text }}>
        <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}>
          <Loader2 size={16} className="animate-spin" style={{ color: TC.profit }} /> Loading your Deriv connection…
        </span>
      </main>
    );
  }

  const demoActive = account ? isDemo(account.loginid) : false;

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">

        {/* header */}
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tracking-[0.14em]"><Bot size={16} style={{ color: TC.profit }} /> DERIV BOTS</span>
          <span className="ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px]" style={{ borderColor: TC.line, color: TC.muted }}>
            <Wallet size={13} style={{ color: TC.profit }} />
            {tokens.length > 1 ? (
              <select value={accountIdx} onChange={(e) => setAccountIdx(Number(e.target.value))} disabled={runningState}
                className="bg-transparent outline-none disabled:opacity-60" style={{ color: TC.text }}>
                {tokens.map((t, i) => (
                  <option key={t.loginid} value={i} style={{ background: TC.bg }}>
                    {t.loginid} · {t.currency}{isDemo(t.loginid) ? " (Demo)" : " (Real)"}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ color: TC.text }}>{account ? `${account.loginid} · ${account.currency}` : (stats ? `${stats.balance.toFixed(2)} ${stats.currency}` : "Deriv account")} connected</span>
            )}
          </span>
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Deriv Bots</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Automated Deriv bots that run in your browser and trade directly on your connected Deriv account — configure, start, and watch live trades and statistics. More bots coming; this is the first.
          </p>
        </div>

        {/* 1 · the bot */}
        <Section n={1} title="Choose a bot" right={account ? (demoActive ? "Demo account — safe to test" : "Real account — live money") : undefined}>
          <button onClick={() => setOpen((o) => !o)} className="w-full rounded-2xl border p-5 text-left transition hover:bg-white/5"
            style={{ borderColor: open ? TC.profit : TC.line, background: open ? "rgba(56,189,248,0.08)" : TC.panel }}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: "rgba(56,189,248,0.14)" }}><Sparkles size={18} style={{ color: TC.profit }} /></span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold">{BOT.name}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(56,189,248,0.16)", color: TC.profit }}>★ {BOT.rating.toFixed(1)}</span>
                  {open && <CheckCircle2 size={15} className="ml-auto" style={{ color: TC.profit }} />}
                </div>
                <div className="mt-0.5 text-[12px]" style={{ color: TC.muted }}>{BOT.tagline}</div>
              </div>
            </div>
            {open && <p className="mt-3 text-[12px] leading-relaxed" style={{ color: TC.muted }}>{BOT.blurb}</p>}
          </button>
        </Section>

        {open && (
          <>
            {/* 2 · configure */}
            <Section n={2} title="Configure & run">
              <div className="rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel }}>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Initial stake (USD)" value={stake} onChange={setStake} min={BOT_DEFAULTS.minStake} step={0.01} disabled={runningState} />
                  <Field label="Take profit (USD)" value={takeProfit} onChange={setTakeProfit} min={1} step={1} disabled={runningState} />
                  <Field label="Stop loss (USD)" value={stopLoss} onChange={setStopLoss} min={1} step={1} disabled={runningState} />
                  <Field label="Martingale ×" value={martingale} onChange={setMartingale} min={1} step={0.1} disabled={runningState} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {!runningState ? (
                    <button onClick={startBot} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                      <Play size={15} /> Start bot
                    </button>
                  ) : (
                    <button onClick={stopBot} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.loss, color: "#fff" }}>
                      <Square size={15} /> Stop bot
                    </button>
                  )}
                  {runningState && <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: TC.profit }}><Loader2 size={13} className="animate-spin" /> running</span>}
                  {status && (
                    <span className="text-[12px]" style={{ color: status.kind === "error" ? TC.loss : status.kind === "success" ? TC.profit : status.kind === "warning" ? "#f5c451" : TC.muted }}>
                      {status.msg}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[11px]" style={{ color: TC.faint }}>
                  The bot stops automatically at your take-profit or stop-loss (measured on this session’s realised P/L). Test on a Demo account first — this places real trades on your connected account.
                </p>
              </div>
            </Section>

            {/* 3 · live statistics */}
            <Section n={3} title="Live statistics" right={stats ? `${stats.totalTrades} trades` : undefined}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={<Wallet size={14} />} label="Balance" value={stats ? `${stats.balance.toFixed(2)} ${stats.currency}` : "—"} />
                <Stat icon={<Activity size={14} />} label="Session P/L" value={stats ? `${stats.totalProfit >= 0 ? "+" : ""}${stats.totalProfit.toFixed(2)}` : "—"} tone={stats ? (stats.totalProfit >= 0 ? "profit" : "loss") : undefined} />
                <Stat icon={<Target size={14} />} label="Win rate" value={stats ? `${stats.winRate.toFixed(1)}%` : "—"} sub={stats ? `${stats.wins}/${stats.totalTrades}` : undefined} />
                <Stat icon={<Layers size={14} />} label="Current stake" value={stats ? stats.currentStake.toFixed(2) : "—"} sub={stats?.recoveryMode ? "recovery mode" : "normal"} tone={stats?.recoveryMode ? "loss" : undefined} />
                <Stat icon={<Target size={14} />} label="Market" value={stats?.market ?? "—"} sub={stats?.target} />
                <Stat icon={<TrendingDown size={14} />} label="Loss streak" value={stats ? String(stats.consecutiveLosses) : "—"} />
                <Stat icon={<Clock size={14} />} label="Running" value={stats ? fmtTime(stats.runningSeconds) : "00:00:00"} />
                <Stat icon={<Sparkles size={14} />} label="Mode" value={stats?.recoveryMode ? "Recovery" : "Normal"} tone={stats?.recoveryMode ? "loss" : "profit"} />
              </div>
            </Section>

            {/* 4 · recent trades */}
            <Section n={4} title="Recent trades" right={trades.length ? `${trades.length}` : undefined}>
              {trades.length === 0 ? (
                <Panel><span className="text-[13px]" style={{ color: TC.muted }}>No trades yet — start the bot to see live trades appear here.</span></Panel>
              ) : (
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: TC.line }}>
                  <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ background: TC.panel, color: TC.faint }}>
                    <span>Result</span><span>Market</span><span>Target</span><span>Stake</span><span className="text-right">Profit</span>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto">
                    {trades.map((t, i) => (
                      <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] items-center gap-2 border-t px-4 py-2 text-[12px]" style={{ borderColor: TC.line }}>
                        <span className="inline-flex items-center gap-1 font-bold" style={{ color: t.win ? TC.profit : TC.loss }}>
                          {t.win ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {t.win ? "Win" : "Loss"}
                        </span>
                        <span style={{ color: TC.muted }}>{t.market}</span>
                        <span style={{ color: TC.muted }}>{t.target}{t.recovery ? " · rec" : ""}</span>
                        <span style={{ ...monoFont, color: TC.muted }}>{t.stake.toFixed(2)}</span>
                        <span className="text-right font-bold" style={{ ...monoFont, color: t.win ? TC.profit : TC.loss }}>{t.profit >= 0 ? "+" : ""}{t.profit.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          </>
        )}

        <p className="mt-6 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          Trading carries risk. These bots use martingale-style recovery which can escalate stakes quickly — always test on a Demo account first and never risk more than you can afford to lose. This is an automated tool, not financial advice or a profit guarantee.
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

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="grid place-items-center rounded-2xl border p-8 text-center" style={{ borderColor: TC.line, background: TC.panel }}>{children}</div>;
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
