"use client";

/**
 * DERIV BOT RUNNER — one bot's trading page. Compact top bar (bot name + a small
 * balance chip with the Demo/Real toggle), then three side-by-side columns —
 * Configuration · Live Performance · Recent Trades — like BotsLab, in our design.
 * Columns stack on small screens. All engine logic is unchanged; only the layout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Square, Loader2, TrendingUp, TrendingDown, Wallet, Star, Trophy, ShieldAlert, X, PiggyBank, Lightbulb, Check, ArrowDownToLine, Bot } from "lucide-react";
import { TC, DOT_GRID, monoFont, fmtBalance } from "@/lib/trading/theme";
import type { ConnectedAccount } from "@/lib/trading/accounts";
import { loadDerivAccess } from "@/lib/deriv/oauth";
import { DERIV_TRACKED_DEPOSIT_URL } from "@/lib/deriv/config";
import { BalanceVisibilityNote } from "@/components/deriv/BalanceVisibilityNote";
import { fetchDerivPortfolioREST } from "@/lib/deriv/api";
import { BOT_DEFAULTS } from "@/lib/deriv/bots/config";
import { DerivBot } from "@/lib/deriv/bots/engine";
import { getBot } from "@/lib/deriv/bots/registry";
import { autonomous, msUntilDue, AUTONOMOUS_BOT_ID, type AutoSnapshot } from "@/lib/deriv/bots/autonomous";
import type { BotUI, BotStats, TradeRow } from "@/lib/deriv/bots/types";

type StatusKind = "info" | "success" | "warning" | "error";
type Mode = "demo" | "real";
const SNAP_KEY = "clunoid_deriv_portfolio";
const onlyOptions = (accts: ConnectedAccount[]) => accts.filter((a) => a.kind === "options");
/** The balance we suggest for a comfortable ride — recommended, never enforced. */
const RECOMMENDED_BALANCE = 1000;

export function DerivBotRunner({ botId }: { botId: string }) {
  const router = useRouter();
  const meta = getBot(botId);

  const [ready, setReady] = useState(false);
  const [access, setAccess] = useState("");
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  // Default everyone to their REAL account (that's where the markup is). Demo is
  // hidden until the secret is entered — a triple-click on the Real toggle.
  const [mode, setMode] = useState<Mode>("real");
  const [showDemo, setShowDemo] = useState(false);

  const [stake, setStake] = useState(String(BOT_DEFAULTS.initialStake));
  const [takeProfit, setTakeProfit] = useState(String(BOT_DEFAULTS.takeProfit));
  const [stopLoss, setStopLoss] = useState(String(BOT_DEFAULTS.stopLoss));
  const [martingale, setMartingale] = useState(String(meta?.defaultMartingale ?? BOT_DEFAULTS.martingaleMultiplier));

  const [runningState, setRunning] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind: StatusKind } | null>(null);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [liveBalance, setLiveBalance] = useState<{ balance: number | null; currency: string } | null>(null);
  const [finish, setFinish] = useState<{ kind: "take-profit" | "stop-loss"; summary: BotStats } | null>(null);
  const [lowBalOpen, setLowBalOpen] = useState(false);   // recommendation on open (< $1000)
  const [needDepOpen, setNeedDepOpen] = useState(false); // shown when a run can't afford the stake
  const lowBalDecided = useRef(false);
  const botRef = useRef<DerivBot | null>(null);
  /** True once the automation has written into the inputs, so we know there is
   *  something of its own to undo when it stands down. */
  const autoFilled = useRef(false);
  // Live view of the automation. When it is the one trading this bot, the three
  // columns below read from it instead of this page's own engine instance.
  const [auto, setAuto] = useState<AutoSnapshot | null>(null);
  useEffect(() => autonomous().subscribe(setAuto), []);

  // Point the automation at whichever account this page is showing, so the whole
  // cycle can be watched on Demo before it is trusted with real money. Only this
  // bot is automated, so other bot pages leave the setting alone.
  useEffect(() => {
    if (!ready || botId !== AUTONOMOUS_BOT_ID) return;
    autonomous().setDemo(mode === "demo");
  }, [ready, botId, mode]);

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
    if (cached.length) { setAccounts(cached); setMode("real"); }
    setReady(true);
    void refreshAccounts(acc);
  }, [router, refreshAccounts, meta]);

  useEffect(() => () => { botRef.current?.stop("Left the page.", "info"); }, []);

  const demoAccount = accounts.find((a) => a.isVirtual) || null;
  const realAccount = accounts.find((a) => !a.isVirtual) || null;
  const selected = mode === "demo" ? demoAccount : realAccount;

  // The automation is driving this bot right now: mirror its run rather than
  // showing an empty page. A manual run always wins — starting one claims it.
  // Switched off, the page shows no trace of the automation — exactly as it was
  // before the feature existed.
  const autoActive = !!auto?.active;
  const autoOwns = !runningState && autoActive && auto?.phase === "running" && auto.botId === botId;
  const autoWaiting = !runningState && autoActive && !!auto?.enabled && auto.botId === botId && auto.phase === "cooldown";
  const effStats = autoOwns ? auto!.stats : stats;
  const effTrades = autoOwns ? auto!.trades : trades;
  const effStatus = autoOwns ? auto!.status : status;
  const busy = runningState || autoOwns;

  const shownBalance = autoOwns && auto!.balance != null
    ? { balance: auto!.balance, currency: auto!.currency }
    : liveBalance ?? { balance: selected?.balance ?? null, currency: selected?.currency ?? "" };
  const switchMode = (m: Mode) => { if (busy) return; setMode(m); setLiveBalance(null); };

  // Show the automation's numbers in the Configuration inputs, so an automated
  // run reads exactly like a hand-set one. Mid-run these are the figures the run
  // began with and do not move; between runs they track the balance. The user's
  // own numbers are never touched while the automation is off.
  // Only while it is actually trading. Resting between runs the card goes back to
  // the bot's own defaults, so the figures on screen always belong to a live run.
  const autoStake = autoOwns ? auto!.stake : null;
  const autoTP = autoOwns ? auto!.target : null;
  const autoSL = autoOwns ? auto!.stopLoss : null;
  const autoMart = autoOwns ? auto!.martingale : null;
  useEffect(() => {
    if (autoStake == null || autoTP == null || autoSL == null || autoMart == null) return;
    setStake(String(autoStake));
    setTakeProfit(String(autoTP));
    setStopLoss(String(autoSL));
    setMartingale(String(autoMart));
    autoFilled.current = true;
  }, [autoStake, autoTP, autoSL, autoMart]);

  // Once the automation is out of the picture, put the bot's own defaults back so
  // the card never sits on figures that were sized for a run that is over. Only
  // undoes what the automation itself wrote — numbers typed by hand are left be.
  useEffect(() => {
    if (autoOwns || !autoFilled.current) return;
    autoFilled.current = false;
    setStake(String(BOT_DEFAULTS.initialStake));
    setTakeProfit(String(BOT_DEFAULTS.takeProfit));
    setStopLoss(String(BOT_DEFAULTS.stopLoss));
    setMartingale(String(meta?.defaultMartingale ?? BOT_DEFAULTS.martingaleMultiplier));
  }, [autoOwns, meta]);

  // Recommend a healthier balance when the real account is under $1,000. It is a
  // gentle nudge, not a wall: decided once the balance is known, and shown at most
  // once a day per bot (or never, if the user ticks "don't show again").
  useEffect(() => {
    if (!ready || lowBalDecided.current) return;
    const bal = realAccount?.balance;
    if (bal == null) return; // wait until we actually know the balance
    lowBalDecided.current = true;
    if (bal >= RECOMMENDED_BALANCE) return;
    const key = `clunoid_lowbal_${botId}`;
    let stored = "";
    try { stored = localStorage.getItem(key) || ""; } catch { /* ignore */ }
    const today = new Date().toISOString().slice(0, 10);
    if (stored === "never" || stored === today) return; // don't nag: once a day, per bot
    try { localStorage.setItem(key, today); } catch { /* ignore */ }
    setLowBalOpen(true);
  }, [ready, realAccount, botId]);

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

    // Nothing to trade with, or not enough for this stake → invite a deposit
    // instead of firing a doomed order.
    const curBal = shownBalance.balance;
    if (curBal != null && (curBal <= 0 || curBal < parseFloat(stake))) { setNeedDepOpen(true); return; }

    // Taking over by hand: the automation stands down until this run ends.
    autonomous().claimManual();
    botRef.current?.stop("Restarting.", "info");
    botRef.current = null;
    setTrades([]); setStats(null); setStatus(null); setFinish(null);
    const tradedId = selected.loginid;
    setLiveBalance({ balance: selected.balance, currency: selected.currency });
    const ui: BotUI = {
      onStatus: (msg, kind) => setStatus({ msg, kind }),
      onStats: (s) => setStats(s),
      onTrade: (t) => setTrades((prev) => [t, ...prev].slice(0, 100)),
      onRunning: (r) => {
        setRunning(r);
        if (!r) {
          autonomous().releaseManual(); // hand control back to the automation
          void refreshAccounts(access).then((opts) => {
            const acct = opts.find((a) => a.loginid === tradedId);
            if (acct && acct.balance != null) setLiveBalance({ balance: acct.balance, currency: acct.currency });
          });
        }
      },
      onBalance: (balance, currency) => setLiveBalance({ balance, currency }),
      onFinish: (kind, summary) => setFinish({ kind, summary }),
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
    <main className="cln-dash relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      {/* Recent Trades entry animation. A settled trade is prepended, so the new row
          slides in from the left, overshoots, and settles, while a bright
          colour-matched ring + glow blooms and fades — the newest trade is
          unmistakable without pulling focus off the numbers.
          The list pins overflow-x to hidden: it is overflow-y-auto, which would
          otherwise compute overflow-x to auto and flash a scrollbar as the row
          overshoots past its resting position. */}
      <style>{`
        @keyframes clnTradeIn {
          0%   { opacity: 0; transform: translate3d(-28px,0,0); }
          55%  { opacity: 1; transform: translate3d(4px,0,0); }
          78%  { transform: translate3d(-2px,0,0); }
          100% { opacity: 1; transform: translate3d(0,0,0); }
        }
        @keyframes clnTradeGlow {
          0%   { box-shadow: 0 0 0 0 rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0); }
          25%  { box-shadow: 0 0 0 1.5px var(--cln-ring), 0 4px 26px 3px var(--cln-glow); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0); }
        }
        .cln-trade-row {
          animation: clnTradeIn 460ms cubic-bezier(0.22,0.8,0.3,1) both,
                     clnTradeGlow 1000ms ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          .cln-trade-row { animation: none; }
        }
        /* Give the card row a definite height on large, tall screens: min-height
           alone lets a long Recent Trades list grow the card, the grid and the
           page. With a real height (and min-height:0 down the chain) the list
           scrolls inside its card and every card fits the space exactly.
           Guarded on height so short landscape screens keep normal page flow.
           Element-qualified so these beat the lg: utilities they replace. */
        @media (min-width: 1024px) and (min-height: 640px) {
          main.cln-dash { height: 100dvh; }
          div.cln-dash-inner { min-height: 0; }
          div.cln-dash-grid { min-height: 0; grid-auto-rows: minmax(0, 1fr); }
        }
        /* Short landscape screens keep normal page flow (locking to 100dvh there
           would squeeze the Configuration card), so cap the list itself instead —
           otherwise a long list stretches the card the same way. Below lg the
           max-h-[420px] utility already does this. */
        @media (min-width: 1024px) and (max-height: 639px) {
          div.cln-trade-scroll { max-height: 55dvh; }
        }
      `}</style>
      <div className="cln-dash-inner relative z-10 flex w-full flex-1 flex-col px-4 py-4 sm:px-6 lg:px-10">

        {/* compact top bar: name only + small balance chip with Demo/Real toggle */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/trading/deriv/bots" className="flex items-center gap-1 text-[12.5px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={14} /> All bots
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 truncate text-[15px] font-bold">
            {meta.name}
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color: "#fcd34d" }}><Star size={11} fill="#fcd34d" /> {meta.rating.toFixed(1)}</span>
          </span>

          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px]" style={{ borderColor: TC.line, color: TC.text }}>
              <Wallet size={13} style={{ color: mode === "real" ? TC.profit : TC.muted }} />
              <span style={{ ...monoFont }}>{fmtBalance(shownBalance.balance, shownBalance.currency)}</span>
            </span>
            <div className="inline-flex rounded-full border p-0.5" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.2)" }}>
              {(showDemo ? (["demo", "real"] as const) : (["real"] as const)).map((m) => {
                const avail = m === "demo" ? !!demoAccount : !!realAccount;
                const active = mode === m;
                return (
                  <button key={m}
                    onClick={(e) => {
                      // Secret: a triple-click on Real reveals the hidden Demo toggle.
                      // Everyone stays on their real account otherwise — that's the point.
                      if (m === "real" && e.detail === 3) { setShowDemo(true); return; }
                      switchMode(m);
                    }}
                    disabled={runningState || !avail}
                    title={!avail ? `No ${m} account on your Deriv connection` : runningState ? "Stop the bot to switch accounts" : ""}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition disabled:cursor-not-allowed disabled:opacity-40"
                    style={active ? { background: m === "real" ? TC.profit : "rgba(148,168,189,0.22)", color: m === "real" ? TC.ink : TC.text } : { color: TC.muted }}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* three columns, side by side (stack on small screens). On large screens the
            row fills the remaining viewport height so the cards reach the bottom
            instead of leaving dead space; the min-height keeps them from being
            squashed on short landscape screens (the page just scrolls instead). */}
        <div className="cln-dash-grid mt-4 grid grid-cols-1 gap-4 lg:min-h-[480px] lg:flex-1 lg:grid-cols-3">

          {/* Configuration */}
          <Col
            title="Configuration"
            // Only this bot is automated, and the switch hides itself while
            // anything is running so it can never be flipped mid-trade.
            action={!busy && botId === AUTONOMOUS_BOT_ID && auto ? <AutoToggle auto={auto} /> : undefined}
          >
            {(autoOwns || autoWaiting) && <AutoBanner auto={auto!} running={autoOwns} />}
            <div className="grid gap-3">
              <Field label="Initial stake (USD)" value={stake} onChange={setStake} min={BOT_DEFAULTS.minStake} step={0.01} disabled={busy} />
              <Field label="Take profit (USD)" value={takeProfit} onChange={setTakeProfit} min={1} step={1} disabled={busy} />
              <Field label="Stop loss (USD)" value={stopLoss} onChange={setStopLoss} min={1} step={1} disabled={busy} />
              {meta.supportsMartingale && <Field label="Martingale ×" value={martingale} onChange={setMartingale} min={1} step={0.1} disabled={busy} />}
            </div>
            {/* action block sinks to the bottom of a tall card so the inputs stay
                grouped at the top instead of everything floating mid-card */}
            <div className="lg:mt-auto">
              {autoOwns ? (
                <button onClick={() => autonomous().stopNow("Automation stopped by you.")} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.loss, color: "#fff" }}>
                  <Square size={15} /> Stop automation
                </button>
              ) : !runningState ? (
                <button onClick={startBot} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                  <Play size={15} /> Start on {mode === "demo" ? "Demo" : "Real"}
                </button>
              ) : (
                <button onClick={stopBot} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.loss, color: "#fff" }}>
                  <Square size={15} /> Stop bot
                </button>
              )}
              {runningState && <div className="mt-2 inline-flex items-center gap-1.5 text-[12px]" style={{ color: TC.profit }}><Loader2 size={13} className="animate-spin" /> running on {mode}</div>}
              {autoOwns && <div className="mt-2 inline-flex items-center gap-1.5 text-[12px]" style={{ color: "#34d399" }}><Loader2 size={13} className="animate-spin" /> automation running</div>}
              {effStatus && <div className="mt-2 text-[12px] leading-snug" style={{ color: effStatus.kind === "error" ? TC.loss : effStatus.kind === "success" ? TC.profit : effStatus.kind === "warning" ? "#f5c451" : TC.muted }}>{effStatus.msg}</div>}
              <p className="mt-3 text-[10.5px] leading-relaxed" style={{ color: TC.faint }}>
                {autoOwns || autoWaiting
                  ? "Stop the automation to trade with your own settings."
                  : "Stops automatically at your take-profit or stop-loss (realised P/L)."}
              </p>
            </div>
          </Col>

          {/* Live Performance */}
          <Col title="Live Performance" right={effStats ? `${fmtTime(effStats.runningSeconds)}` : "00:00:00"}>
            <div className="flex flex-col lg:flex-1">
              <Stat label="Session P/L" value={effStats ? `${effStats.totalProfit >= 0 ? "+" : ""}${effStats.totalProfit.toFixed(2)}` : "—"} tone={effStats ? (effStats.totalProfit >= 0 ? "profit" : "loss") : undefined} />
              <Stat label="Win rate" value={effStats ? `${effStats.winRate.toFixed(1)}%` : "—"} sub={effStats ? `${effStats.wins}/${effStats.totalTrades}` : undefined} />
              <Stat label="Trades" value={effStats ? String(effStats.totalTrades) : "0"} />
              <Stat label="Current stake" value={effStats ? effStats.currentStake.toFixed(2) : "—"} />
              <Stat label="Loss streak" value={effStats ? String(effStats.consecutiveLosses) : "0"} tone={effStats && effStats.consecutiveLosses > 0 ? "loss" : undefined} />
              <Stat label="Market" value={effStats?.market ?? "—"} />
              <Stat label="Target" value={effStats?.target ?? "—"} />
              <Stat label="Balance" value={fmtBalance(shownBalance.balance, shownBalance.currency)} />
            </div>
          </Col>

          {/* Recent Trades */}
          <Col title="Recent Trades" right={effTrades.length ? `${effTrades.length}` : undefined}>
            {effTrades.length === 0 ? (
              <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center lg:flex-1" style={{ borderColor: TC.line }}>
                <span className="text-[12px]" style={{ color: TC.muted }}>No trades yet — start the bot.</span>
              </div>
            ) : (
              <div className="cln-trade-scroll flex max-h-[420px] flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
                {effTrades.map((t) => (
                  <div key={`${t.at}-${t.market}-${t.target}`} className="cln-trade-row flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: t.win ? "rgba(56,189,248,0.3)" : "rgba(242,96,125,0.3)", background: "rgba(255,255,255,0.02)", "--cln-glow": t.win ? "rgba(56,189,248,0.9)" : "rgba(242,96,125,0.9)", "--cln-ring": t.win ? "rgba(56,189,248,0.95)" : "rgba(242,96,125,0.95)" } as React.CSSProperties}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: t.win ? TC.profit : TC.loss }}>
                        {t.win ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {t.target}
                      </div>
                      <div className="truncate text-[10.5px]" style={{ color: TC.faint }}>{t.market} · ${t.stake.toFixed(2)}</div>
                    </div>
                    {/* Sized up so the figure still reads clearly in a screenshot.
                        The row height is set by the two lines on the left, so this
                        grows without changing the row. */}
                    <div className="shrink-0 pl-2 text-[18px] font-bold leading-none tracking-tight" style={{ ...monoFont, color: t.win ? TC.profit : TC.loss }}>{t.profit >= 0 ? "+" : ""}{t.profit.toFixed(2)}</div>
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
          balance={realAccount?.balance ?? null}
          currency={realAccount?.currency || "USD"}
          onClose={(dontShowAgain) => {
            if (dontShowAgain) { try { localStorage.setItem(`clunoid_lowbal_${botId}`, "never"); } catch { /* ignore */ } }
            setLowBalOpen(false);
          }}
        />
      )}

      {needDepOpen && (
        <NeedDepositModal
          balance={shownBalance.balance}
          currency={shownBalance.currency || "USD"}
          onClose={() => setNeedDepOpen(false)}
        />
      )}
    </main>
  );
}

/**
 * Shown once (per day, per bot) when the real account is under the recommended
 * balance. A friendly nudge — deposit for a smoother ride, or keep trading —
 * plus a couple of quick tips. Styled like the connect-account prompt.
 */
function RecommendBalanceModal({ balance, currency, onClose }: { balance: number | null; currency: string; onClose: (dontShowAgain: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);
  const downOnBackdrop = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(dontShow); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dontShow]);

  const tips = [
    "Start with a low stake.",
    "Set a take profit so the bot doesn't run too long.",
    "Let it run to your take profit — no need to stop it early.",
  ];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reco-bal-title"
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
        <h3 id="reco-bal-title" className="mt-3 text-[21px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>Recommendation</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Your balance is <b style={{ color: TC.text }}>{fmtBalance(balance, currency)}</b>. These bots trade on any
          balance, but we recommend <b style={{ color: TC.text }}>1,000 USD or more</b> — profits add up faster,
          without long waits for a target to hit.
        </p>

        <BalanceVisibilityNote className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.faint }} />

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

        <a href={DERIV_TRACKED_DEPOSIT_URL} target="_blank" rel="noopener noreferrer" onClick={() => onClose(dontShow)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
          <ArrowDownToLine size={15} /> Deposit funds
        </a>
        <button onClick={() => onClose(dontShow)} className="mt-2 w-full rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>
          Continue trading
        </button>

        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-[11.5px]" style={{ color: TC.faint }}>
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} className="h-3.5 w-3.5" style={{ accentColor: TC.profit }} />
          Don&rsquo;t show this again
        </label>
      </div>
    </div>
  );
}

/**
 * Shown when a run can't afford the stake (0 balance, or below the stake). Deposit
 * now or later — same connect-prompt styling.
 */
function NeedDepositModal({ balance, currency, onClose }: { balance: number | null; currency: string; onClose: () => void }) {
  const downOnBackdrop = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="need-dep-title"
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: "rgba(4,10,20,0.72)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-[400px] rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-lg p-1 transition hover:bg-white/10" style={{ color: TC.faint }}>
          <X size={16} />
        </button>

        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "rgba(52,211,153,0.14)" }}>
          <Wallet size={20} style={{ color: TC.profit }} />
        </span>
        <h3 id="need-dep-title" className="mt-3 text-[21px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>Add funds to start</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Your balance is <b style={{ color: TC.text }}>{fmtBalance(balance, currency)}</b> — not enough to place this
          trade yet. You can deposit <b style={{ color: TC.text }}>any amount</b>, and we recommend{" "}
          <b style={{ color: TC.text }}>1,000 USD or more</b> for the best results.
        </p>

        <BalanceVisibilityNote className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TC.faint }} />

        <a href={DERIV_TRACKED_DEPOSIT_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
          <ArrowDownToLine size={15} /> Deposit funds
        </a>
        <button onClick={onClose} className="mt-2 w-full rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>
          Later
        </button>
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
        {/* accent glow */}
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
          <p className="mx-auto mt-1.5 max-w-[16rem] text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            {tp ? "Your take-profit target was reached and the bot stopped — profit locked in." : "Your stop-loss was reached, so the bot stopped to protect your balance."}
          </p>

          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: `rgba(${rgb},0.25)`, background: `rgba(${rgb},0.06)` }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Session P/L</div>
            <div className="mt-0.5 text-[30px] font-bold leading-none" style={{ ...monoFont, color: c }}>
              {s.totalProfit >= 0 ? "+" : ""}{s.totalProfit.toFixed(2)} <span className="text-[16px]">{s.currency}</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Trades" value={String(s.totalTrades)} />
            <MiniStat label="Win rate" value={`${s.winRate.toFixed(0)}%`} />
            <MiniStat label="Time" value={fmtTime(s.runningSeconds)} />
          </div>

          <button onClick={onClose} className="mt-5 w-full rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: c, color: TC.ink }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-2" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.2)" }}>
      <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{label}</div>
      <div className="mt-0.5 text-[13px] font-bold" style={{ ...monoFont, color: TC.text }}>{value}</div>
    </div>
  );
}

/**
 * Automation strip at the top of Configuration. Explains what the automation is
 * doing right now — trading, or resting until the next run — and what it sized
 * this run at, so the numbers on screen are never a mystery.
 */
function AutoBanner({ auto, running }: { auto: AutoSnapshot; running: boolean }) {
  const [, force] = useState(0);
  // Only tick while a countdown is on screen.
  useEffect(() => {
    if (running) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const cur = auto.currency || "USD";
  const left = msUntilDue(auto.nextRunAt, Date.now());
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);

  return (
    <div className="mb-3 rounded-xl border p-3" style={{ borderColor: "rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.06)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#34d399" }}>
        <Bot size={13} /> {running ? "Trading for you" : "Automated · resting"}
        {auto.demo && <span className="rounded px-1.5 py-0.5 text-[9.5px]" style={{ background: "rgba(148,168,189,0.22)", color: TC.text }}>Demo</span>}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.muted }}>
        {running ? (
          <>Staking <b style={{ color: TC.text }}>{auto.stake.toFixed(2)} {cur}</b> a trade, aiming for{" "}
          <b style={{ color: TC.text }}>{auto.target.toFixed(2)} {cur}</b> this run.</>
        ) : (
          <>Next run in <b style={{ color: TC.text }}>{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</b>,
          sized from your balance at the time.</>
        )}
      </p>
      {!auto.online && (
        <p className="mt-1 text-[11px]" style={{ color: "#f5c451" }}>Offline — it resumes on its own when the connection is back.</p>
      )}
      {auto.error && <p className="mt-1 text-[11px]" style={{ color: TC.loss }}>{auto.error}</p>}
    </div>
  );
}

function Col({ title, right, action, children }: { title: string; right?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: TC.panel }}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>{title}</h2>
        {action}
        {right && <span className="ml-auto text-[11px]" style={{ ...monoFont, color: TC.faint }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * The automation switch, sized to sit on the Configuration heading. Ticked green
 * while the automation is on, plain grey while it is off. Off is temporary by
 * design — an hour to trade by hand, then it comes back on its own.
 */
function AutoToggle({ auto }: { auto: AutoSnapshot }) {
  const on = auto.active;
  const back = auto.optedOutUntil
    ? new Date(auto.optedOutUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Automated trading"
      title={on ? "Automated trading is on — switch off to trade by hand for an hour" : `Automated trading is off — back on at ${back}`}
      onClick={() => autonomous().setActive(!on)}
      className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] border transition hover:opacity-80"
      style={on ? { background: "#34d399", borderColor: "#34d399" } : { background: "transparent", borderColor: TC.line }}
    >
      {on && <Check size={10} strokeWidth={3.5} style={{ color: TC.ink }} />}
    </button>
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
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0 lg:flex-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: TC.muted }}>{label}</span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[15px] font-bold" style={{ ...monoFont, color }}>{value}</span>
        {sub && <span className="shrink-0 text-[10px] font-medium" style={{ color: TC.faint }}>{sub}</span>}
      </span>
    </div>
  );
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
