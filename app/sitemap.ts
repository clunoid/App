import type { MetadataRoute } from "next";
import { MT5_BOTS } from "@/lib/deriv/mt5/registry";
import { BOTS as DERIV_BOTS } from "@/lib/deriv/bots/registry";

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
 * `/` is deliberately absent: middleware REWRITES it to this same landing, so
 * listing both would submit one page under two URLs. /trading is the canonical
 * (see the canonical tag in app/trading/page.tsx) and `/` points at it.
 *
 * /trading/deriv is absent too — it is a redirect stub, not a page.
 *
 * Bot URLs are generated from the registries, so adding a bot adds its URL here
 * automatically and this file can never drift out of date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // The hub — carries the trading knowledge and the topic index.
    { url: `${BASE}/trading`, lastModified: now, changeFrequency: "weekly", priority: 1 },

    // Bot catalogues — the two entry points people search for by name.
    { url: `${BASE}/trading/deriv/mt5`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/trading/deriv/bots`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },

    // Every individual bot: each now has its own title, description and content.
    ...MT5_BOTS.map((b) => ({
      url: `${BASE}/trading/deriv/mt5/${b.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...DERIV_BOTS.map((b) => ({
      url: `${BASE}/trading/deriv/bots/${b.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),

    // The account hub — useful, but a tool rather than something people search.
    { url: `${BASE}/trading/command`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
