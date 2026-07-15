"use client";

/**
 * DERIV platform page — where a user lands after connecting Deriv from Central
 * Command. It shows their Deriv accounts grouped by product (Options and MT5)
 * with live balances, and is the home for Deriv-specific controls (the
 * automation engine lands here in the next step). Everything Deriv is under the
 * deriv folder so other brokers get their own page the same way.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Plug, Layers, LineChart, Bot } from "lucide-react";
import { TC, DOT_GRID, monoFont, fmtBalance } from "@/lib/trading/theme";
import type { ConnectedAccount } from "@/lib/trading/accounts";
import { loadDerivTokens } from "@/lib/deriv/oauth";
import { fetchDerivPortfolio } from "@/lib/deriv/client";

export function DerivPlatform() {
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tks = loadDerivTokens();
    setConnected(tks.length > 0);
    if (!tks.length) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setAccounts(await fetchDerivPortfolio(tks[0].token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your Deriv accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const options = accounts.filter((a) => a.kind === "options");
  const mt5 = accounts.filter((a) => a.kind === "mt5");

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[340px]" style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(56,189,248,0.14), transparent 60%)" }} />

      <div className="relative z-10 w-full px-6 py-5 sm:px-10 lg:px-16">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="flex items-center gap-2 text-[14px] font-bold tracking-[0.16em]"><LineChart size={15} style={{ color: TC.profit }} /> DERIV</span>
          {connected && (
            <button onClick={() => void load()} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: TC.line, color: TC.muted }}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
            </button>
          )}
        </header>

        {error && <div className="mt-4 rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "rgba(242,96,125,0.4)", background: "rgba(242,96,125,0.08)", color: TC.loss }}>{error}</div>}

        {/* not connected */}
        {!connected && !loading ? (
          <div className="mt-16 grid place-items-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "rgba(56,189,248,0.12)" }}><Plug size={26} style={{ color: TC.profit }} /></span>
            <h1 className="mt-4 text-[22px] font-bold">Connect your Deriv account</h1>
            <p className="mt-2 max-w-md text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>Authorise Deriv once from Central Command to see your Options and MT5 accounts and balances here.</p>
            <Link href="/trading/command" className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
              <Plug size={15} /> Go to Central Command
            </Link>
          </div>
        ) : loading ? (
          <div className="mt-16 grid place-items-center"><span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}><Loader2 size={16} className="animate-spin" style={{ color: TC.profit }} /> Loading your Deriv accounts…</span></div>
        ) : (
          <div className="mt-6 space-y-6">
            <AccountGroup title="Deriv Options" icon={LineChart} accounts={options} emptyNote="No Options accounts on this login." />
            <AccountGroup title="Deriv MT5" icon={Layers} accounts={mt5} emptyNote="No MT5 accounts yet — create one in your Deriv account, then refresh." />

            {/* next-step placeholder — honest about what's coming */}
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
        <div className="rounded-xl border border-dashed p-5 text-[12.5px]" style={{ borderColor: TC.line, color: TC.faint }}>{emptyNote}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a, i) => (
            <div key={`${a.loginid}-${i}`} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px]" style={{ ...monoFont, color: TC.muted }}>{a.loginid}</span>
                <span className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider" style={{ background: a.isVirtual ? "rgba(148,168,189,0.14)" : "rgba(56,189,248,0.16)", color: a.isVirtual ? TC.faint : TC.profit }}>{a.isVirtual ? "Demo" : "Real"}</span>
              </div>
              <div className="mt-2.5 text-[22px] font-bold leading-none" style={{ ...monoFont, color: TC.profit }}>{fmtBalance(a.balance, a.currency)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
