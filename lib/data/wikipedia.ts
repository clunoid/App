/**
 * Free, current factual lookups + images from Wikipedia. Used to keep Isaac
 * accurate and up to date (his training data goes stale), and to show a related
 * picture alongside what he's talking about.
 */
export type WikiResult = {
  title: string;
  extract: string;
  imageUrl?: string;
  url?: string;
};

const UA = "Clunoid/1.0 (https://github.com/clunoid/clunoid)";

async function summary(title: string): Promise<WikiResult | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { accept: "application/json", "user-agent": UA } }
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      type?: string;
      title?: string;
      extract?: string;
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    if (!d.extract || d.type === "disambiguation") return null;
    return {
      title: d.title ?? title,
      extract: d.extract,
      imageUrl: d.originalimage?.source ?? d.thumbnail?.source,
      url: d.content_urls?.desktop?.page,
    };
  } catch {
    return null;
  }
}

/** Search Wikipedia for the best-matching page, then return its summary. */
export async function fetchWiki(query: string): Promise<WikiResult | null> {
  const q = query.trim();
  if (!q) return null;

  // Try a direct summary first (fast path for clean entity names).
  const direct = await summary(q);
  if (direct) return direct;

  // Otherwise search for the best page title, then summarise it.
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        q
      )}&srlimit=1&format=json`,
      { headers: { accept: "application/json", "user-agent": UA } }
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { query?: { search?: { title?: string }[] } };
    const top = d.query?.search?.[0]?.title;
    return top ? summary(top) : null;
  } catch {
    return null;
  }
}
