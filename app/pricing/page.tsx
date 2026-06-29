import type { Metadata } from "next";
import { PricingTiers } from "@/components/billing/PricingTiers";

export const metadata: Metadata = {
  title: "Pricing & Credits — Free, Pro $12, Max $30",
  description:
    "Clunoid pricing: start free, Pro $12/mo, Max $30/mo. One pool of credits powers Stat Battles, search, games and Isaac's voice. Buy credits any time (from $5, 200 per $1) or set auto-reload. HD video export is always free.",
  keywords: [
    "Clunoid pricing", "Clunoid cost", "Clunoid plans", "AI credits", "buy AI credits", "pay as you go AI",
    "AI auto-reload", "cheap AI subscription", "AI app pricing", "free AI plan", "how much does Clunoid cost",
  ],
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    url: "https://clunoid.com/pricing",
    siteName: "Clunoid",
    title: "Clunoid Pricing & Credits",
    description:
      "Start free, Pro $12/mo, Max $30/mo. Buy credits any time (200 per $1) or set auto-reload. HD video export is always free.",
  },
  twitter: { card: "summary_large_image", title: "Clunoid Pricing & Credits" },
};

const PRICING_FAQ = [
  {
    q: "How much does Clunoid cost?",
    a: "Clunoid is free to start (150 credits a month). Pro is $12/month (2,000 credits) and Max is $30/month (6,000 credits). You can also buy credits any time from $5 — 200 credits per $1.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. The free plan includes 150 credits a month, access to every feature, and free HD video export — no credit card required to start.",
  },
  {
    q: "What are credits and how do they work?",
    a: "Credits are one shared pool that powers Isaac's voice, Stat Battles, search and games. Your plan refills credits each month, and you can buy more any time or set up auto-reload so you never run out.",
  },
  {
    q: "Can I buy credits without a subscription?",
    a: "Yes — credits are pay-as-you-go from $5 (200 credits per $1). Purchased credits don't expire, so you can top up whenever you need more.",
  },
  {
    q: "Is video export free?",
    a: "Yes. Exporting your videos in HD is always free, with no watermark. Premium AI voiceover uses credits.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes. Subscriptions are managed through the secure billing portal and you can cancel whenever you like; purchased credits stay yours.",
  },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      name: "Clunoid",
      description:
        "AI host you talk to — answers with visuals, bar-chart-race Stat Battles, a flag game and shareable videos.",
      brand: { "@type": "Brand", name: "Clunoid" },
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", url: "https://clunoid.com/pricing" },
        { "@type": "Offer", name: "Pro", price: "12", priceCurrency: "USD", url: "https://clunoid.com/pricing" },
        { "@type": "Offer", name: "Max", price: "30", priceCurrency: "USD", url: "https://clunoid.com/pricing" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: PRICING_FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function PricingPage() {
  return (
    <main className="stage-bg min-h-[100dvh]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      {/* SEO heading — visually hidden so the existing tier-card design is unchanged. */}
      <h1 className="sr-only">Clunoid pricing and credits — Free, Pro and Max plans</h1>

      <PricingTiers />

      {/* Pricing FAQ (crawlable + FAQPage structured data above) */}
      <section className="border-t border-border/60">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="font-serif text-3xl text-ink">Pricing FAQ</h2>
          <dl className="mt-8 space-y-6">
            {PRICING_FAQ.map((f, i) => (
              <div key={i} className="border-b border-border/50 pb-6">
                <dt className="font-semibold text-ink">{f.q}</dt>
                <dd className="mt-2 text-ink-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
