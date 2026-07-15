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
import { ArrowLeft, Wallet, Plug, RefreshCw, Loader2, LogOut, ArrowUpRight, KeyRound, ShieldCheck, Building2 } from "lucide-react";
import { TC, DOT_GRID, monoFont, fmtBalance } from "@/lib/trading/theme";
import type { ConnectedAccount } from "@/lib/trading/accounts";
import { hasDerivApp } from "@/lib/deriv/config";
import { parseDerivRedirect, isDerivRedirect, isDerivCodeReturn, startDerivLogin, completeDerivLogin, saveDerivTokens, loadDerivTokens, clearDerivTokens, saveDerivAccess, loadDerivAccess, clearDerivAccess, type DerivToken } from "@/lib/deriv/oauth";
import { fetchDerivPortfolio, type DerivPortfolio } from "@/lib/deriv/client";
import { fetchDerivPortfolioREST } from "@/lib/deriv/api";

/** One active connection: OAuth (new-API access token) or a pasted a1- token. */
type Session = { kind: "oauth"; accessToken: string } | { kind: "token"; tokens: DerivToken[] };

const SNAP_KEY = "clunoid_deriv_portfolio"; // cached snapshot for instant reconnect-free display

/** An official brand logo (served same-origin), with a text fallback. */
function BrandLogo({ src, alt, size = 26 }: { src?: string; alt: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return <span className="grid shrink-0 place-items-center rounded-lg" style={{ width: size + 8, height: size + 8, background: "rgba(56,189,248,0.12)" }}><Building2 size={size - 6} style={{ color: TC.profit }} /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="grid shrink-0 place-items-center rounded-lg bg-white/95" style={{ width: size + 8, height: size + 8 }}><img src={src} alt={alt} width={size} height={size} onError={() => setOk(false)} style={{ width: size, height: size, objectFit: "contain" }} /></span>;
}

export function CommandCenter() {
  const [session, setSession] = useState<Session | null>(null);
  const [portfolio, setPortfolio] = useState<DerivPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
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
  }, [refresh]);

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
            ) : accounts.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: TC.line }}>
                <Wallet size={26} style={{ color: TC.faint }} />
                <p className="mt-3 text-[13.5px]" style={{ color: TC.muted }}>No accounts connected yet.</p>
                <p className="mt-1 text-[12.5px]" style={{ color: TC.faint }}>Connect a platform on the right to see your full portfolio here.</p>
              </div>
            ) : (
              <>
                {/* total balance banner */}
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(255,255,255,0.015))" }}>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>Total balance</div>
                    <div className="mt-1 text-[30px] font-bold leading-none sm:text-[34px]" style={{ ...monoFont, color: TC.profit }}>{fmtBalance(portfolio?.totalReal ?? null, portfolio?.totalCurrency || "")}</div>
                  </div>
                  {portfolio?.totalDemo != null && portfolio.totalDemo > 0 && (
                    <div className="text-right">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: TC.faint }}>Demo</div>
                      <div className="mt-0.5 text-[15px] font-semibold" style={{ ...monoFont, color: TC.muted }}>{fmtBalance(portfolio.totalDemo, portfolio.totalCurrency || "")}</div>
                    </div>
                  )}
                </div>

                {/* every account */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {accounts.map((a, i) => (
                    <div key={`${a.loginid}-${i}`} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
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
                  ))}
                </div>
              </>
            )}

            {connected && (
              <div className="mt-3 flex items-center gap-4">
                <Link href="/trading/deriv" className="inline-flex items-center gap-1 text-[12.5px] font-medium transition hover:gap-1.5" style={{ color: TC.profitSoft }}>Open Deriv <ArrowUpRight size={13} /></Link>
                <button onClick={disconnect} className="inline-flex items-center gap-1.5 text-[12px] transition hover:opacity-80" style={{ color: TC.faint }}><LogOut size={12} /> Disconnect</button>
              </div>
            )}
          </section>

          {/* ── connect a platform ── */}
          <aside>
            <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
              <Plug size={13} style={{ color: TC.profit }} /> Connect a platform
            </h2>
            <div className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-center gap-2.5">
                <BrandLogo src="/logos/deriv.png" alt="Deriv" size={26} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">Deriv</div>
                  <div className="text-[11.5px]" style={{ color: TC.faint }}>Options + MT5 · one authorisation</div>
                </div>
              </div>
              <button onClick={connectDeriv} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                <Plug size={15} /> Connect Deriv
              </button>
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
            </div>

            {/* coming soon — official logos */}
            <div className="mt-3 space-y-2">
              {[{ name: "cTrader", logo: "/logos/ctrader.svg" }, { name: "More brokers", logo: undefined as string | undefined }].map((p) => (
                <div key={p.name} className="flex items-center gap-2.5 rounded-xl border p-3 opacity-75" style={{ borderColor: TC.line }}>
                  <BrandLogo src={p.logo} alt={p.name} size={20} />
                  <div className="min-w-0 flex-1"><div className="text-[12.5px] font-semibold">{p.name}</div></div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Soon</span>
                </div>
              ))}
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
              <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} /> You authorise your own broker directly. Clunoid never sees your password, and your access stays in this browser.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
