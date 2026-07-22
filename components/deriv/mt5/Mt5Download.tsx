"use client";

/**
 * The download control for a PAID MT5 automation. It replaces the old static
 * download link on each paid bot page and carries the whole purchase flow:
 *
 *  - owned            → a real Download button (streams the gated file).
 *  - not owned        → "Get it — $X", which opens the purchase popup.
 *  - just paid, guest → "create your account to download" (pay-then-sign-up):
 *                       after they sign up, we claim the device purchase and the
 *                       button flips to Download.
 *
 * The popup always offers the free way out — "use free bots instead." — which
 * sends them straight to the free Deriv bots.
 *
 * The free general automation does NOT use this; it keeps its plain public link.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Lock, X, Sparkles, ShieldCheck, CheckCircle2 } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { useClunoid } from "@/lib/store/useClunoid";

type Access = { paid: boolean; signedIn: boolean; owned: boolean; paidAsGuest: boolean; priceUsd: number | null };

export function Mt5Download({ botId, botName, accent, label }: { botId: string; botName: string; accent: string; label: string }) {
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const openAuth = useClunoid((s) => s.openAuth);
  const router = useRouter();

  const [access, setAccess] = useState<Access | null>(null);
  const [popup, setPopup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justPaid, setJustPaid] = useState(false);
  const claimed = useRef(false);
  const downOnBackdrop = useRef(false);
  const polls = useRef(0);
  const checkoutAbort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/trading/mt5/access/${botId}`, { cache: "no-store" });
      setAccess((await r.json()) as Access);
    } catch {
      // Don't fabricate a not-owned/not-signed-in state on a transient failure —
      // that would show a paying owner the "Get it" (re-purchase) button. Keep
      // the last good state; on first load leave it null so it stays "Loading…".
      setAccess((prev) => prev);
    }
  }, [botId]);

  useEffect(() => {
    // Read the post-payment flag from the URL without pulling in useSearchParams
    // (which would force a Suspense boundary); strip it so a refresh is clean.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("purchased") === "1") {
      setJustPaid(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("purchased");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    void load();
  }, [load]);

  // When sign-in/up completes, bind this device's guest purchase to the account,
  // then refresh so the button flips to Download.
  useEffect(() => {
    if (!isAuthed || claimed.current) return;
    claimed.current = true;
    void (async () => {
      try { await fetch("/api/trading/mt5/claim", { method: "POST" }); } catch { /* ignore */ }
      await load();
    })();
  }, [isAuthed, load]);

  // Right after a SIGNED-IN purchase the webhook can lag a beat; poll briefly
  // until owned, capped so a permanently-missing webhook can't poll forever. A
  // guest can't become owned by polling (that needs sign-up), so it's excluded.
  useEffect(() => {
    if (!justPaid || !access || access.owned || !access.signedIn) return;
    if (polls.current >= 20) return; // ~50s ceiling
    const t = setTimeout(() => { polls.current += 1; void load(); }, 2500);
    return () => clearTimeout(t);
  }, [justPaid, access, load]);

  const closePopup = () => {
    checkoutAbort.current?.abort();
    setPopup(false);
    setBusy(false);
  };

  const startCheckout = async () => {
    const ctrl = new AbortController();
    checkoutAbort.current = ctrl;
    setBusy(true);
    try {
      const r = await fetch("/api/trading/mt5/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botId }),
        signal: ctrl.signal,
      });
      const d = (await r.json()) as { url?: string };
      // Don't redirect if the user closed the popup while this was in flight.
      if (d.url && !ctrl.signal.aborted) { window.location.href = d.url; return; }
    } catch { /* aborted or failed */ }
    if (!ctrl.signal.aborted) setBusy(false);
  };

  const download = () => { window.location.href = `/api/trading/mt5/download/${botId}`; };

  const btnBase = "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90 disabled:opacity-70";
  const price = access?.priceUsd != null ? `$${access.priceUsd}` : "";

  // ── button states ──
  let control: React.ReactNode;
  if (!access) {
    control = <span className={btnBase} style={{ background: accent, color: TC.ink, opacity: 0.7 }}><Loader2 size={15} className="animate-spin" /> Loading…</span>;
  } else if (access.owned) {
    control = <button onClick={download} className={btnBase} style={{ background: accent, color: TC.ink }}><Download size={15} /> {label}</button>;
  } else if ((access.paidAsGuest || justPaid) && !access.signedIn) {
    // Paid but not signed in yet (proof: the device token + ledger via paidAsGuest,
    // so this survives a reload). Signing up claims it and unlocks the download.
    control = (
      <button onClick={() => openAuth("signup")} className={btnBase} style={{ background: accent, color: TC.ink }}>
        <CheckCircle2 size={15} /> Payment received — create your account to download
      </button>
    );
  } else if (justPaid) {
    control = <span className={btnBase} style={{ background: accent, color: TC.ink, opacity: 0.8 }}><Loader2 size={15} className="animate-spin" /> Finalising your purchase…</span>;
  } else {
    control = (
      <button onClick={() => setPopup(true)} className={btnBase} style={{ background: accent, color: TC.ink }}>
        <Lock size={14} /> Get it{price ? ` — ${price}` : ""}
      </button>
    );
  }

  return (
    <>
      {control}

      {popup && (
        <div role="dialog" aria-modal="true" aria-labelledby="mt5-buy-title"
          className="fixed inset-0 z-50 grid place-items-center p-5"
          style={{ background: "rgba(4,10,20,0.72)", backdropFilter: "blur(3px)" }}
          onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
          onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) closePopup(); }}>
          <div className="relative w-full max-w-[420px] rounded-2xl border p-5" style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
            <button onClick={closePopup} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-lg p-1 transition hover:bg-white/10" style={{ color: TC.faint }}>
              <X size={16} />
            </button>

            <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${accent}22` }}>
              <Sparkles size={20} style={{ color: accent }} />
            </span>
            <h3 id="mt5-buy-title" className="mt-3 text-[17px] font-bold">Unlock {botName}</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              A one-time purchase{price ? ` of ${price}` : ""}, tax included. Buy it once and it&rsquo;s tied to your
              account — download it and run it on your own MT5 terminal, any time.
            </p>

            <button onClick={() => void startCheckout()} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90 disabled:opacity-70" style={{ background: accent, color: TC.ink }}>
              {busy ? <><Loader2 size={15} className="animate-spin" /> Opening checkout…</> : <><Lock size={14} /> Buy &amp; download{price ? ` — ${price}` : ""}</>}
            </button>

            <div className="mt-4 rounded-xl border p-3.5" style={{ borderColor: TC.line, background: "rgba(52,211,153,0.06)" }}>
              <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
                Not ready to buy? You can use our <b style={{ color: TC.text }}>free, powerful, fully automated AI bots</b> right
                now — they trade your own Deriv account at no cost.
              </p>
              <button onClick={() => router.push("/trading/deriv/bots")} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition hover:bg-white/5" style={{ borderColor: "rgba(52,211,153,0.4)", color: "#34d399" }}>
                Use free bots instead.
              </button>
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
              <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: accent }} /> Secure checkout by Polar. We never see your card details.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
