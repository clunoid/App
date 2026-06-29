import type { MetadataRoute } from "next";
import { ALL_PAGES } from "@/lib/marketing/content";

const BASE = "https://www.clunoid.com";

// Public, indexable pages. The app itself (home, games, stats, settings) lives
// behind sign-in and isn't listed.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...ALL_PAGES.map((p) => ({
      url: `${BASE}/${p.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      // Feature pages are the money pages; resources slightly lower.
      priority: p.category === "resource" ? 0.6 : 0.8,
    })),
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];
}
