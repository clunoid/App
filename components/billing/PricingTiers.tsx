"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Zap, ArrowLeft, Sparkles } from "lucide-react";
import { useBilling } from "@/lib/billing/store";

type Interval = "monthly" | "annual";

type Tier = {
  id: "free" | "pro" | "max";
  name: string;
  monthly: string;
  annual?: string;
  annualNote?: string;
  credits: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    monthly: "$0",
    credits: "150 credits / month",
    blurb: "Try every feature.",
    features: ["Try Stat Battle (presets & data)", "Searches, games & Isaac's voice", "Free video export"],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: "$12",
    annual: "$120",
    annualNote: "2 months free",
    credits: "2,000 credits / month",
    blurb: "For regular creators.",
    features: ["Custom AI Stat Battles", "Hundreds of searches", "Games & Isaac's voice", "Free video export"],
    highlight: true,
  },
  {
    id: "max",
    name: "Max",
    monthly: "$30",
    annual: "$300",
    annualNote: "2 months free",
    credits: "6,000 credits / month",
    blurb: "For power users & creators.",
    features: ["The most monthly credits", "Custom AI Stat Battles", "Everything in Pro"],
  },
];

/** Shown on the Max card to a current Pro subscriber — matches the Polar discount. */
const UPGRADE_DISCOUNT_LABEL = "25% off your first payment";

export function PricingTiers() {
  const plan = useBilling((s) => s.plan);
  const balance = useBilling((s) => s.balance);
  const loaded = useBilling((s) => s.loaded);
  const busyPlan = useBilling((s) => s.busyPlan);
  const startCheckout = useBilling((s) => s.startCheckout);
  const openPortal = useBilling((s) => s.openPortal);
  const refresh = useBilling((s) => s.refresh);
  const [interval, setIntervalState] = useState<Interval>("monthly");
  const [justUpgraded, setJustUpgraded] = useState(false);

  useEffect(() => {
    void refresh();
    try {
      if (new URLSearchParams(window.location.search).get("upgraded") === "1") {
        setJustUpgraded(true);
        const t1 = setTimeout(() => void useBilling.getState().refresh(), 2500);
        const t2 = setTimeout(() => void useBilling.getState().refresh(), 6000);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
        };
      }
    } catch {
      /* ignore */
    }
  }, [refresh]);

  const isPro = plan === "pro";

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12">
      <Link href="/home" className="mb-8 inline-flex items-center gap-1.5 text-sm text-ink-faint transition hover:text-ink">
        <ArrowLeft size={15} /> Back to Clunoid
      </Link>

      <div className="text-center">
        <h1 className="font-serif text-4xl text-ink sm:text-5xl">Simple, fair pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted">
          One pool of credits powers everything — Stat Battles, search, games and Isaac&apos;s voice. Exporting your
          videos is always free.
        </p>
        {loaded && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm text-clay-soft">
            <Zap size={14} className="text-clay" /> You have <span className="font-semibold text-ink">{balance}</span> credits
            <span className="text-ink-faint">· {plan} plan</span>
          </p>
        )}
      </div>

      {/* Pro-only: highlight the Max upgrade offer */}
      {isPro && (
        <div className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-xl border border-clay/50 bg-clay/10 px-4 py-3 text-center text-sm text-ink">
          <Sparkles size={16} className="text-clay" />
          <span>
            <span className="font-semibold">Upgrade to Max</span> — {UPGRADE_DISCOUNT_LABEL}, and your remaining Pro
            credits come with you.
          </span>
        </div>
      )}

      {justUpgraded && (
        <div className="mx-auto mt-6 max-w-xl rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-center text-sm text-ink">
          🎉 Thanks for subscribing! Your credits are being added — they&apos;ll appear here in a moment.
        </div>
      )}

      {/* Monthly / Annual toggle */}
      <div className="mt-8 flex items-center justify-center">
        <div className="inline-flex rounded-full border border-border bg-surface p-1 text-sm">
          {(["monthly", "annual"] as Interval[]).map((iv) => (
            <button
              key={iv}
              onClick={() => setIntervalState(iv)}
              className={
                "rounded-full px-4 py-1.5 font-medium transition " +
                (interval === iv ? "bg-clay text-[#1F1E1C]" : "text-ink-muted hover:text-ink")
              }
            >
              {iv === "monthly" ? "Monthly" : "Annual"}
              {iv === "annual" && <span className={"ml-1.5 text-xs " + (interval === iv ? "text-[#1F1E1C]/70" : "text-ok")}>save ~17%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {TIERS.map((t) => {
          const current = plan === t.id;
          const proToMax = isPro && t.id === "max";
          const showAnnual = interval === "annual" && t.annual;
          const price = t.id === "free" ? "$0" : showAnnual ? (t.annual as string) : t.monthly;
          const per = t.id === "free" ? "" : showAnnual ? "/yr" : "/mo";
          const highlight = t.highlight || proToMax;
          return (
            <div
              key={t.id}
              className={"relative flex flex-col rounded-2xl border bg-surface p-6 " + (highlight ? "border-clay/60 shadow-glow" : "border-border")}
            >
              {proToMax ? (
                <span className="absolute -top-3 left-6 rounded-full bg-clay px-3 py-0.5 text-xs font-semibold text-[#1F1E1C]">
                  Your upgrade · {UPGRADE_DISCOUNT_LABEL}
                </span>
              ) : (
                t.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-clay px-3 py-0.5 text-xs font-semibold text-[#1F1E1C]">
                    Most popular
                  </span>
                )
              )}
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-2xl text-ink">{t.name}</h2>
                {current && <span className="rounded-full bg-spark/20 px-2 py-0.5 text-xs font-medium text-spark-soft">Current</span>}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-ink">{price}</span>
                <span className="text-ink-faint">{per}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-clay-soft">{t.credits}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {showAnnual && t.annualNote ? `${t.annualNote} · billed yearly` : t.blurb}
              </p>

              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-ink-muted">
                {proToMax && (
                  <li className="flex items-start gap-2 font-medium text-clay-soft">
                    <Check size={16} className="mt-0.5 shrink-0 text-clay" /> Keep your remaining Pro credits
                  </li>
                )}
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-ok" /> {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {current ? (
                  <button disabled className="w-full rounded-xl border border-border bg-base px-4 py-3 text-sm font-medium text-ink-faint">
                    ✓ Your plan
                  </button>
                ) : t.id === "free" ? (
                  <button
                    onClick={() => openPortal()}
                    className="w-full rounded-xl border border-border bg-base px-4 py-3 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    Manage subscription
                  </button>
                ) : (
                  <button
                    onClick={() => startCheckout(t.id as "pro" | "max", interval)}
                    disabled={busyPlan !== null}
                    className={
                      "w-full rounded-xl px-4 py-3 text-sm font-medium transition disabled:opacity-60 " +
                      (highlight ? "bg-clay text-[#1F1E1C] hover:bg-clay-soft" : "border border-border bg-base text-ink hover:bg-surface-2")
                    }
                  >
                    {busyPlan === t.id ? "Opening checkout…" : proToMax ? "Upgrade to Max" : plan === "free" ? `Choose ${t.name}` : `Switch to ${t.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {plan !== "free" && (
        <div className="mt-6 text-center">
          <button onClick={() => openPortal()} className="text-sm text-ink-faint underline-offset-4 transition hover:text-ink hover:underline">
            Manage or cancel your subscription
          </button>
        </div>
      )}

      <p className="mx-auto mt-10 max-w-xl text-center text-xs text-ink-faint">
        Payments are securely handled by Polar (our merchant of record). Cancel anytime. Credits reset each month and
        don&apos;t roll over — except when you upgrade, where your remaining credits carry over.
      </p>
    </div>
  );
}
