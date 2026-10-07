"use client";

/**
 * CENTRAL COMMAND — the home of a connected visitor: the Smart Scan bot, with its
 * balance, Real / Demo, the links to Deriv's bots, MT5, deposit and withdraw, and
 * the risk line last. A visitor who is not connected sees the automations and the
 * way to connect instead.
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
import { ArrowLeft, Wallet, Plug, RefreshCw, Loader2, LogOut, ShieldCheck, Building2, UserPlus, ChevronRight } from "lucide-react";
import { TC, DOT_GRID } from "@/lib/trading/theme";
import { hasDerivApp, DERIV_AFFILIATE_URL } from "@/lib/deriv/config";
import { isDerivRedirect, isDerivCodeReturn, startDerivLogin, completeDerivLogin, loadDerivTokens, clearDerivTokens, saveDerivAccess, loadDerivAccess, clearDerivAccess, clearReconnectGuard, reconnectAfterExpiry, connectChoiceAnswered, markConnectChoice } from "@/lib/deriv/oauth";
import type { DerivPortfolio } from "@/lib/deriv/client";
import { fetchDerivPortfolioREST, isDerivAuthError } from "@/lib/deriv/api";
import { SupportChat } from "@/components/support/SupportChat";
import { InstallApp } from "@/components/pwa/InstallApp";
import { InstallCard } from "@/components/pwa/InstallCard";
import { GATES, GATE_ORDER } from "@/components/trading/ConnectPrompt";
import { t, useLang } from "@/lib/i18n/t";
import { SmartScan } from "@/components/trading/SmartScan";

/** The one kind of connection: Deriv's own sign-in, with an access token issued
 *  to Clunoid's app (33P…). Legacy a1- tokens (pasted, or Deriv's classic flat
 *  redirect) read accounts on another app id, so they are no longer accepted. */
type Session = { kind: "oauth"; accessToken: string };

/**
 * The two automations this hub opens into. While nothing is connected these
 * stand in for the empty portfolio — a visitor should SEE the bots exist before
 * being asked to authorise anything. Clicking one opens the connect prompt
 * instead of navigating; once connected they behave as ordinary links.
 */
const SNAP_KEY = "clunoid_deriv_portfolio"; // cached snapshot for instant reconnect-free display

/** An official brand logo (served same-origin), with a text fallback. */
function BrandLogo({ src, alt, size = 26 }: { src?: string; alt: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return <span className="grid shrink-0 place-items-center rounded-lg" style={{ width: size + 8, height: size + 8, background: "rgba(56,189,248,0.12)" }}><Building2 size={size - 6} style={{ color: TC.profit }} /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="grid shrink-0 place-items-center rounded-lg bg-white/95" style={{ width: size + 8, height: size + 8 }}><img src={src} alt={alt} width={size} height={size} onError={() => setOk(false)} style={{ width: size, height: size, objectFit: "contain" }} /></span>;
}

/** The account hub: the Smart Scan bot for a connected visitor, the way to connect otherwise. */
export function CommandCenter() {
  useLang(); // renders again when the reader's language changes
  const [session, setSession] = useState<Session | null>(null);
  const [portfolio, setPortfolio] = useState<DerivPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which automation was reached for before connecting. null = prompt closed. */
  const started = useRef(false);

  /** `fresh`: the token was issued by Deriv a moment ago, on this very load. */
  const refresh = useCallback(async (s: Session | null, fresh = false) => {
    if (!s) { setPortfolio(null); return; }
    setLoading(true);
    setError(null);
    try {
      const p = await fetchDerivPortfolioREST(s.accessToken); // new REST API (api.derivws.com), app 33P…
      setPortfolio(p);
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(p)); } catch { /* ignore */ }
      // The token works, so a later expiry may reconnect silently again.
      clearReconnectGuard();
    } catch (e) {
      /* Deriv refused the token. An old one has most likely expired: reconnect
         once, silently. A fresh one refused is not an expiry — reconnecting
         would fetch the same refusal and bounce between Deriv and here for
         ever, the page flashing on every pass — so stop and say so instead. */
      if (isDerivAuthError(e)) {
        if (!fresh && reconnectAfterExpiry()) return; // navigating to Deriv
        clearDerivAccess();
        clearDerivTokens();
        try { localStorage.removeItem(SNAP_KEY); } catch { /* ignore */ }
        setSession(null);
        setPortfolio(null);
      }
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
    // Restore the stored connection: Deriv's sign-in only. Tokens a browser kept
    // from the old paste / classic flow are thrown away — they would read the
    // accounts on another app id — and that visitor simply connects again.
    const restore = (): Session | null => {
      const acc = loadDerivAccess();
      if (loadDerivTokens().length) clearDerivTokens();
      return acc ? { kind: "oauth", accessToken: acc } : null;
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
          // Fresh: if Deriv refuses this one, say so rather than reconnect. The
          // reconnect guard is cleared only once the token has actually worked.
          await refresh(s, true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Deriv connection failed.");
          setLoading(false);
        }
      })();
      return;
    }

    // Deriv's classic flat return (?acct1&token1&cur1) carries legacy a1- tokens
    // of a numeric app — never Clunoid's. They are not stored; the address is cleaned.
    if (isDerivRedirect(search)) {
      window.history.replaceState({}, "", "/trading/command");
    }

    /* Nobody who has not connected belongs here.
       This is an account screen; a stranger — or a crawler — arriving with no
       session and nothing in flight is sent to the landing page, which is where
       connecting starts.

       Two exemptions, and both are real:
         ?connect=1 is the landing page deliberately sending someone here to
         answer the connect-or-create prompt, so turning it away would loop.
         ?error is Deriv reporting a failed connection, and that message has to
         be readable rather than redirected out of existence.

       Every OAuth return has already been handled and returned above, so by
       this line there is genuinely nothing happening. */
    if (!restore() && qs.get("connect") !== "1" && !qs.get("error")) {
      window.location.replace("/");
      return;
    }

    const s = restore();
    setSession(s);
    showSnapshot(s); // show the cached snapshot instantly, then refresh live
    void refresh(s);

    // Arriving from a paid page's "use free bots" exit while NOT linked: open the
    // connect-or-create prompt automatically so they can link or open an account.
    if (qs.get("connect") === "1") {
      window.history.replaceState({}, "", "/trading/command");
    }
  }, [refresh]);

  const connectDeriv = () => {
    if (!hasDerivApp()) { setError("Deriv sign-in isn't configured yet."); return; }
    setError(null);
    void startDerivLogin();
  };

  /* The connect-or-create question is asked on the landing page now, before
     anyone arrives here. Every press of this goes straight to Deriv; the
     Create link sits directly beneath it for the other answer. */
  const askThenConnect = () => { connectDeriv(); };

  const disconnect = () => {
    // A bot trading on this connection finishes or is stopped first.
    const bot = (window as Window & { ClnBot?: { run?: () => { active?: boolean } | null } }).ClnBot;
    if (bot?.run?.()?.active) { setError("Stop the bot before you disconnect."); return; }
    clearDerivTokens();
    clearDerivAccess();
    try { localStorage.removeItem(SNAP_KEY); } catch { /* ignore */ }
    setSession(null);
    setPortfolio(null);
    setError(null);
  };

  const connected = session != null;

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 w-full px-4 py-3 sm:px-10 sm:py-5 lg:px-16">
        {/* header — one row on a phone: the way back, the page, and its actions as icons,
            the language switch beside them (it mounts into [data-lang-switch]). */}
        <header className="flex flex-wrap items-center gap-1.5 sm:gap-3">
          <Link href="/" className="flex items-center gap-1 text-[12.5px] font-medium transition hover:opacity-80 sm:gap-1.5 sm:text-[13px]" style={{ color: TC.muted }}>
            <ArrowLeft size={14} /> Clunoid Trading
          </Link>
          <span className="hidden h-3.5 w-px min-[380px]:block sm:h-4" style={{ background: TC.line }} />
          <span className="hidden text-[12px] font-bold tracking-[0.14em] min-[380px]:inline sm:text-[14px] sm:tracking-[0.16em]">HOME</span>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <InstallApp className="rounded-full px-3 py-1.5 text-[12.5px]" />
            {connected && (
              <button onClick={() => void refresh(session)} disabled={loading} title="Refresh" aria-label="Refresh" className="inline-flex h-[30px] w-[30px] items-center justify-center gap-1.5 rounded-full border text-[12.5px] font-medium transition hover:bg-white/5 disabled:opacity-50 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5" style={{ borderColor: TC.line, color: TC.muted }}>
                {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} <span className="hidden sm:inline">Refresh</span>
              </button>
            )}
            {/* Ending the connection: the one way to sign in with another Deriv
                account. Just the icon on a phone, where the header is narrow. */}
            {connected && (
              <button onClick={disconnect} title="Disconnect Deriv" aria-label="Disconnect Deriv" className="inline-flex h-[30px] w-[30px] items-center justify-center gap-1.5 rounded-full border text-[12.5px] font-medium transition hover:bg-white/5 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5" style={{ borderColor: TC.line, color: TC.muted }}>
                <LogOut size={13} /> <span className="hidden sm:inline">Disconnect</span>
              </button>
            )}
            <div data-lang-switch className="flex items-center" />
          </div>
        </header>

        <div className="mt-1.5 max-w-2xl sm:mt-2">
          <h1 className="text-[19px] font-bold leading-tight sm:text-[30px]">{portfolio?.name ? t("Welcome, {name}.", { name: portfolio.name.split(" ")[0] }) : "Your accounts, one place."}</h1>
        </div>

        {error && <div className="mt-3 rounded-xl border p-3 text-[12.5px] sm:mt-4" style={{ borderColor: "rgba(242,96,125,0.4)", background: "rgba(242,96,125,0.08)", color: TC.loss }}>{error}</div>}

        {/* Connected: the bot is the page. Its balance, its links to the bots, MT5,
            deposit and withdraw, and its risk line are the last thing here. */}
        {connected && (
          <section className="mt-3 sm:mt-5" aria-label="Smart Scan bot">
            <SmartScan />
          </section>
        )}

        {/* Not connected (sent here to connect, a refused sign-in, or just
            disconnected): the automations, and the way in. */}
        {!connected && (
          <div className="mt-4 grid gap-4 sm:mt-6 lg:grid-cols-3">
            <section className="lg:col-span-2 lg:flex lg:flex-col">
              <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
                <Wallet size={13} style={{ color: TC.profit }} /> Your portfolio
              </h2>

              {loading ? (
                <div className="grid place-items-center rounded-2xl border p-12 lg:flex-1" style={{ borderColor: TC.line, background: TC.panel }}>
                  <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: TC.muted }}><Loader2 size={16} className="animate-spin" style={{ color: TC.profit }} /> Loading your portfolio…</span>
                </div>
              ) : (
                /* Nothing linked yet: show the automations rather than an empty
                   wallet, so a visitor can see the bots are real before being
                   asked to authorise anything. A click opens the connect prompt. */
                <div className="rounded-2xl border p-5 sm:p-6 lg:flex-1" style={{ borderColor: TC.line, background: TC.panel }}>
                  <h3 className="text-[15.5px] font-bold">Your automations are ready</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                    Open either one to connect your account — or create one — and your full portfolio appears here.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {GATE_ORDER.map((t) => {
                      const g = GATES[t];
                      const Icon = g.icon;
                      return (
                        <button key={t} type="button" onClick={() => { setError(null); connectDeriv(); }}
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
              )}
            </section>

            {/* ── connect a platform ── */}
            <aside className="flex flex-col">
              <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
                <Plug size={13} style={{ color: TC.profit }} /> Connect a platform
              </h2>
              <div className="flex flex-1 flex-col rounded-2xl border p-3 min-[360px]:p-4" style={{ borderColor: TC.line, background: TC.panel }}>
                <div className="flex items-center gap-2.5">
                  <BrandLogo src="/logos/deriv.png" alt="Deriv" size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13.5px] font-semibold">Deriv</div>
                    <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: TC.faint }}>Options + MT5 · one authorisation</div>
                  </div>
                </div>

                <button onClick={askThenConnect} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90" style={{ background: TC.profit, color: TC.ink }}>
                  <Plug size={15} /> Connect Deriv
                </button>
                <a href={DERIV_AFFILIATE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>
                  <UserPlus size={15} style={{ color: TC.profit }} /> Create a Deriv account
                </a>

                <div className="mt-auto pt-4">
                  <p className="flex items-start gap-1.5 border-t pt-3 text-[11px] leading-relaxed" style={{ color: TC.faint, borderColor: TC.line }}>
                    <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} /> You authorise your own broker directly. Clunoid never sees your password, and your access stays in this browser.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      <InstallCard />
      <SupportChat source="Home" />
    </main>
  );
}
