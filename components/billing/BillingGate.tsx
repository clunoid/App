"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X, Zap, Plus } from "lucide-react";
import { useClunoid } from "@/lib/store/useClunoid";
import { useBilling } from "@/lib/billing/store";
import { bindBilling } from "@/lib/billing/bus";
import { CreditModal } from "./CreditModal";
import { CREDITS_PER_USD, MIN_TOPUP_CENTS } from "@/lib/billing/costs";

/**
 * Global billing layer (mounted once in the root layout so it works on every
 * page): wires the decoupled fetch-bus to real UX (401 → login, 402 → upgrade
 * modal, 429 → toast), keeps the credit balance fresh, and renders the
 * "out of credits" modal + a transient notice toast.
 */
export function BillingGate() {
  const authed = useClunoid((s) => s.user.isAuthed);
  const refresh = useBilling((s) => s.refresh);
  const upgradeOpen = useBilling((s) => s.upgradeOpen);
  const closeUpgrade = useBilling((s) => s.closeUpgrade);
  const notice = useBilling((s) => s.notice);
  const setNotice = useBilling((s) => s.setNotice);
  const balance = useBilling((s) => s.balance);
  const plan = useBilling((s) => s.plan);
  const busyPlan = useBilling((s) => s.busyPlan);
  const startCheckout = useBilling((s) => s.startCheckout);
  const buyCredits = useBilling((s) => s.buyCredits);
  const buyingCredits = useBilling((s) => s.buyingCredits);
  const [dollars, setDollars] = useState("5");
  const minDollars = MIN_TOPUP_CENTS / 100;
  const amt = Math.max(0, Math.round(parseFloat(dollars) || 0));
  const valid = amt >= minDollars;

  // Bind the fetch bus → real actions (once).
  useEffect(() => {
    bindBilling({
      status: (status) => {
        if (status === 401) useClunoid.getState().openAuth("login");
        else if (status === 402) {
          useBilling.getState().openUpgrade();
          void useBilling.getState().refresh();
        } else if (status === 429) {
          useBilling.getState().setNotice("You're going a little fast — give it a moment.");
        }
      },
      refresh: () => void useBilling.getState().refresh(),
    });
  }, []);

  // Keep the balance fresh: on auth change / mount, and when the tab refocuses.
  useEffect(() => {
    void refresh();
  }, [authed, refresh]);
  useEffect(() => {
    const onFocus = () => void useBilling.getState().refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  return (
    <>
      <CreditModal />

      <AnimatePresence>
        {upgradeOpen && (
          <motion.div
            className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeUpgrade}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-soft"
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-serif text-xl text-ink">
                  <Zap size={18} className="text-clay" /> Out of credits
                </h2>
                <button onClick={closeUpgrade} className="text-ink-faint hover:text-ink" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-ink-muted">
                You&apos;ve used your {plan === "free" ? "free" : plan} credits ({balance} left). Buy more now and keep
                going, or upgrade for a bigger monthly allowance.
              </p>

              {/* Buy credits right here — enter an amount and go. */}
              <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-faint">
                  <Zap size={13} className="text-clay" /> Add credits now · {CREDITS_PER_USD}/$
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-2">
                    <span className="text-ink-faint">$</span>
                    <input
                      type="number"
                      min={minDollars}
                      inputMode="decimal"
                      value={dollars}
                      onChange={(e) => setDollars(e.target.value)}
                      aria-label="Amount in dollars"
                      className="w-full bg-transparent font-semibold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <button
                    onClick={() => amt >= minDollars && void buyCredits(amt * 100)}
                    disabled={buyingCredits || amt < minDollars}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-clay px-3.5 py-2 text-sm font-extrabold text-[#1F1E1C] transition hover:brightness-105 disabled:opacity-50"
                  >
                    <Plus size={15} /> {buyingCredits ? "…" : "Buy"}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  {valid ? `${(amt * CREDITS_PER_USD).toLocaleString()} credits · purchased credits don't expire` : `Minimum $${minDollars}`}
                </p>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={() => startCheckout("pro")}
                  disabled={busyPlan !== null}
                  className="rounded-xl border border-border bg-base px-4 py-3 text-sm font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60"
                >
                  {busyPlan === "pro" ? "Opening checkout…" : "Or upgrade to Pro — $12/mo"}
                </button>
                <button
                  onClick={() => startCheckout("max")}
                  disabled={busyPlan !== null}
                  className="rounded-xl border border-border bg-base px-4 py-3 text-sm font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60"
                >
                  {busyPlan === "max" ? "Opening checkout…" : "Go Max — $30/mo"}
                </button>
                <Link href="/pricing" onClick={closeUpgrade} className="mt-1 text-center text-xs text-ink-faint hover:text-ink">
                  See full pricing &amp; auto-reload
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink shadow-soft"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
