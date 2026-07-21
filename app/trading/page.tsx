import type { Metadata } from "next";
import { TradingLanding } from "@/components/trading/TradingLanding";
import { EXPLAINERS } from "@/lib/trading/knowledge";
import { ldJson } from "@/lib/marketing/content";

/**
 * /trading — CLUNOID TRADING, the public landing / face of the platform.
 *
 * This is the new front door: when the app is in trading mode (the default),
 * middleware rewrites `/` here and hides the classic Clunoid features from
 * non-admins, so clunoid.com presents as a serious trading platform. Admins get
 * a toggle back to classic Clunoid (which sets a cookie middleware reads).
 * Broker-agnostic by design; live execution is wired in later steps.
 */
export const metadata: Metadata = {
  // Not the title template: this is the front door, so it carries the full name.
  title: {
    absolute: "Free automated trading bots for MT5 and Deriv · Clunoid Trading",
  },
  description:
    "Free, fully automated trading bots that execute for you. AI Expert Advisors for MetaTrader 5 and browser bots for Deriv — forex, gold, crypto, stock indices and synthetic indices, running on your own account, around the clock.",
  // `/` is a middleware REWRITE of this page, so both URLs serve it. Naming
  // /trading here consolidates them onto one canonical.
  alternates: { canonical: "/trading" },
  openGraph: {
    type: "website",
    url: "https://www.clunoid.com/trading",
    title: "Free automated trading bots for MT5 and Deriv · Clunoid Trading",
    description:
      "AI trading bots that analyse the market, size every position to your balance and place the trades on your own broker account.",
  },
};

/**
 * FAQ structured data, built from the same explainers the page renders — so the
 * markup can never claim an answer the page does not show. These are the
 * questions people type verbatim, which is what makes them worth marking up.
 */
const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: EXPLAINERS.map((e) => ({
    "@type": "Question",
    name: e.q,
    acceptedAnswer: { "@type": "Answer", text: e.a },
  })),
};

export default function TradingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(FAQ_LD) }} />
      <TradingLanding />
    </>
  );
}
