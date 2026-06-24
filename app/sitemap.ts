import type { MetadataRoute } from "next";

// The public landing page. (The app itself lives behind sign-in and isn't indexed.)
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://clunoid.com", lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
