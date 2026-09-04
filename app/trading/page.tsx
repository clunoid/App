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
  /* The brand comes FIRST. Somebody typing "clunoid" into a search box is
     looking for this company by name, and a title that opens with four generic
     trading words gives the engine nothing to match that name against. It cost
     us the brand query: Bing was answering "clunoid" with /trading/deriv/mt5
     rather than the front door. Every keyword that was here still is, just
     behind the name instead of in front of it. */
  title: {
    absolute: "Clunoid Trading — free automated trading bots for MT5 and Deriv",
  },
  /* 149 characters. It was 226, and Bing Webmaster Tools reports anything much
     past 160 as "Meta Description too long or too short" — the tail is never
     shown, and a snippet cut off mid-list is a worse advert than a short one
     that finishes. The markets it dropped are still named in the Open Graph
     description and all over the page itself. */
  description:
    "Free, fully automated trading bots that execute for you: AI Expert Advisors for MetaTrader 5 and browser bots for Deriv, running on your own account.",
  /* `/` is a middleware REWRITE of this page, so both URLs serve it and one of
     them has to be named as the original. That used to be /trading, which meant
     clunoid.com itself was never the indexed address — the domain root, the one
     people type and link to and the one that carries the most weight, was
     pointing its authority at a sub-path. The root is the canonical now, the
     way magicbotslab.com's is. /trading keeps working and simply defers to it. */
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://www.clunoid.com/",
    title: "Clunoid Trading — free automated trading bots for MT5 and Deriv",
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

/**
 * WHO THIS IS, in the form a search engine reads.
 *
 * The page had FAQ markup and nothing else, which describes what we answer but
 * never says who we are. This is the piece that ties the word "clunoid" to this
 * domain: a name, the spellings people actually type, and the URL that name
 * belongs to. Without it an engine has only the prose to go on, and "clunoid"
 * looks enough like "clinoid" — a bone in the skull — that Bing offers to
 * correct it.
 *
 * `url` is the root on both, because the root is what the name should resolve
 * to.
 */
const SITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Clunoid Trading",
  alternateName: ["Clunoid", "Clunoid.com", "Clunoid Bots", "Clunoid Trading Bots"],
  url: "https://www.clunoid.com/",
  description:
    "Free, fully automated trading bots for MetaTrader 5 and Deriv — forex, gold, crypto, stock indices and synthetic indices, running on your own account.",
  publisher: {
    "@type": "Organization",
    name: "Clunoid Trading",
    url: "https://www.clunoid.com/",
    logo: { "@type": "ImageObject", url: "https://www.clunoid.com/icons/icon-512.png" },
  },
};

const ORG_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Clunoid Trading",
  alternateName: ["Clunoid", "Clunoid.com", "Clunoid Bots"],
  url: "https://www.clunoid.com/",
  logo: "https://www.clunoid.com/icons/icon-512.png",
  sameAs: ["https://www.youtube.com/@Clunoidapp"],
};

export default function TradingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(SITE_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ORG_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(FAQ_LD) }} />
      <TradingLanding />
    </>
  );
}
