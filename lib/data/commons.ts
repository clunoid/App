/**
 * Wikimedia Commons image search — free, no key, hotlink-safe (upload.wikimedia.org).
 * A reliable fallback so we can almost always find a real image rather than
 * showing a placeholder.
 */
const UA = "Clunoid/1.0 (https://github.com/clunoid/clunoid)";

export async function commonsImage(query: string): Promise<string | null> {
  if (!query.trim()) return null;
  try {
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json" +
      "&generator=search&gsrnamespace=6&gsrlimit=3" +
      `&gsrsearch=${encodeURIComponent(query + " -filetype:svg")}` +
      "&prop=imageinfo&iiprop=url|mime&iiurlwidth=1280";
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      query?: {
        pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string; mime?: string }[] }>;
      };
    };
    const pages = d.query?.pages;
    if (!pages) return null;
    for (const p of Object.values(pages)) {
      const info = p.imageinfo?.[0];
      if (info && (info.mime?.startsWith("image/") ?? true)) {
        const u = info.thumburl || info.url;
        if (u) return u;
      }
    }
    return null;
  } catch {
    return null;
  }
}
