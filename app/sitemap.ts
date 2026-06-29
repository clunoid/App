import type { MetadataRoute } from "next";

// Public, indexable pages. The app itself (home, games, stats, settings) lives
// behind sign-in and isn't listed.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://clunoid.com", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://clunoid.com/pricing", lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];
}
