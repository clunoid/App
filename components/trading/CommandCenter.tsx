"use client";

/**
 * CENTRAL COMMAND — the account-control hub. One place to connect platforms and
 * see EVERYTHING: the account holder's name, a clear total balance, and the full
 * portfolio across every place a balance can live (Deriv Options/trading,
 * Wallets, and MT5) so no one is ever confused about where their money is.
 *
 * No Clunoid sign-in: the user authorises their own broker (Deriv OAuth, or a
 * pasted API token); the tokens AND a portfolio snapshot are kept in the browser
 * so the connection survives across visits and shows instantly on return.
 *
 * Deep-navy Showtime background, dotted grid, sky-blue boundaries — professional
 * and modern. Official platform logos, never generic icons.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, Plug, RefreshCw, Loader2, LogOut, KeyRound, ShieldCheck, Building2, Bot, LineChart, UserPlus, Gift, ChevronRight, X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { TC, DOT_GRID, monoFont, fmtBalance } from "@/lib/trading/theme";
import type { ConnectedAccount } from "@/lib/trading/accounts";
import { hasDerivApp, DERIV_AFFILIATE_URL, DERIV_TRACKED_DEPOSIT_URL, DERIV_TRACKED_WITHDRAW_URL } from "@/lib/deriv/config";
import { BalanceVisibilityNote } from "@/components/deriv/BalanceVisibilityNote";
import { parseDerivRedirect, isDerivRedirect, isDerivCodeReturn, startDerivLogin, completeDerivLogin, saveDerivTokens, loadDerivTokens, clearDerivTokens, saveDerivAccess, loadDerivAccess, clearDerivAccess, type DerivToken } from "@/lib/deriv/oauth";
import { fetchDerivPortfolio, type DerivPortfolio } from "@/lib/deriv/client";
import { fetchDerivPortfolioREST } from "@/lib/deriv/api";
/** Binance referral — open an account with us and claim the welcome gifts. */
const BINANCE_REFERRAL_URL = "https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_IIEHW&utm_source=referral_entrance";

/** One active connection: OAuth (new-API access token) or a pasted a1- token. */
type Session = { kind: "oauth"; accessToken: string } | { kind: "token"; tokens: DerivToken[] };

/**
 * The two automations this hub opens into. While nothing is connected these
 * stand in for the empty portfolio — a visitor should SEE the bots exist before
 * being asked to authorise anything. Clicking one opens the connect prompt
 * instead of navigating; once connected they behave as ordinary links.
 */
type GateTarget = "bots" | "mt5";
const GATE_ORDER: readonly GateTarget[] = ["bots", "mt5"];
const GATES: Record<GateTarget, { href: string; label: string; sub: string; icon: typeof Bot; noun: string }> = {
  bots: { href: "/trading/deriv/bots", label: "Deriv Bots", sub: "AI automation", icon: Bot, noun: "The Deriv bots" },
  mt5: { href: "/trading/deriv/mt5", label: "MT5", sub: "MT5 AI bots", icon: LineChart, noun: "The MT5 bots" },
};

/**
 * Asked for at the moment someone opens an automation without a linked account:
 * connect the one they have, or open one. It drives the SAME handlers as the
 * panel on the right — no second connection path.
 */
function ConnectPrompt({ target, onConnect, onClose }: { target: GateTarget; onConnect: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  // Only dismiss on a backdrop press that STARTED on the backdrop: a click is
  // dispatched on the common ancestor, so selecting the text and releasing
  // outside the panel would otherwise close the prompt underneath you.
  const downOnBackdrop = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!items.length) return;
      // Hold Tab inside the prompt. The page behind is dimmed but still
      // focusable, so without this a keyboard user walks straight into the
      // panel on the right and fires controls they cannot see.
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (active && !panel.contains(active)) { e.preventDefault(); first.focus(); }
    };

    // Coming Back from Deriv restores this page from bfcache with React state
    // intact — clear the hand-off latch so the button is live again instead of
    // sitting on a disabled "Connecting…".
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setBusy(false); };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pageshow", onShow);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="connect-prompt-title"
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: "rgba(4,10,20,0.72)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-w-[400px] rounded-2xl border p-5 outline-none"
        style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-lg p-1 transition hover:bg-white/10" style={{ color: TC.faint }}>
          <X size={16} />
        </button>

        <BrandLogo src="/logos/deriv.png" alt="Deriv" size={26} />
        <h3 id="connect-prompt-title" className="mt-3 text-[17px] font-bold">Connect your Deriv account</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          {GATES[target].noun} trade your own Deriv account, so it needs to be linked first. It takes one tap — and if
          you don&rsquo;t have an account yet, you can open one now.
        </p>

        {/* Stays on screen through the hand-off: closing first makes a slow
            redirect look like a dead button. */}
        <button onClick={() => { setBusy(true); onConnect(); }} disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90 disabled:opacity-70"
          style={{ background: TC.profit, color: TC.ink }}>
          {busy ? <><Loader2 size={15} className="animate-spin" /> Connecting…</> : <><Plug size={15} /> Connect Deriv</>}
        </button>
        <a href={DERIV_AFFILIATE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>
          <UserPlus size={15} style={{ color: TC.profit }} /> Create a Deriv account
        </a>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} /> You authorise your own broker directly.
        </p>
      </div>
    </div>
  );
}

const SNAP_KEY = "clunoid_deriv_portfolio"; // cached snapshot for instant reconnect-free display

/** The Deriv Trader's Hub section an account belongs to. */
type Section = "Trading" | "CFD" | "Wallet" | "P2P";
const sectionOf = (a: ConnectedAccount): Section => {
  if (a.kind === "wallet") return "Wallet";
  if (a.kind === "p2p") return "P2P";
  if (a.kind === "mt5" || a.kind === "ctrader" || a.kind === "cfd") return "CFD";
  return "Trading";
};

/** Sum balances, grouped by currency; returns the largest currency bucket as the
 *  headline (Deriv doesn't return a single converted grand total across accounts). */
function sumBalance(accts: ConnectedAccount[]): { amount: number | null; currency: string } {
  const byCur = new Map<string, number>();
  for (const a of accts) if (a.balance != null) byCur.set(a.currency, (byCur.get(a.currency) ?? 0) + a.balance);
  let cur = "", best = -Infinity;
  for (const [c, v] of byCur) if (v > best) { best = v; cur = c; }
  return byCur.size ? { amount: byCur.get(cur) ?? 0, currency: cur } : { amount: null, currency: "" };
}

/** An official brand logo (served same-origin), with a text fallback. */
function BrandLogo({ src, alt, size = 26 }: { src?: string; alt: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return <span className="grid shrink-0 place-items-center rounded-lg" style={{ width: size + 8, height: size + 8, background: "rgba(56,189,248,0.12)" }}><Building2 size={size - 6} style={{ color: TC.profit }} /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="grid shrink-0 place-items-center rounded-lg bg-white/95" style={{ width: size + 8, height: size + 8 }}><img src={src} alt={alt} width={size} height={size} onError={() => setOk(false)} style={{ width: size, height: size, objectFit: "contain" }} /></span>;
}

/** One account tile: broker · product, id, real/demo badge, and balance. */
function AccountCard({ a }: { a: ConnectedAccount }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
      <div className="flex items-center gap-2.5">
        <BrandLogo src="/logos/deriv.png" alt="Deriv" size={22} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{a.broker} · {a.platform}</div>
          <div className="truncate text-[11px]" style={{ ...monoFont, color: TC.faint }}>{a.loginid}</div>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider" style={{ background: a.isVirtual ? "rgba(148,168,189,0.14)" : "rgba(56,189,248,0.16)", color: a.isVirtual ? TC.faint : TC.profit }}>{a.isVirtual ? "Demo" : "Real"}</span>
      </div>
      <div className="mt-3 text-[22px] font-bold leading-none" style={{ ...monoFont, color: a.kind === "wallet" ? TC.text : TC.profit }}>{fmtBalance(a.balance, a.currency)}</div>
    </div>
  );
}

export function CommandCenter() {
  const [session, setSession] = useState<Session | null>(null);
  const [portfolio, setPortfolio] = useState<DerivPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
  /** Which automation was reached for before connecting. null = prompt closed. */
  const [gate, setGate] = useState<GateTarget | null>(null);
  const started = useRef(false);

  const refresh = useCallback(async (s: Session | null) => {
    if (!s) { setPortfolio(null); return; }
    setLoading(true);
    setError(null);
    try {
      const p = s.kind === "oauth"
        ? await fetchDerivPortfolioREST(s.accessToken) // new REST API (api.derivws.com)
        : await fetchDerivPortfolio(s.tokens[0].token); // classic WS (pasted a1- token)
      setPortfolio(p);
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(p)); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const search = window.location.search;
    const showSnapshot = (s: Session | null) => {
      if (s) { try { const c = localStorage.getItem(SNAP_KEY); if (c) setPortfolio(JSON.parse(c) as DerivPortfolio); } catch { /* ignore */ } }
    };
    // Restore whichever connection is stored (OAuth access token wins over a paste).
    const restore = (): Session | null => {
      const acc = loadDerivAccess();
      if (acc) return { kind: "oauth", accessToken: acc };
      const tks = loadDerivTokens();
      return tks.length ? { kind: "token", tokens: tks } : null;
    };

    // Surface a Deriv OAuth error instead of failing silently.
    const qs = new URLSearchParams(search);
    if (qs.get("error")) {
      const desc = (qs.get("error_description") || qs.get("error") || "").replace(/\+/g, " ");
      setError(`Deriv couldn't complete the connection: ${desc}. Check that your Deriv app's Redirect URL is exactly https://www.clunoid.com/trading/command.`);
      window.history.replaceState({}, "", "/trading/command");
    }

    // OIDC return (?code&state): exchange for the new-API access token, then load.
    if (isDerivCodeReturn(search)) {
      window.history.replaceState({}, "", "/trading/command");
      setLoading(true);
      const prior = restore();
      setSession(prior);
      showSnapshot(prior);
      void (async () => {
        try {
          const accessToken = await completeDerivLogin(search);
          saveDerivAccess(accessToken);
          clearDerivTokens(); // OAuth supersedes any pasted token
          const s: Session = { kind: "oauth", accessToken };
          setSession(s);
          await refresh(s);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Deriv connection failed.");
          setLoading(false);
        }
      })();
      return;
    }

    // Classic flat return (?acct1&token1&cur1) — numeric-app_id flow / paste apps.
    if (isDerivRedirect(search)) {
      const fresh = parseDerivRedirect(search);
      window.history.replaceState({}, "", "/trading/command");
      if (fresh.length) {
        saveDerivTokens(fresh);
        clearDerivAccess();
        const s: Session = { kind: "token", tokens: fresh };
        setSession(s);
        void refresh(s);
        return;
      }
    }

    const s = restore();
    setSession(s);
    showSnapshot(s); // show the cached snapshot instantly, then refresh live
    void refresh(s);

    // Arriving from a paid page's "use free bots" exit while NOT linked: open the
    // connect-or-create prompt automatically so they can link or open an account.
    if (qs.get("connect") === "1") {
      if (!s) setGate("bots");
      window.history.replaceState({}, "", "/trading/command");
    }
  }, [refresh]);

  // Drop a pending gate the moment a connection lands. Without this, a tile
  // tapped during the OAuth exchange leaves `gate` set, the prompt is hidden
  // rather than closed, and a later disconnect springs it open unbidden.
  useEffect(() => { if (session) setGate(null); }, [session]);

  const connectDeriv = () => {
    if (!hasDerivApp()) { setError("Deriv OAuth isn't configured yet — paste a Deriv API token below to connect in the meantime."); setPasteOpen(true); return; }
    setError(null);
    void startDerivLogin();
  };

  const connectWithToken = async () => {
    const t = pasteVal.trim();
    if (t.length < 8) { setError("That doesn't look like a Deriv API token."); return; }
    const tks: DerivToken[] = [{ loginid: "manual", token: t, currency: "" }];
    saveDerivTokens(tks);
    clearDerivAccess();
    const s: Session = { kind: "token", tokens: tks };
    setSession(s);
    setPasteOpen(false);
    setPasteVal("");
    await refresh(s);
  };

  const disconnect = () => {
    clearDerivTokens();
    clearDerivAccess();
    try { localStorage.removeItem(SNAP_KEY); } catch { /* ignore */ }
    setSession(null);
    setPortfolio(null);
    setError(null);
  };

  const connected = session != null;
  const accounts: ConnectedAccount[] = portfolio?.accounts ?? [];
  const realAccounts = accounts.filter((a) => !a.isVirtual);
  const demoAccounts = accounts.filter((a) => a.isVirtual);
  // Real balance per Deriv Hub section (only sections that actually hold accounts).
  const sections = (["Trading", "CFD", "Wallet", "P2P"] as const)
    .map((name) => ({ name, ...sumBalance(realAccounts.filter((a) => sectionOf(a) === name)) }))
    .filter((s) => s.amount != null);
  const demoTotal = sumBalance(demoAccounts);

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        {/* header */}
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Clunoid Trading
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="text-[14px] font-bold tracking-[0.16em]">CENTRAL COMMAND</span>
          {connected && (
            <button onClick={() => void refresh(session)} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: TC.line, color: TC.muted }}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
            </button>
          )}
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">{portfolio?.name ? `Welcome, ${portfolio.name.split(" ")[0]}.` : "Your accounts, one place."}</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Connect a platform and manage every account — full portfolio, balances and status — from a single command center. No Clunoid account needed; you authorise your own broker.
          </p>
        </div>

        {error && <div className="mt-4 rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "rgba(242,96,125,0.4)", background: "rgba(242,96,125,0.08)", color: TC.loss }}>{error}</div>}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* ── your accounts ── */}
          <section className="lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
              <Wallet size={13} style={{ color: TC.profit }} /> Your portfolio {accounts.length > 0 && `· ${accounts.length} accounts`}
            </h2>

            {loading && accounts.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border p-12" style={{ borderColor: TC.line, background: TC.panel }}>
                <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}><Loader2 size={16} className="animate-spin" style={{ color: TC.profit }} /> Loading your portfolio…</span>
              </div>
            ) : !connected ? (
              /* Nothing linked yet: show the automations rather than an empty
                 wallet, so a visitor can see the bots are real before being
                 asked to authorise anything. A click opens the connect prompt. */
              <div className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: TC.line, background: TC.panel }}>
                <h3 className="text-[15.5px] font-bold">Your automations are ready</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                  Open either one to connect your account — or create one — and your full portfolio appears here.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {GATE_ORDER.map((t) => {
                    const g = GATES[t];
                    const Icon = g.icon;
                    return (
                      <button key={t} type="button" onClick={() => { setError(null); setGate(t); }}
                        className="flex items-center gap-3 rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/5"
                        style={{ borderColor: TC.line, background: "linear-gradient(180deg, rgba(56,189,248,0.07), rgba(255,255,255,0.015))" }}>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(56,189,248,0.14)" }}>
                          <Icon size={19} style={{ color: TC.profit }} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-bold leading-tight">{g.label}</span>
                          <span className="mt-0.5 block text-[11.5px]" style={{ color: TC.faint }}>{g.sub}</span>
                        </span>
                        <ChevronRight size={16} className="ml-auto shrink-0" style={{ color: TC.faint }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : accounts.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: TC.line }}>
                <Wallet size={26} style={{ color: TC.faint }} />
                <p className="mt-3 text-[13.5px]" style={{ color: TC.muted }}>No accounts connected yet.</p>
                <p className="mt-1 text-[12.5px]" style={{ color: TC.faint }}>Connect a platform on the right to see your full portfolio here.</p>
              </div>
            ) : (
              <>
                {/* Total balance — REAL only (demo excluded), demo shown separately */}
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(255,255,255,0.015))" }}>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>Total balance <span className="normal-case tracking-normal opacity-70">· real, excludes demo</span></div>
                    <div className="mt-1 text-[30px] font-bold leading-none sm:text-[34px]" style={{ ...monoFont, color: TC.profit }}>{fmtBalance(portfolio?.totalReal ?? null, portfolio?.totalCurrency || "")}</div>
                  </div>
                  {demoTotal.amount != null && demoTotal.amount > 0 && (
                    <div className="text-right">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: TC.faint }}>Demo (not counted)</div>
                      <div className="mt-0.5 text-[15px] font-semibold" style={{ ...monoFont, color: TC.muted }}>{fmtBalance(demoTotal.amount, demoTotal.currency)}</div>
                    </div>
                  )}
                </div>

                <BalanceVisibilityNote className="mb-4 text-[11.5px] leading-relaxed" style={{ color: TC.faint }} />

                {/* Balance by Deriv section (real) */}
                {sections.length > 0 && (
                  <div className="mb-4 grid gap-2.5 sm:grid-cols-2">
                    {sections.map((s) => (
                      <div key={s.name} className="flex items-center justify-between rounded-xl border px-3.5 py-3" style={{ borderColor: TC.line, background: TC.panel }}>
                        <span className="text-[12px] font-semibold" style={{ color: TC.muted }}>{s.name}</span>
                        <span className="text-[15px] font-bold" style={{ ...monoFont, color: TC.text }}>{fmtBalance(s.amount, s.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Real accounts */}
                {realAccounts.length > 0 && (
                  <>
                    <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>Real accounts · {realAccounts.length}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {realAccounts.map((a, i) => <AccountCard key={`r-${a.loginid}-${i}`} a={a} />)}
                    </div>
                  </>
                )}

                {/* Demo accounts — clearly separated */}
                {demoAccounts.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-5 text-[10.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>Demo accounts · {demoAccounts.length}</h3>
                    <div className="grid gap-3 opacity-90 sm:grid-cols-2">
                      {demoAccounts.map((a, i) => <AccountCard key={`d-${a.loginid}-${i}`} a={a} />)}
                    </div>
                  </>
                )}
              </>
            )}

            {connected && (
              <div className="mt-4">
                <button onClick={disconnect} className="inline-flex items-center gap-1.5 text-[12px] transition hover:opacity-80" style={{ color: TC.faint }}><LogOut size={12} /> Disconnect Deriv</button>
              </div>
            )}
          </section>

          {/* ── connect a platform ── */}
          <aside>
            <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
              <Plug size={13} style={{ color: TC.profit }} /> Connect a platform
            </h2>
            <div className="rounded-2xl border p-4" style={{ borderColor: connected ? "rgba(52,211,153,0.35)" : TC.line, background: TC.panel }}>
              <div className="flex items-center gap-2.5">
                <BrandLogo src="/logos/deriv.png" alt="Deriv" size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13.5px] font-semibold">Deriv</div>
                  <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: connected ? "#34d399" : TC.faint }}>
                    {connected ? (
                      <><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#34d399", boxShadow: "0 0 7px #34d399" }} /> Connected</>
                    ) : "Options + MT5 · one authorisation"}
                  </div>
                </div>
              </div>

              {connected ? (
                /* Once linked: open the automations, or move money. Deposit and
                   withdraw are affiliate-tracked so Deriv credits us. Four compact
                   buttons in a 2×2 grid so they fit cleanly on any screen. */
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href="/trading/deriv/bots" className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-bold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                    <Bot size={14} /> Deriv Bots
                  </Link>
                  <Link href="/trading/deriv/mt5" className="flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[12px] font-bold transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>
                    <LineChart size={14} style={{ color: TC.profit }} /> MT5
                    <span className="rounded px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: "rgba(56,189,248,0.16)", color: "#38bdf8" }}>AI bots</span>
                  </Link>
                  <a href={DERIV_TRACKED_DEPOSIT_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[12px] font-bold transition hover:bg-white/5" style={{ borderColor: "rgba(52,211,153,0.45)", color: "#34d399" }}>
                    <ArrowDownToLine size={14} /> Deposit
                  </a>
                  <a href={DERIV_TRACKED_WITHDRAW_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[12px] font-bold transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>
                    <ArrowUpFromLine size={14} /> Withdraw
                  </a>
                </div>
              ) : (
                <>
                  <button onClick={connectDeriv} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                    <Plug size={15} /> Connect Deriv
                  </button>
                  <a href={DERIV_AFFILIATE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>
                    <UserPlus size={15} style={{ color: TC.profit }} /> Create a Deriv account
                  </a>
                  {/* API-token connect — hidden (OAuth is the path now, and it's
                      not needed); kept in code as a fallback, not removed. */}
                  {false && (
                    <>
                      <button onClick={() => setPasteOpen((v) => !v)} className="mt-2 flex w-full items-center justify-center gap-1.5 text-[12px] transition hover:opacity-80" style={{ color: TC.muted }}>
                        <KeyRound size={12} /> or paste a Deriv API token
                      </button>
                      {pasteOpen && (
                        <div className="mt-2 space-y-2">
                          <input value={pasteVal} onChange={(e) => setPasteVal(e.target.value)} placeholder="Deriv API token" className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-white/25" style={{ borderColor: TC.line, color: TC.text }} />
                          <button onClick={() => void connectWithToken()} className="w-full rounded-lg border px-3 py-2 text-[12.5px] font-medium transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>Connect with token</button>
                          <p className="text-[11px] leading-relaxed" style={{ color: TC.faint }}>Create a token in your Deriv account (Settings → API token) with the <b>Read</b> scope.</p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* MetaTrader 5 — a platform in its own right. Open it with no
                connection: it leads to broker-agnostic MT5 automations. */}
            <Link href="/trading/mt5" className="group mt-3 flex items-center gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5" style={{ borderColor: "rgba(52,211,153,0.35)", background: "linear-gradient(180deg, rgba(52,211,153,0.08), rgba(255,255,255,0.015))" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/metatrader5.svg" alt="MetaTrader 5" className="h-4 w-auto shrink-0" style={{ maxWidth: 120 }} />
              <div className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "#34d399" }}>
                Open automations <ChevronRight size={14} className="transition group-hover:translate-x-0.5" />
              </div>
            </Link>

            {/* coming soon — official logos */}
            <div className="mt-3 space-y-2">
              {[{ name: "Binance", logo: "/logos/binance.svg" }, { name: "cTrader", logo: "/logos/ctrader.svg" }, { name: "More brokers", logo: undefined as string | undefined }].map((p) => (
                <div key={p.name} className="flex items-center gap-2.5 rounded-xl border p-3 opacity-75" style={{ borderColor: TC.line }}>
                  <BrandLogo src={p.logo} alt={p.name} size={20} />
                  <div className="min-w-0 flex-1"><div className="text-[12.5px] font-semibold">{p.name}</div></div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Soon</span>
                </div>
              ))}
            </div>

            {/* Binance referral — open an account and claim the welcome gifts */}
            <a href={BINANCE_REFERRAL_URL} target="_blank" rel="noopener noreferrer"
              className="group mt-3 flex items-center gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5"
              style={{ borderColor: "rgba(243,186,47,0.38)", background: "linear-gradient(180deg, rgba(243,186,47,0.12), rgba(255,255,255,0.015))" }}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(243,186,47,0.16)", boxShadow: "inset 0 0 0 1px rgba(243,186,47,0.35)" }}>
                <Gift size={22} style={{ color: "#f3ba2f" }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold">Claim your Binance gifts</div>
                <div className="mt-0.5 text-[11.5px] leading-snug" style={{ color: TC.muted }}>Create a Binance account and claim your welcome rewards.</div>
              </div>
              <ChevronRight size={16} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: "#f3ba2f" }} />
            </a>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
              <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} /> You authorise your own broker directly. Clunoid never sees your password, and your access stays in this browser.
            </p>
          </aside>
        </div>
      </div>

      {gate && !connected && (
        <ConnectPrompt
          target={gate}
          onClose={() => setGate(null)}
          onConnect={() => {
            // Same handler the panel on the right uses. Without a configured app
            // it falls back to the token box, which lives behind the prompt — so
            // in that one case step out of the way first.
            if (!hasDerivApp()) setGate(null);
            connectDeriv();
          }}
        />
      )}
    </main>
  );
}
