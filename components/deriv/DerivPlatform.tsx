"use client";

/**
 * DERIV platform page — where a user lands after connecting Deriv. Shows the
 * account holder, the total balance, and the FULL portfolio grouped by product
 * (Options, MT5, Wallets) with live balances, so nothing is hidden. This is also
 * the home for Deriv automation (plugs in next). Everything Deriv lives under
 * the deriv folder so other brokers get their own page the same way.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Plug, Layers, LineChart, Wallet, Bot } from "lucide-react";
import { TC, DOT_GRID, monoFont, fmtBalance } from "@/lib/trading/theme";
import type { ConnectedAccount } from "@/lib/trading/accounts";
import { loadDerivTokens, loadDerivAccess } from "@/lib/deriv/oauth";
import { fetchDerivPortfolio, type DerivPortfolio } from "@/lib/deriv/client";
import { fetchDerivPortfolioREST } from "@/lib/deriv/api";

const SNAP_KEY = "clunoid_deriv_portfolio";

export function DerivPlatform() {
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<DerivPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    const access = loadDerivAccess();
    const tks = loadDerivTokens();
    const has = !!access || tks.length > 0;
    setConnected(has);
    if (!has) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const p = access
        ? await fetchDerivPortfolioREST(access) // new REST API
        : await fetchDerivPortfolio(tks[0].token); // classic WS (pasted token)
      setPortfolio(p);
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(p)); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your Deriv accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (loadDerivAccess() || loadDerivTokens().length) { setConnected(true); try { const s = localStorage.getItem(SNAP_KEY); if (s) setPortfolio(JSON.parse(s) as DerivPortfolio); } catch { /* ignore */ } }
    void load();
  }, [load]);

  const accounts: ConnectedAccount[] = portfolio?.accounts ?? [];
  const options = accounts.filter((a) => a.kind === "options");
  const mt5 = accounts.filter((a) => a.kind === "mt5");
  const cfd = accounts.filter((a) => a.kind === "ctrader" || a.kind === "cfd"); // cTrader, Deriv X
  const wallets = accounts.filter((a) => a.kind === "wallet");
  const p2p = accounts.filter((a) => a.kind === "p2p");

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="grid h-6 place-items-center rounded bg-white/95 px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/deriv-wordmark.svg" alt="Deriv" height={14} style={{ height: 14, width: "auto" }} />
          </span>
          {connected && (
            <button onClick={() => void load()} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: TC.line, color: TC.muted }}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
            </button>
          )}
        </header>

        {error && <div className="mt-4 rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "rgba(242,96,125,0.4)", background: "rgba(242,96,125,0.08)", color: TC.loss }}>{error}</div>}

        {!connected && !loading ? (
          <div className="mt-16 grid place-items-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "rgba(56,189,248,0.12)" }}><Plug size={26} style={{ color: TC.profit }} /></span>
            <h1 className="mt-4 text-[22px] font-bold">Connect your Deriv account</h1>
            <p className="mt-2 max-w-md text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>Authorise Deriv once from Central Command to see your full portfolio — Options, MT5 and Wallets — here.</p>
            <Link href="/trading/command" className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
              <Plug size={15} /> Go to Central Command
            </Link>
          </div>
        ) : loading && !portfolio ? (
          <div className="mt-16 grid place-items-center"><span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}><Loader2 size={16} className="animate-spin" style={{ color: TC.profit }} /> Loading your Deriv portfolio…</span></div>
        ) : (
          <div className="mt-5 space-y-6">
            {/* holder + total */}
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(255,255,255,0.015))" }}>
              <div>
                {portfolio?.name && <div className="text-[13px] font-semibold" style={{ color: TC.text }}>{portfolio.name}</div>}
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>Total balance</div>
                <div className="mt-1 text-[30px] font-bold leading-none sm:text-[34px]" style={{ ...monoFont, color: TC.profit }}>{fmtBalance(portfolio?.totalReal ?? null, portfolio?.totalCurrency || "")}</div>
              </div>
              {portfolio?.totalDemo != null && portfolio.totalDemo > 0 && (
                <div className="text-right"><div className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: TC.faint }}>Demo</div><div className="mt-0.5 text-[15px] font-semibold" style={{ ...monoFont, color: TC.muted }}>{fmtBalance(portfolio.totalDemo, portfolio.totalCurrency || "")}</div></div>
              )}
            </div>

            <AccountGroup title="Deriv Options" icon={LineChart} accounts={options} emptyNote="No Options accounts on this login." />
            <AccountGroup title="Deriv MT5" icon={Layers} accounts={mt5} emptyNote="No MT5 accounts yet — create one in your Deriv account, then refresh." />
            {cfd.length > 0 && <AccountGroup title="CFDs · cTrader / Deriv X" icon={Layers} accounts={cfd} emptyNote="" />}
            {wallets.length > 0 && <AccountGroup title="Wallets" icon={Wallet} accounts={wallets} emptyNote="" />}
            {p2p.length > 0 && <AccountGroup title="P2P" icon={Wallet} accounts={p2p} emptyNote="" />}

            <section className="rounded-2xl border border-dashed p-5" style={{ borderColor: TC.line }}>
              <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: TC.text }}><Bot size={16} style={{ color: TC.profit }} /> Automation</div>
              <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                The intelligent trading engine plugs in here next. On Deriv Options it runs through the API; on Deriv MT5 it runs via an Expert Advisor in your own terminal — you keep custody either way.
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function AccountGroup({ title, icon: Icon, accounts, emptyNote }: { title: string; icon: typeof LineChart; accounts: ConnectedAccount[]; emptyNote: string }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
        <Icon size={13} style={{ color: TC.profit }} /> {title} {accounts.length > 0 && `· ${accounts.length}`}
      </h2>
      {accounts.length === 0 ? (
        emptyNote ? <div className="rounded-xl border border-dashed p-5 text-[12.5px]" style={{ borderColor: TC.line, color: TC.faint }}>{emptyNote}</div> : null
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a, i) => (
            <div key={`${a.loginid}-${i}`} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px]" style={{ ...monoFont, color: TC.muted }}>{a.loginid}</span>
                <span className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider" style={{ background: a.isVirtual ? "rgba(148,168,189,0.14)" : "rgba(56,189,248,0.16)", color: a.isVirtual ? TC.faint : TC.profit }}>{a.isVirtual ? "Demo" : "Real"}</span>
              </div>
              <div className="mt-2.5 text-[22px] font-bold leading-none" style={{ ...monoFont, color: a.kind === "wallet" ? TC.text : TC.profit }}>{fmtBalance(a.balance, a.currency)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
