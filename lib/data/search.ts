/**
 * Live web search via Tavily — gives Isaac up-to-the-minute knowledge (news,
 * current events, sports, prices, anything recent) that Wikipedia/Wikidata
 * can't. Free tier ~1000 searches/month; gated on TAVILY_API_KEY so the app
 * still runs without it (falling back to Wikipedia/Wikidata).
 */
export type WebSearch = {
  answer?: string;
  results: { title: string; url: string; content: string }[];
};

export const hasSearch = () => !!process.env.TAVILY_API_KEY;

/**
 * Find a representative image for an entity via Tavily image search — used when
 * Wikipedia has none (e.g. company logos, which Wikipedia's API omits as
 * non-free). Returns the first image URL.
 */
// Domains that block hotlinking (broken images) — skip these.
const BLOCKED_IMG = /lookaside|fbsbx|fbcdn|instagram|cdninstagram|licdn\.com/i;

export async function imageSearch(query: string): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        include_images: true,
        max_results: 6,
      }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { images?: (string | { url?: string })[] };
    for (const it of d.images ?? []) {
      const u = typeof it === "string" ? it : it?.url;
      if (u && !BLOCKED_IMG.test(u)) return u; // first hotlink-safe image (full resolution)
    }
    return null;
  } catch {
    return null;
  }
}

export async function webSearch(query: string, opts?: { depth?: "basic" | "advanced"; maxResults?: number }): Promise<WebSearch | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: opts?.depth ?? "basic", // "advanced" pulls richer content (real figures) at a higher cost
        include_answer: true,
        max_results: opts?.maxResults ?? 5,
      }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      answer?: string;
      results?: { title?: string; url?: string; content?: string }[];
    };
    return {
      answer: d.answer,
      results: (d.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        content: r.content ?? "",
      })),
    };
  } catch {
    return null;
  }
}
