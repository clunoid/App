/**
 * Wikidata lookups for *current* structured facts that Wikipedia prose doesn't
 * reliably state — chiefly "who currently leads country X" (president / PM /
 * monarch). This keeps Isaac from naming an out-of-date leader from stale
 * training data. We resolve via the country's head-of-state (P35) /
 * head-of-government (P6), which Wikidata keeps current. Free, no key.
 */
const UA = "Clunoid/1.0 (https://github.com/clunoid/clunoid)";
const API = "https://www.wikidata.org/w/api.php";

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
  if (!res.ok) throw new Error(`wikidata ${res.status}`);
  return res.json();
}

async function findEntity(query: string): Promise<string | null> {
  const url = `${API}?action=wbsearchentities&search=${encodeURIComponent(
    query
  )}&language=en&type=item&limit=1&format=json`;
  const d = (await getJson(url)) as { search?: { id?: string }[] };
  return d.search?.[0]?.id ?? null;
}

async function nameOf(entityId: string): Promise<string | null> {
  const url = `${API}?action=wbgetentities&ids=${entityId}&props=labels|sitelinks&format=json`;
  const d = (await getJson(url)) as {
    entities?: Record<
      string,
      { labels?: { en?: { value?: string } }; sitelinks?: { enwiki?: { title?: string } } }
    >;
  };
  const e = d.entities?.[entityId];
  // The enwiki sitelink title is the most reliable display name (and the exact
  // Wikipedia title for fetching a bio + photo).
  return e?.sitelinks?.enwiki?.title ?? e?.labels?.en?.value ?? null;
}

type Claim = {
  mainsnak?: { datavalue?: { value?: { id?: string } } };
  qualifiers?: { P580?: { datavalue?: { value?: { time?: string } } }[]; P582?: unknown[] };
};

/** Resolve the current holder (no end-date qualifier; latest start) of a property. */
async function currentHolder(entityId: string, property: "P35" | "P6"): Promise<string | null> {
  const url = `${API}?action=wbgetclaims&entity=${entityId}&property=${property}&format=json`;
  const d = (await getJson(url)) as { claims?: Record<string, Claim[]> };
  const claims = d.claims?.[property] ?? [];
  if (!claims.length) return null;
  const current = claims
    .filter((c) => !c.qualifiers?.P582)
    .sort((a, b) => {
      const ta = a.qualifiers?.P580?.[0]?.datavalue?.value?.time ?? "";
      const tb = b.qualifiers?.P580?.[0]?.datavalue?.value?.time ?? "";
      return tb.localeCompare(ta);
    });
  const id = (current[0] ?? claims[claims.length - 1])?.mainsnak?.datavalue?.value?.id;
  return id ? nameOf(id) : null;
}

const ALIASES: Record<string, string> = {
  us: "United States",
  usa: "United States",
  america: "United States",
  uk: "United Kingdom",
  britain: "United Kingdom",
  uae: "United Arab Emirates",
};

/** Strip role/filler words from a question to isolate the country/place. */
function placeFrom(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[?.!,]/g, " ")
    .replace(
      /\b(who|whos|whats|what|is|are|the|current|currently|now|today|right|these|days|leader|of|in|for|president|prime|minister|pm|premier|chancellor|king|queen|monarch|emperor|pope|head|state|government|ceo|chairman|governor|mayor|a|an|s)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[cleaned] ?? cleaned;
}

/**
 * Name of the current leader of a country.
 * role "state" → head of state (president/monarch); "gov" → head of government (PM).
 */
export async function currentLeader(query: string, role: "state" | "gov"): Promise<string | null> {
  try {
    const property = role === "gov" ? "P6" : "P35";
    const candidates = [...new Set([placeFrom(query), query].filter(Boolean))];
    for (const cand of candidates) {
      const qid = await findEntity(cand);
      if (!qid) continue;
      const name = await currentHolder(qid, property);
      if (name) return name;
    }
    return null;
  } catch {
    return null;
  }
}
