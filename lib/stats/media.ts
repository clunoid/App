"use client";

/**
 * Resolve topic-appropriate media for a race:
 *   COUNTRY                         → flag (flagcdn)
 *   COMPANY / ORG / WEBSITE / TEAM  → its OFFICIAL LOGO (Wikidata P154 → Wikimedia
 *                                     Commons) when one exists, else the Wikipedia
 *                                     lead image — never a wrong flag.
 *   PERSON                          → photo (Wikipedia thumbnail)
 *
 * Logos make the chart look professional (the user pays for quality), so anything
 * that can have a logo prefers it and only falls back when none is published.
 *
 * All sources are CORS-enabled (Access-Control-Allow-Origin: *), so the canvas
 * never taints and the video export keeps working. Runs in the browser before
 * play/export.
 */
import { flagUrlForName } from "./flags";
import type { EntityKind, RaceData } from "./types";

const cache = new Map<string, string | null>();

type WikiPage = { thumb: string | null; qid: string | null };

/** Wikipedia: the best-matching article's lead thumbnail + its Wikidata id (one call). */
async function wikiPage(name: string, kind: EntityKind): Promise<WikiPage> {
  const q = kind === "company" ? `${name} company` : name;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages%7Cpageprops&piprop=thumbnail&pithumbsize=400&ppprop=wikibase_item&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(q)}`
    );
    if (!res.ok) return { thumb: null, qid: null };
    const d = (await res.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string }; pageprops?: { wikibase_item?: string } }> };
    };
    const pages = d.query?.pages ? Object.values(d.query.pages) : [];
    const p = pages[0];
    return { thumb: p?.thumbnail?.source || null, qid: p?.pageprops?.wikibase_item || null };
  } catch {
    return { thumb: null, qid: null };
  }
}

/** Wikidata: an entity's OFFICIAL logo (property P154) as a CORS-safe Commons URL.
 *  Special:FilePath redirects to the (CORS-enabled) upload.wikimedia.org file, and
 *  ?width rasterizes SVG logos into a crisp PNG the canvas can draw + export. */
async function wikidataLogo(qid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(qid)}&property=P154&format=json&origin=*`
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { claims?: { P154?: { mainsnak?: { datavalue?: { value?: string } } }[] } };
    const file = d.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
    if (!file) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=512`;
  } catch {
    return null;
  }
}

/** One entity → its media URL. Countries → flag; people → photo; everything else
 *  (companies, brands, websites, organizations, teams, leagues) → official logo,
 *  then the lead image. Never falls back to a flag for a non-country. */
async function resolveOne(name: string, kind: EntityKind): Promise<string | null> {
  if (kind === "country") return flagUrlForName(name);
  const key = `${kind}:${name}`;
  if (cache.has(key)) return cache.get(key)!;

  const { thumb, qid } = await wikiPage(name, kind);
  let url: string | null = thumb;
  // Prefer the published logo for anything that isn't a person — only keep the lead
  // image when the entity genuinely has no logo on Wikidata.
  if (kind !== "person" && qid) {
    const logo = await wikidataLogo(qid);
    if (logo) url = logo;
  }
  cache.set(key, url);
  return url;
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const j = i++;
      await fn(items[j]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, worker));
}

/** Fill entity.image (by kind) and event.subjectMedia (by name) for the whole race. */
export async function resolveRaceMedia(race: RaceData): Promise<void> {
  await mapLimit(race.entities, 6, async (e) => {
    if (e.image) return; // already resolved (e.g. a country flag set during normalize)
    const url = await resolveOne(e.name, e.kind || "other");
    if (url) e.image = url;
  });

  // Event "subjects" → the media that best illustrates each beat (a player photo, a logo, a flag).
  const byName = new Map(race.entities.filter((e) => e.image).map((e) => [e.name, e.image!]));
  const want = new Set<string>();
  for (const ev of race.events) for (const s of ev.subjects || []) if (!byName.has(s)) want.add(s);
  if (want.size) {
    await mapLimit([...want], 6, async (n) => {
      const kind = race.entities.find((e) => e.name === n)?.kind || "other";
      const url = await resolveOne(n, kind);
      if (url) byName.set(n, url);
    });
  }
  for (const ev of race.events) {
    ev.subjectMedia = (ev.subjects || []).map((s) => byName.get(s)).filter(Boolean) as string[];
  }
}
