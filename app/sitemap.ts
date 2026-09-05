import type { MetadataRoute } from "next";
import { MT5_BOTS } from "@/lib/deriv/mt5/registry";
import { MT5_AUTOS } from "@/lib/mt5/registry";

const BASE = "https://www.clunoid.com";

/**
 * THE TRADING SITEMAP.
 *
 * Everything public now lives under /trading: middleware serves the trading
 * platform to everyone and REDIRECTS every non-/trading page to /trading, so a
 * sitemap listing classic pages would hand crawlers a pile of redirects and
 * spend the crawl budget on URLs that are no longer destinations. Only /trading
 * URLs belong here.
 *
 * Only ONE of `/` and `/trading` belongs here — middleware rewrites the root to
 * the same landing, so listing both would submit one page under two URLs. It is
 * the ROOT that is listed, because the root is the canonical (see the canonical
 * tag in app/trading/page.tsx) and a sitemap that advertises a URL which defers
 * to another one is asking a crawler to spend its time on the wrong address.
 *
 * It used to be the other way round, and that is how clunoid.com came to be a
 * domain whose own name returned a sub-page.
 *
 * /trading/deriv is absent too — it is a redirect stub, not a page.
 *
 * Bot URLs are generated from the registries, so adding a bot adds its URL here
 * automatically and this file can never drift out of date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // The front door — carries the trading knowledge and the topic index.
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },

    // The MT5 catalogue and every bot in it. These render their full contents
    // to anybody, connected or not, which is what makes them worth submitting.
    { url: `${BASE}/trading/deriv/mt5`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...MT5_BOTS.map((b) => ({
      url: `${BASE}/trading/deriv/mt5/${b.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),

    /* NOT here: /trading/deriv/bots and the ten bots under it.
     *
     * Those bounce anybody without a Deriv connection to the command center,
     * and a crawler is never connected — so what a search engine receives is an
     * empty shell with no heading and none of the bot names. Submitting eleven
     * blank pages does not get them indexed; it spends the crawl budget on
     * nothing and teaches the engine that a third of this site is thin. They
     * are marked noindex on the pages themselves for the same reason.
     *
     * If they should be found by name one day, the fix is to render the
     * catalogue to everyone and gate only the RUNNING of a bot — which is
     * exactly how the MT5 side above already works. */

    // The standalone MetaTrader 5 platform + its available automations.
    { url: `${BASE}/trading/mt5`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...MT5_AUTOS.filter((b) => b.status === "available").map((b) => ({
      url: `${BASE}/trading/mt5/${b.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),

    // The broker and charting pages. Each is a real destination with its own
    // title, description and canonical, and people search for these by name —
    // leaving them out was the sitemap's only gap.
    { url: `${BASE}/trading/exness`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/trading/tradingview`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },

    /* THE WRITTEN PAGES. Guides, not app surfaces — they render their whole
       text to anybody, connected or not, which is the same test the MT5
       catalogue passes and the Deriv bot pages fail. Each one exists because a
       real query cluster had nowhere to land: MT5 downloads, free Deriv bots,
       what "AI trading robot" means, and whether we are a scam. */
    { url: `${BASE}/trading/free-mt5-robot-download`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/trading/free-deriv-bots`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE}/trading/is-clunoid-legit`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/trading/ai-trading-robot`, lastModified: now, changeFrequency: "monthly", priority: 0.75 },

    // The Creator Program — a public landing page people are sent to by name.
    { url: `${BASE}/trading/creators`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },

    /* Deliberately absent, and it should stay that way:
     *
     *   /trading/command — somebody's own accounts and balances. Nobody
     *     searches for it, it is the page every gated route bounces to, and a
     *     "connect your broker account" result is not what a person looking
     *     for trading bots wants to land on. Marked noindex too.
     *
     *   /trading/creators/create and everything under /trading/deriv/bots/sim
     *     — working surfaces, not pages anybody should arrive at from a
     *     search. Already noindex. */
  ];
}
