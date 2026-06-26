"use client";

/**
 * Resolve topic-appropriate media for a race: COUNTRY → flag (flagcdn), COMPANY →
 * logo, PERSON → photo (both via Wikipedia's search+thumbnail API). All sources are
 * CORS-enabled (Access-Control-Allow-Origin: *), so the canvas never taints and the
 * video export keeps working. Runs in the browser before play/export.
 */
import { flagUrlForName } from "./flags";
import type { EntityKind, RaceData } from "./types";

const cache = new Map<string, string | null>();

/** Wikipedia: best-matching article's thumbnail (logo for companies, photo for people). */
async function wikiThumb(name: string, kind: EntityKind): Promise<string | null> {
  const q = kind === "company" ? `${name} company` : name;
  const key = `${kind}:${name}`;
  if (cache.has(key)) return cache.get(key)!;
  let url: string | null = null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=400&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(q)}`
    );
    if (res.ok) {
      const d = (await res.json()) as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } };
      const pages = d.query?.pages ? Object.values(d.query.pages) : [];
      url = pages[0]?.thumbnail?.source || null;
    }
  } catch {
    url = null;
  }
  cache.set(key, url);
  return url;
}

/** One entity → its media URL. Countries use flags; everything else uses Wikipedia. */
async function resolveOne(name: string, kind: EntityKind): Promise<string | null> {
  if (kind === "country") return flagUrlForName(name);
  return (await wikiThumb(name, kind)) || flagUrlForName(name);
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
