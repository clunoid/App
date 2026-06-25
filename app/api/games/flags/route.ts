import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic, hasGroq } from "@/lib/models";
import { WORLD_ORDER, WORLD_ALIASES } from "@/lib/games/world";

export const runtime = "nodejs";
export const maxDuration = 30;

// Size of a default/general/worldwide game — a varied spread sampled fresh from
// ALL world countries each play (replaces the old hardcoded ~12).
const DEFAULT_SPREAD = 12;

/**
 * Isaac's brain builds the flag game. The LLM CLASSIFIES every natural request:
 *  - "category": a specific set/region/theme/property (e.g. "islands", "African
 *    flags", "Arab countries", "Kenya's neighbours", "Christian-majority"). The
 *    LLM returns the COMPLETE list of matching countries (no cap), plus a brief
 *    subtitle. Validated against the authoritative flagcdn name list.
 *  - "general": a vague worldwide/random mix with no specific category. Expanded
 *    SERVER-SIDE into a shuffled difficulty-spread drawn from ALL world countries
 *    (different every play — never the same hardcoded list).
 *  - "all": every country in the world → the full WORLD_ORDER list (same as the
 *    { all: true } "Continue" path).
 * Country names come from flagcdn (so every code has a real, loadable flag).
 */

type Difficulty = "easy" | "medium" | "hard";
type RoundOut = { code: string; name: string; aliases: string[]; difficulty: Difficulty; flag: string };

const genSchema = z.object({
  title: z.string().describe("A short, fun title, e.g. 'World Flags', 'African Flags', 'Island Nations'."),
  subtitle: z
    .string()
    .optional()
    .describe(
      "A brief 2-4 word label naming the category exactly as searched, e.g. 'Arab countries flags', 'Island nations', \"Kenya's neighbours\". ONLY for a specific category; OMIT for a general worldwide/random or all-countries game."
    ),
  mode: z
    .enum(["category", "general", "all"])
    .describe(
      "'category' = a specific named set/region/continent/theme/property; 'general' = a vague worldwide/random mix with no specific category; 'all' = every country in the world."
    ),
  secondsPerRound: z
    .number()
    .int()
    .min(2)
    .max(60)
    .optional()
    .describe("Seconds per round, ONLY if the user asked for a specific pace; otherwise omit."),
  rounds: z
    .array(
      z.object({
        code: z.string().describe("ISO 3166-1 alpha-2 country code, lowercase (e.g. 'fr', 'jp', 'br')."),
        difficulty: z.enum(["easy", "medium", "hard"]).describe("How globally recognizable the flag is: easy=famous, hard=obscure."),
      })
    )
    .min(1)
    .max(250)
    .describe(
      "For 'category': EVERY real country/territory that matches (the COMPLETE list, do not cap), or EXACTLY the number of rounds the user asked for. For 'general' or 'all': just a few sample rounds — the server expands these from the full world list. Return ONLY the code + difficulty for each (the server supplies official names)."
    ),
});

// Authoritative code → name from flagcdn (every code here has a real flag).
let cache: Map<string, string> | null = null;
let cacheAt = 0;
const DAY = 24 * 60 * 60 * 1000;

const uniq = (arr: (string | undefined)[]) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && x.trim().length > 1)));
// PNG (not SVG): flagcdn SVGs are inconsistent — some omit width/height and only
// carry a viewBox, which renders as a tiny "dot" in an <img>. The PNG always has
// real pixel dimensions, so every flag displays at full size. w1280 is crisp.
const flagUrl = (code: string) => `https://flagcdn.com/w1280/${code}.png`;

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Keep the difficulty RAMP (all easy, then medium, then hard) but SHUFFLE the
 * countries WITHIN each tier — so every play has a different sequence and you
 * can't memorize "round 1 is the USA"; you have to actually know the flag.
 */
function orderByTier(rounds: RoundOut[]): RoundOut[] {
  const t: Record<Difficulty, RoundOut[]> = { easy: [], medium: [], hard: [] };
  for (const r of rounds) t[r.difficulty].push(r);
  return [...shuffle(t.easy), ...shuffle(t.medium), ...shuffle(t.hard)];
}

async function loadFlagNames(): Promise<Map<string, string>> {
  if (cache && Date.now() - cacheAt < DAY) return cache;
  try {
    const res = await fetch("https://flagcdn.com/en/codes.json", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("flagcdn codes failed");
    const data = (await res.json()) as Record<string, string>;
    const m = new Map<string, string>();
    for (const [code, name] of Object.entries(data)) {
      if (/^[a-z]{2}$/.test(code) && name) m.set(code, name);
    }
    if (m.size) {
      cache = m;
      cacheAt = Date.now();
    }
    return cache || m;
  } catch {
    return cache || new Map();
  }
}

/** Every sovereign country, easiest → hardest. */
function buildAllCountries(names: Map<string, string>): RoundOut[] {
  const present = WORLD_ORDER.filter((c) => names.size === 0 || names.has(c));
  const n = present.length;
  return present.map((code, i) => {
    const name = names.get(code) || code.toUpperCase();
    return {
      code,
      name,
      aliases: uniq([name, ...(WORLD_ALIASES[code] || [])]),
      difficulty: (i < n * 0.23 ? "easy" : i < n * 0.58 ? "medium" : "hard") as Difficulty,
      flag: flagUrl(code),
    };
  });
}

/**
 * A varied difficulty-spread of `n` flags drawn RANDOMLY from ALL world
 * countries (different every play) — used for general/worldwide requests so the
 * default game is never the same hardcoded ~12. Keeps the easy → medium → hard
 * ramp via orderByTier.
 */
function worldSpread(names: Map<string, string>, n: number): RoundOut[] {
  const all = buildAllCountries(names);
  const per = Math.ceil(n / 3);
  const pick = (d: Difficulty) => shuffle(all.filter((r) => r.difficulty === d)).slice(0, per);
  return orderByTier([...pick("easy"), ...pick("medium"), ...pick("hard")].slice(0, n));
}

const SYSTEM = `You are setting up a "guess the country by its flag" game. Read the user's request and decide the MODE:

- "category": the request names a SPECIFIC set — a region, continent, theme, or property (examples: "islands", "African flags", "Arab countries", "Middle East countries", "Kenya's neighbours", "Christian-majority countries", "Scandinavian flags", "hard European flags"). For a category you MUST list EVERY real country/territory that matches — the COMPLETE, EXHAUSTIVE set, with NONE missing and NONE that don't belong. Do NOT cap or sample the list. The ONLY exception: if the user explicitly asks for a number of rounds, return EXACTLY that many, chosen to span easy/medium/hard. Always set a brief 2-4 word "subtitle" naming the category as the user framed it (e.g. "Arab countries flags", "Island nations").

- "general": the request is a vague worldwide / random / mixed game with NO specific category (examples: "random", "a mix", "world flags", "surprise me", or empty). Return just a FEW sample rounds — the server expands them into a full worldwide spread. OMIT the subtitle.

- "all": the user wants every country / all the flags in the world. Return just a few sample rounds — the server expands to the full world list. OMIT the subtitle.

Rules:
- Use ONLY real countries/territories that have a flag, with correct ISO 3166-1 alpha-2 codes — accuracy is essential (the code MUST match the country). Include dependent territories when they genuinely fit the category (e.g. island territories for "islands").
- For a category, be EXHAUSTIVE and ACCURATE: include every member of the set.
- For each round return ONLY the lowercase ISO code and a difficulty ('easy' = globally famous flags like us/fr/jp/br; 'medium' = moderately known; 'hard' = obscure). The server fills in the official country name.
- No duplicate countries.`;

export async function POST(req: NextRequest) {
  let body: { request?: string; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const names = await loadFlagNames();

  // ── "All countries" mode (Continue) — every country, shuffled within tiers ─
  if (body.all) {
    return NextResponse.json({ title: "All Countries", secondsPerRound: 8, rounds: orderByTier(buildAllCountries(names)) });
  }

  const request = (body.request || "").trim();

  // Empty request → a fresh, varied worldwide spread (no LLM needed).
  if (!request) {
    return NextResponse.json({ title: "World Flags", secondsPerRound: 7, rounds: worldSpread(names, DEFAULT_SPREAD) });
  }

  if (!hasGroq() && !hasAnthropic()) {
    return NextResponse.json({ title: "World Flags", secondsPerRound: 7, rounds: worldSpread(names, DEFAULT_SPREAD) });
  }

  const model = hasAnthropic() ? MODELS.genius() : MODELS.fast();
  let object: z.infer<typeof genSchema> | null = null;
  try {
    ({ object } = await generateObject({
      model,
      schema: genSchema,
      system: SYSTEM,
      prompt: request,
      temperature: 0.4, // lower temp → accurate, complete category lists
      maxRetries: 2,
    }));
  } catch {
    /* fall through to the dataset fallback below */
  }

  // "all" / "general" → expand SERVER-SIDE from the full world list, shuffled,
  // so the result is complete (all) or varied every play (general).
  if (object?.mode === "all") {
    return NextResponse.json({ title: object.title || "All Countries", secondsPerRound: object.secondsPerRound ?? 8, rounds: orderByTier(buildAllCountries(names)) });
  }
  if (object?.mode === "general") {
    return NextResponse.json({ title: object.title || "World Flags", secondsPerRound: object.secondsPerRound ?? 7, rounds: worldSpread(names, DEFAULT_SPREAD) });
  }

  // "category" → use the model's COMPLETE list, validated against flagcdn.
  const rounds: RoundOut[] = [];
  const seen = new Set<string>();
  for (const r of object?.rounds || []) {
    const code = (r.code || "").toLowerCase().trim();
    if (!/^[a-z]{2}$/.test(code) || seen.has(code)) continue;
    // Drop codes that don't have a real flag (so every round's flag loads).
    if (names.size > 0 && !names.has(code)) continue;
    seen.add(code);
    const name = names.get(code) || code.toUpperCase();
    rounds.push({
      code,
      name,
      aliases: uniq([name, ...(WORLD_ALIASES[code] || [])]),
      difficulty: r.difficulty,
      flag: flagUrl(code),
    });
  }

  // If the LLM hiccupped (rate limit / transient / empty), still hand back a
  // playable game: a fresh worldwide spread from the dataset.
  if (!rounds.length) {
    return NextResponse.json({ title: "World Flags", secondsPerRound: 7, rounds: worldSpread(names, DEFAULT_SPREAD) });
  }

  return NextResponse.json({
    title: object?.title || "Flags",
    subtitle: object?.subtitle?.trim() || undefined,
    secondsPerRound: object?.secondsPerRound ?? 7,
    // Difficulty ramp, but randomized within each tier (different every play).
    rounds: orderByTier(rounds),
  });
}
