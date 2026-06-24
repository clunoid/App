import type { MetadataRoute } from "next";

// Let every search engine crawl the site, and point them at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://clunoid.com/sitemap.xml",
    host: "https://clunoid.com",
  };
}
