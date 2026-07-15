"use client";

/**
 * CENTRAL COMMAND — the account-control hub. One place to connect platforms and
 * see every connected account, its balance and platform. No Clunoid sign-in:
 * the user authorises their own Deriv account (OAuth, or a pasted API token) and
 * the tokens live in their browser. Broker-agnostic — accounts render from the
 * generic ConnectedAccount shape, so future platforms slot straight in.
 *
 * Full-screen, edge-to-edge, matching the landing's sky-blue trading theme.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, Plug, RefreshCw, Loader2, LogOut, ArrowUpRight, KeyRound, Building2, ChevronRight, ShieldCheck } from "lucide-react";
import { TC, DOT_GRID, monoFont, fmtBalance } from "@/lib/trading/theme";
import { PLATFORMS } from "@/lib/trading/platforms";
import type { ConnectedAccount } from "@/lib/trading/accounts";
import { hasDerivApp, derivAuthorizeUrl } from "@/lib/deriv/config";
import { parseDerivRedirect, isDerivRedirect, saveDerivTokens, loadDerivTokens, clearDerivTokens, type DerivToken } from "@/lib/deriv/oauth";
import { fetchDerivPortfolio } from "@/lib/deriv/client";

export function CommandCenter() {
  const [tokens, setTokens] = useState<DerivToken[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
  const started = useRef(false);

  const refresh = useCallback(async (tks: DerivToken[]) => {
    if (!tks.length) { setAccounts([]); return; }
    setLoading(true);
    setError(null);
    try {
      const accts = await fetchDerivPortfolio(tks[0].token);
      setAccounts(accts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* on mount: capture an OAuth redirect, then load stored tokens + balances */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let tks = loadDerivTokens();
    if (isDerivRedirect(window.location.search)) {
      const fresh = parseDerivRedirect(window.location.search);
      if (fresh.length) {
        const byId = new Map(tks.map((t) => [t.loginid, t]));
        for (const f of fresh) byId.set(f.loginid, f);
        tks = [...byId.values()];
        saveDerivTokens(tks);
      }
      window.history.replaceState({}, "", "/trading/command"); // clean the tokens out of the URL
    }
    setTokens(tks);
    void refresh(tks);
  }, [refresh]);

  const connectDeriv = () => {
    if (!hasDerivApp()) { setError("Deriv connect isn't set up yet — add your Deriv app id (NEXT_PUBLIC_DERIV_APP_ID). You can paste an API token below in the meantime."); setPasteOpen(true); return; }
    window.location.href = derivAuthorizeUrl();
  };

  const connectWithToken = async () => {
    const t = pasteVal.trim();
    if (t.length < 8) { setError("That doesn't look like a Deriv API token."); return; }
    const tks: DerivToken[] = [{ loginid: "manual", token: t, currency: "" }];
    saveDerivTokens(tks);
    setTokens(tks);
    setPasteOpen(false);
    setPasteVal("");
    await refresh(tks);
  };

  const disconnect = () => {
    clearDerivTokens();
    setTokens([]);
    setAccounts([]);
    setError(null);
  };

  const connected = tokens.length > 0;
  const derivPlatforms = PLATFORMS.filter((p) => p.broker === "Deriv");

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[360px]" style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(56,189,248,0.14), transparent 60%)" }} />

      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        {/* header */}
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Clunoid Trading
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="text-[14px] font-bold tracking-[0.16em]">CENTRAL COMMAND</span>
          {connected && (
            <button onClick={() => void refresh(tokens)} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: TC.line, color: TC.muted }}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
            </button>
          )}
        </header>

        <div className="mt-2 max-w-2xl">
          <h1 className="text-[26px] font-bold sm:text-[30px]">Your accounts, one place.</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Connect a platform and manage every account — balance, platform and status — from a single command center. No Clunoid account needed; you authorise your own broker.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "rgba(242,96,125,0.4)", background: "rgba(242,96,125,0.08)", color: TC.loss }}>{error}</div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* ── your accounts ── */}
          <section className="lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
              <Wallet size={13} style={{ color: TC.profit }} /> Your accounts {accounts.length > 0 && `· ${accounts.length}`}
            </h2>

            {loading && accounts.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border p-12" style={{ borderColor: TC.line, background: TC.panel }}>
                <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}><Loader2 size={16} className="animate-spin" style={{ color: TC.profit }} /> Loading your accounts…</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: TC.line }}>
                <Wallet size={26} style={{ color: TC.faint }} />
                <p className="mt-3 text-[13.5px]" style={{ color: TC.muted }}>No accounts connected yet.</p>
                <p className="mt-1 text-[12.5px]" style={{ color: TC.faint }}>Connect a platform on the right to see your balances here.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {accounts.map((a, i) => (
                  <div key={`${a.loginid}-${i}`} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold">{a.broker} · {a.platform}</span>
                      <span className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider" style={{ background: a.isVirtual ? "rgba(148,168,189,0.14)" : "rgba(56,189,248,0.16)", color: a.isVirtual ? TC.faint : TC.profit }}>{a.isVirtual ? "Demo" : "Real"}</span>
                    </div>
                    <div className="mt-1 text-[11.5px]" style={{ ...monoFont, color: TC.faint }}>{a.loginid}</div>
                    <div className="mt-3 text-[24px] font-bold leading-none" style={{ ...monoFont, color: TC.profit }}>{fmtBalance(a.balance, a.currency)}</div>
                    <Link href={a.platformId.startsWith("deriv") ? "/trading/deriv" : "/trading"} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium transition hover:gap-1.5" style={{ color: TC.profitSoft }}>
                      Open <ArrowUpRight size={13} />
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {connected && (
              <button onClick={disconnect} className="mt-3 inline-flex items-center gap-1.5 text-[12px] transition hover:opacity-80" style={{ color: TC.faint }}>
                <LogOut size={12} /> Disconnect
              </button>
            )}
          </section>

          {/* ── connect a platform ── */}
          <aside>
            <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
              <Plug size={13} style={{ color: TC.profit }} /> Connect a platform
            </h2>
            <div className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
              {/* Deriv (connectable) */}
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.12)" }}><Building2 size={17} style={{ color: TC.profit }} /></span>
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
                  <p className="text-[11px] leading-relaxed" style={{ color: TC.faint }}>Create a token in your Deriv account (Settings → API token) with the <b>Read</b> scope to see balances.</p>
                </div>
              )}
            </div>

            {/* coming-soon platforms from the registry */}
            <div className="mt-3 space-y-2">
              {PLATFORMS.filter((p) => p.broker !== "Deriv").map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 rounded-xl border p-3 opacity-70" style={{ borderColor: TC.line }}>
                  <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "rgba(148,168,189,0.1)" }}><Building2 size={15} style={{ color: TC.faint }} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold">{p.broker}</div>
                    <div className="truncate text-[11px]" style={{ color: TC.faint }}>{p.platform}</div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Soon</span>
                </div>
              ))}
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
              <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} /> You authorise your own broker directly. Clunoid never sees your password, and your access token stays in this browser.
            </p>
            <p className="mt-2 text-[11px]" style={{ color: TC.faint }}>{derivPlatforms.length} Deriv products · <Link href="/trading#platforms" className="underline" style={{ color: TC.muted }}>all platforms</Link></p>
          </aside>
        </div>
      </div>
    </main>
  );
}
