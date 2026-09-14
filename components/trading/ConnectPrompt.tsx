"use client";

/**
 * THE CONNECT-OR-CREATE PROMPT.
 *
 * Asked once, at the moment somebody presses Get started on the landing page
 * without a linked account: connect the Deriv account they have, or open one
 * through our referral. It drives the SAME connect call the Command Center's
 * own button makes — there is still only one connection path.
 *
 * It used to live on the Command Center and open there. Somebody new to Deriv
 * now answers it on the landing page, before being sent anywhere.
 */

import { useEffect, useRef, useState } from "react";
import { Bot, Building2, LineChart, Loader2, Plug, ShieldCheck, UserPlus, X } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { DERIV_AFFILIATE_URL } from "@/lib/deriv/config";
import { markConnectChoice } from "@/lib/deriv/oauth";

export type GateTarget = "bots" | "mt5";
export const GATE_ORDER: readonly GateTarget[] = ["bots", "mt5"];
export const GATES: Record<GateTarget, { href: string; label: string; sub: string; icon: typeof Bot; noun: string }> = {
  bots: { href: "/trading/deriv/bots", label: "Deriv Bots", sub: "AI automation", icon: Bot, noun: "The Deriv bots" },
  mt5: { href: "/trading/deriv/mt5", label: "MT5", sub: "MT5 AI bots", icon: LineChart, noun: "The MT5 bots" },
};

/**
 * Asked for at the moment someone opens an automation without a linked account:
 * connect the one they have, or open one. It drives the SAME handlers as the
 * panel on the right — no second connection path.
 */
export function ConnectPrompt({ target, onConnect, onClose }: { target: GateTarget; onConnect: () => void; onClose: () => void }) {
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
        <button onClick={() => { markConnectChoice(); setBusy(true); onConnect(); }} disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90 disabled:opacity-70"
          style={{ background: TC.profit, color: TC.ink }}>
          {busy ? <><Loader2 size={15} className="animate-spin" /> Connecting…</> : <><Plug size={15} /> Connect Deriv</>}
        </button>
        <a href={DERIV_AFFILIATE_URL} onClick={markConnectChoice} target="_blank" rel="noopener noreferrer" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-white/5" style={{ borderColor: TC.line, color: TC.text }}>
          <UserPlus size={15} style={{ color: TC.profit }} /> Create a Deriv account
        </a>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: TC.profit }} /> You authorise your own broker directly.
        </p>
      </div>
    </div>
  );
}

function BrandLogo({ src, alt, size = 26 }: { src?: string; alt: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return <span className="grid shrink-0 place-items-center rounded-lg" style={{ width: size + 8, height: size + 8, background: "rgba(56,189,248,0.12)" }}><Building2 size={size - 6} style={{ color: TC.profit }} /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="grid shrink-0 place-items-center rounded-lg bg-white/95" style={{ width: size + 8, height: size + 8 }}><img src={src} alt={alt} width={size} height={size} onError={() => setOk(false)} style={{ width: size, height: size, objectFit: "contain" }} /></span>;
}
