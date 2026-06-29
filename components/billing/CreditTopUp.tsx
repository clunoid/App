"use client";

import { useEffect, useState } from "react";
import { Zap, Loader2, RefreshCw, Check, Plus } from "lucide-react";
import { useBilling } from "@/lib/billing/store";
import { CREDITS_PER_USD, MIN_TOPUP_CENTS } from "@/lib/billing/costs";
import { cn } from "@/lib/utils";

const PRESETS = [5, 20, 50, 100]; // dollars
const MIN_DOLLARS = MIN_TOPUP_CENTS / 100;

/** Buy extra credits — one-time, custom amount ($5+), 200 credits per $1. */
export function BuyCreditsCard() {
  const authed = useBilling((s) => s.authed);
  const balance = useBilling((s) => s.balance);
  const purchased = useBilling((s) => s.purchased);
  const loaded = useBilling((s) => s.loaded);
  const buying = useBilling((s) => s.buyingCredits);
  const buyCredits = useBilling((s) => s.buyCredits);
  const refresh = useBilling((s) => s.refresh);

  const [dollars, setDollars] = useState("20");
  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const amt = Math.max(0, Math.round(parseFloat(dollars) || 0));
  const credits = amt * CREDITS_PER_USD;
  const valid = amt >= MIN_DOLLARS;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-clay/15 text-clay">
          <Zap size={18} />
        </span>
        <div>
          <h3 className="font-serif text-lg text-ink">Buy credits</h3>
          <p className="text-xs text-ink-muted">Top up any time — {CREDITS_PER_USD} credits per $1.</p>
        </div>
      </div>

      {loaded && authed && (
        <p className="mt-3 text-sm text-ink-muted">
          You have <span className="font-semibold text-ink">{balance.toLocaleString()}</span> credits
          {purchased > 0 && <span className="text-ink-faint"> · {purchased.toLocaleString()} purchased</span>}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDollars(String(d))}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
              amt === d ? "border-clay bg-clay/10 text-ink" : "border-border text-ink-muted hover:bg-surface-2"
            )}
          >
            ${d}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
          <span className="text-ink-faint">$</span>
          <input
            type="number"
            min={MIN_DOLLARS}
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            aria-label="Amount in dollars"
            className="w-full bg-transparent font-semibold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <span className="shrink-0 text-sm font-semibold text-clay-soft">{credits.toLocaleString()} credits</span>
      </div>

      <button
        type="button"
        onClick={() => valid && void buyCredits(amt * 100)}
        disabled={!valid || buying}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-clay py-3 text-sm font-extrabold text-[#1F1E1C] shadow transition hover:brightness-105 disabled:opacity-50"
      >
        {buying ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        {valid ? `Buy ${credits.toLocaleString()} credits — $${amt}` : `Minimum $${MIN_DOLLARS}`}
      </button>
      <p className="mt-2 text-center text-[11px] text-ink-faint">Secure checkout via Polar · tax handled at checkout · purchased credits don&apos;t expire.</p>
    </div>
  );
}

/** Auto-reload — charge the saved card off-session when the balance gets low. */
export function AutoReloadCard() {
  const autoReload = useBilling((s) => s.autoReload);
  const saveAutoReload = useBilling((s) => s.saveAutoReload);

  const [arEnabled, setArEnabled] = useState(autoReload.enabled);
  const [arThreshold, setArThreshold] = useState(String(autoReload.threshold));
  const [arDollars, setArDollars] = useState(String(Math.round(autoReload.amountCents / 100)));
  const [arSaving, setArSaving] = useState(false);
  const [arSaved, setArSaved] = useState(false);

  useEffect(() => {
    setArEnabled(autoReload.enabled);
    setArThreshold(String(autoReload.threshold));
    setArDollars(String(Math.round(autoReload.amountCents / 100)));
  }, [autoReload.enabled, autoReload.threshold, autoReload.amountCents]);

  const onSaveAr = async () => {
    setArSaving(true);
    const ok = await saveAutoReload({
      enabled: arEnabled,
      threshold: Math.max(0, Math.round(parseFloat(arThreshold) || 0)),
      amountCents: Math.max(MIN_TOPUP_CENTS, Math.round((parseFloat(arDollars) || MIN_DOLLARS) * 100)),
    });
    setArSaving(false);
    if (ok) {
      setArSaved(true);
      setTimeout(() => setArSaved(false), 2000);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-spark/15 text-spark-soft">
          <RefreshCw size={17} />
        </span>
        <div>
          <h3 className="font-serif text-lg text-ink">Auto-reload</h3>
          <p className="text-xs text-ink-muted">Never run out mid-flow.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={arEnabled}
          onClick={() => setArEnabled((v) => !v)}
          className={cn("relative ml-auto h-6 w-11 shrink-0 rounded-full transition", arEnabled ? "bg-clay" : "bg-border")}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", arEnabled ? "left-[1.375rem]" : "left-0.5")} />
        </button>
      </div>

      <div className={cn("mt-4 space-y-3 transition", arEnabled ? "opacity-100" : "pointer-events-none opacity-45")}>
        <label className="flex items-center justify-between gap-3 text-sm text-ink-muted">
          When my balance falls below
          <span className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={arThreshold}
              onChange={(e) => setArThreshold(e.target.value)}
              aria-label="Threshold in credits"
              className="w-16 bg-transparent text-right font-semibold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-ink-faint">credits</span>
          </span>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-ink-muted">
          automatically buy
          <span className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2">
            <span className="text-ink-faint">$</span>
            <input
              type="number"
              min={MIN_DOLLARS}
              inputMode="decimal"
              value={arDollars}
              onChange={(e) => setArDollars(e.target.value)}
              aria-label="Reload amount in dollars"
              className="w-16 bg-transparent text-right font-semibold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-ink-faint">of credits</span>
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={onSaveAr}
        disabled={arSaving}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-2 py-3 text-sm font-extrabold text-ink transition hover:bg-surface disabled:opacity-50"
      >
        {arSaving ? <Loader2 size={16} className="animate-spin" /> : arSaved ? <Check size={16} className="text-ok" /> : null}
        {arSaved ? "Saved" : arEnabled ? "Save auto-reload" : "Save (off)"}
      </button>
      <p className="mt-2 text-center text-[11px] text-ink-faint">Charges the card from your last purchase. Make one top-up first to save a card.</p>
    </div>
  );
}

/** Both credit cards together. `stacked` lays them vertically (e.g. as a pricing
 *  column); default is side-by-side on desktop. Designs are unchanged. */
export function CreditCards({ stacked = false }: { stacked?: boolean }) {
  return (
    <div className={stacked ? "flex flex-col gap-5" : "grid gap-4 md:grid-cols-2"}>
      <BuyCreditsCard />
      <AutoReloadCard />
    </div>
  );
}
