"use client";

/**
 * CREATOR PROGRAM — choosing how the money reaches you.
 *
 * Out in the open rather than behind a dropdown: this is one of two things a
 * creator ever changes here, and hiding it behind a click made it look optional.
 * Crypto is the exception — it opens, because "USDT (Tether)" means nothing to
 * somebody who just wants "crypto", and there will be more coins later.
 *
 * Picking one runs a check for money waiting to be requested. That check is the
 * honest answer to the question everybody asks at this point — "do I have to
 * put my bank details in now?" — and the answer is no, not until there is
 * something to send.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Wallet, ShieldCheck } from "lucide-react";
import { TC, monoFont } from "@/lib/trading/theme";
import { PAYOUTS, A, GOOD } from "./content";

/** Everything that is not a coin sits on the top row. */
const CRYPTO_KEYS = ["usdt"];

const money = (n: number) => "$" + n.toFixed(n % 1 === 0 ? 0 : 2);

export function PayoutMethods({
  value,
  onChange,
  available,
}: {
  value: string;
  onChange: (v: string) => void;
  /** What is actually sitting there, ready to be asked for. */
  available: number;
}) {
  const [cryptoOpen, setCryptoOpen] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const direct = PAYOUTS.filter((p) => !CRYPTO_KEYS.includes(p.key));
  const crypto = PAYOUTS.filter((p) => CRYPTO_KEYS.includes(p.key));
  const chosenIsCrypto = CRYPTO_KEYS.includes(value);

  function pick(key: string) {
    onChange(key);
    setChecked(false);
    setChecking(key);
    // A real look at their balance, shown for long enough to read. It closes
    // itself — there is nothing here for them to dismiss.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setChecking(null); setChecked(true); }, 1400);
  }

  return (
    <div className="space-y-2.5">
      {/* ── the ones that are just an account ─────────────────────────────── */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {direct.map((p) => {
          const on = value === p.key;
          return (
            <button key={p.key} type="button" onClick={() => pick(p.key)}
              className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition hover:opacity-90"
              style={on ? { borderColor: A, background: `${A}1f` } : { borderColor: TC.line, background: "rgba(0,0,0,0.25)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.logo} alt="" aria-hidden className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: on ? TC.text : TC.muted }}>
                {p.label}
              </span>
              {on && <Check size={14} className="shrink-0" style={{ color: A }} />}
            </button>
          );
        })}

        {/* ── and the coins, behind one word ─────────────────────────────── */}
        <div className="relative">
          <button type="button" onClick={() => setCryptoOpen((o) => !o)}
            aria-expanded={cryptoOpen}
            className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition hover:opacity-90"
            style={chosenIsCrypto
              ? { borderColor: A, background: `${A}1f` }
              : { borderColor: TC.line, background: "rgba(0,0,0,0.25)" }}>
            <Wallet size={17} className="shrink-0" style={{ color: chosenIsCrypto ? A : TC.faint }} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: chosenIsCrypto ? TC.text : TC.muted }}>
              {chosenIsCrypto ? PAYOUTS.find((p) => p.key === value)?.label : "Crypto"}
            </span>
            <ChevronDown size={14} className="shrink-0 transition" style={{ color: TC.faint, transform: cryptoOpen ? "rotate(180deg)" : undefined }} />
          </button>

          {cryptoOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border"
              style={{ borderColor: TC.line, background: "#171a1f", boxShadow: "0 18px 44px rgba(0,0,0,.55)" }}>
              {crypto.map((p) => {
                const on = value === p.key;
                return (
                  <button key={p.key} type="button" onClick={() => { pick(p.key); setCryptoOpen(false); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/[0.06]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.logo} alt="" aria-hidden className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: on ? A : TC.text }}>{p.label}</span>
                    {on && <Check size={14} className="shrink-0" style={{ color: A }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── what happens next ─────────────────────────────────────────────── */}
      {checked && !checking && (
        <div className="rounded-xl border p-3" style={{ borderColor: `${GOOD}44`, background: `${GOOD}10` }}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: GOOD }}>
            <ShieldCheck size={13} /> {available > 0 ? "You have money to request" : "Nothing to request yet"}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
            {available > 0 ? (
              <>
                You have <b style={{ ...monoFont, color: GOOD }}>{money(available)}</b> ready. Ask to be paid and we
                will collect your account details then — that is the only point you need them.
              </>
            ) : (
              <>
                Nothing is waiting yet, so there is nothing to set up. <b style={{ color: TC.text }}>You only fill in
                your account details when you have earnings to withdraw</b> — not before.
              </>
            )}
          </p>
        </div>
      )}

      {checking && <CheckingOverlay />}
    </div>
  );
}

/** Shows while the balance is being looked at, then takes itself away. */
function CheckingOverlay() {
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: "rgba(4,10,20,0.7)", backdropFilter: "blur(3px)" }}>
      <div className="flex w-full max-w-[320px] flex-col items-center rounded-2xl border p-6 text-center"
        style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
        <Loader2 size={26} className="animate-spin" style={{ color: A }} />
        <div className="mt-3 text-[14px] font-bold">Checking your earnings</div>
        <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
          Seeing whether you have anything ready to request.
        </p>
      </div>
    </div>
  );
}
