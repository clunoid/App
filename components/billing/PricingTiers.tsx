"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Zap, ArrowLeft } from "lucide-react";
import { useBilling } from "@/lib/billing/store";

type Tier = {
  id: "free" | "pro" | "max";
  name: string;
  price: string;
  per: string;
  credits: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    per: "",
    credits: "150 credits / month",
    blurb: "Try every feature.",
    features: ["~1 Stat Battle a month", "~15 searches + a few games", "Isaac's voice", "Free video export"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$12",
    per: "/mo",
    credits: "2,000 credits / month",
    blurb: "For regular creators.",
    features: ["~16 Stat Battles a month", "Hundreds of searches", "Games + Isaac's voice", "Free video export"],
    highlight: true,
  },
  {
    id: "max",
    name: "Max",
    price: "$30",
    per: "/mo",
    credits: "6,000 credits / month",
    blurb: "For power users & creators.",
    features: ["~50 Stat Battles a month", "Everything in Pro", "The most monthly credits"],
  },
];

export function PricingTiers() {
  const plan = useBilling((s) => s.plan);
  const balance = useBilling((s) => s.balance);
  const loaded = useBilling((s) => s.loaded);
  const busyPlan = useBilling((s) => s.busyPlan);
  const startCheckout = useBilling((s) => s.startCheckout);
  const openPortal = useBilling((s) => s.openPortal);
  const refresh = useBilling((s) => s.refresh);
  const [justUpgraded, setJustUpgraded] = useState(false);

  useEffect(() => {
    void refresh();
    try {
      if (new URLSearchParams(window.location.search).get("upgraded") === "1") {
        setJustUpgraded(true);
        // Credits land via the webhook — poll a couple of times so the new plan shows.
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

      {justUpgraded && (
        <div className="mx-auto mt-6 max-w-xl rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-center text-sm text-ink">
          🎉 Thanks for subscribing! Your credits are being added — they&apos;ll appear here in a moment.
        </div>
      )}

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {TIERS.map((t) => {
          const current = plan === t.id;
          return (
            <div
              key={t.id}
              className={
                "relative flex flex-col rounded-2xl border bg-surface p-6 " +
                (t.highlight ? "border-clay/60 shadow-glow" : "border-border")
              }
            >
              {t.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-clay px-3 py-0.5 text-xs font-semibold text-[#1F1E1C]">
                  Most popular
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-2xl text-ink">{t.name}</h2>
                {current && <span className="rounded-full bg-spark/20 px-2 py-0.5 text-xs font-medium text-spark-soft">Current</span>}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-ink">{t.price}</span>
                <span className="text-ink-faint">{t.per}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-clay-soft">{t.credits}</p>
              <p className="mt-1 text-sm text-ink-muted">{t.blurb}</p>

              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-ink-muted">
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
                    onClick={() => startCheckout(t.id as "pro" | "max")}
                    disabled={busyPlan !== null}
                    className={
                      "w-full rounded-xl px-4 py-3 text-sm font-medium transition disabled:opacity-60 " +
                      (t.highlight
                        ? "bg-clay text-[#1F1E1C] hover:bg-clay-soft"
                        : "border border-border bg-base text-ink hover:bg-surface-2")
                    }
                  >
                    {busyPlan === t.id ? "Opening checkout…" : plan === "free" ? `Choose ${t.name}` : `Switch to ${t.name}`}
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
        don&apos;t roll over.
      </p>
    </div>
  );
}
