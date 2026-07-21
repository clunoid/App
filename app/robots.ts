import type { MetadataRoute } from "next";

/**
 * ROBOTS — pointed at the trading platform.
 *
 * robots.txt must be served from the domain root (crawlers only ever fetch
 * /robots.txt), so this file stays here even though everything it advertises
 * lives under /trading. Same for /sitemap.xml — both are excluded from the
 * middleware matcher, so trading mode never rewrites them.
 *
 * Nothing public is disallowed: `/` rewrites to the trading landing and the
 * classic pages redirect there, so a crawler that wanders off /trading is sent
 * back rather than shown something we would rather hide. The disallow list only
 * covers surfaces with no search value — account settings and the admin-only
 * tools — which keeps the crawl budget on the pages that matter.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/settings",
        "/career", // admin-only
        "/tdesk", // admin-only
        "/vlab", // admin-only
        "/showtime", // admin-only
      ],
    },
    sitemap: "https://www.clunoid.com/sitemap.xml",
    host: "https://www.clunoid.com",
  };
}
