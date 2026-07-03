/**
 * MENTION RESOLUTION (server) — turns the planner's documentary cutaways
 * ("when the narration says 'Julius Caesar', SHOW Julius Caesar") into
 * renderable data:
 *   1. anchor → atWord: locate the anchor phrase inside the scene's narration
 *      and record the WORD INDEX, so the engine can fire the cutaway at the
 *      exact spoken moment (caption words carry per-word timestamps).
 *   2. term/query → imageUrl: people/places/orgs resolve through Wikipedia
 *      (CORS-safe upload.wikimedia.org thumbnails — the proven Stat Battle
 *      pipeline); things/events prefer Pexels photography; Tavily image search
 *      is the last resort. A miss just skips the cutaway — never a placeholder.
 */
import { pexelsPhotos, hasPexels } from "@/lib/data/pexels";
import { imageSearch, hasSearch } from "@/lib/data/search";
import type { MotionScene, MotionMention } from "./spec";

const UA = "Clunoid/1.0 (https://www.clunoid.com)";

/** Tokenize exactly like the caption pipeline (audio.ts wordsFrom): split on whitespace. */
const tokenize = (s: string) => s.split(/\s+/).filter(Boolean);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Word index where `anchor` starts inside `narration`, or a proportional guess. */
export function anchorWordIndex(narration: string, anchor: string, ordinal: number, total: number): number {
  const words = tokenize(narration);
  const aWords = tokenize(anchor).map(norm).filter(Boolean);
  if (words.length === 0) return 0;
  if (aWords.length) {
    const nWords = words.map(norm);
    for (let i = 0; i <= nWords.length - aWords.length; i++) {
      let ok = true;
      for (let j = 0; j < aWords.length; j++) {
        if (nWords[i + j] !== aWords[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    // partial fallback: first word of the anchor anywhere
    const first = nWords.indexOf(aWords[0]);
    if (first >= 0) return first;
  }
  // even spread by mention order — still feels timed, never front-loaded
  return Math.min(words.length - 1, Math.round(((ordinal + 1) / (total + 1)) * words.length));
}

/** Wikipedia best-match lead thumbnail (CORS-safe), sized for a hero cutaway. */
async function wikiThumb(query: string, px = 800): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=${px}&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(query)}`,
      { headers: { accept: "application/json", "user-agent": UA } }
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } };
    const pages = d.query?.pages ? Object.values(d.query.pages) : [];
    return pages[0]?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

/** One mention → its best image URL (or null: the cutaway is silently skipped). */
async function resolveOne(m: MotionMention): Promise<string | null> {
  const personish = m.kind === "person" || m.kind === "place" || m.kind === "org";
  if (personish) {
    // named entities: an encyclopedic photo beats stock (stock has no Caesars)
    const wiki = (await wikiThumb(m.term)) || (m.query !== m.term ? await wikiThumb(m.query) : null);
    if (wiki) return wiki;
    if (hasPexels()) {
      const p = await pexelsPhotos(m.query, 1);
      if (p[0]) return p[0];
    }
  } else {
    // concrete things/events: real photography first, encyclopedia second
    if (hasPexels()) {
      const p = await pexelsPhotos(m.query, 1);
      if (p[0]) return p[0];
    }
    const wiki = await wikiThumb(m.term);
    if (wiki) return wiki;
  }
  // last resort — may not be CORS-safe; the client probe simply skips it then
  if (hasSearch()) return imageSearch(m.query);
  return null;
}

/**
 * Resolve every scene's mentions in place: compute atWord, fill imageUrl,
 * drop unresolvable ones. Deduped by term (the same person mentioned in five
 * scenes resolves once and shows the SAME picture — continuity, like a real
 * documentary), bounded concurrency, hard total cap to protect render memory.
 */
export async function resolveMentions(scenes: MotionScene[], maxTotal: number): Promise<void> {
  type Slot = { m: MotionMention; scene: MotionScene };
  const slots: Slot[] = [];
  let total = 0;
  for (const scene of scenes) {
    if (!scene.mentions?.length) continue;
    scene.mentions = scene.mentions.slice(0, 3);
    scene.mentions.forEach((m, i) => {
      m.imageUrl = undefined; // only the server may set media URLs
      m.atWord = anchorWordIndex(scene.narration, m.anchor || m.term, i, scene.mentions!.length);
    });
    const room = Math.max(0, maxTotal - total);
    if (scene.mentions.length > room) scene.mentions = scene.mentions.slice(0, room);
    total += scene.mentions.length;
    for (const m of scene.mentions) slots.push({ m, scene });
  }
  if (!slots.length) return;

  // one lookup per unique term — repeated mentions share the same image
  const byTerm = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = `${s.m.kind}:${s.m.term.toLowerCase().trim()}`;
    byTerm.set(k, [...(byTerm.get(k) || []), s]);
  }
  const jobs = [...byTerm.values()].map((group) => async () => {
    const url = await resolveOne(group[0].m).catch(() => null);
    for (const s of group) s.m.imageUrl = url || undefined;
  });
  const CONC = 6;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, worker));

  // an unresolvable mention is dropped — the engine never shows an empty frame
  for (const scene of scenes) {
    if (scene.mentions?.length) scene.mentions = scene.mentions.filter((m) => !!m.imageUrl);
  }
}
