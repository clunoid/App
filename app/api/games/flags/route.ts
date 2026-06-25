import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic, hasGroq } from "@/lib/models";
import { WORLD_ORDER, WORLD_ALIASES } from "@/lib/games/world";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Isaac's brain builds the flag game. Two modes:
 *  - default: the LLM picks real countries dynamically for ANY natural request,
 *    validated against the authoritative flagcdn name list, then ORDERED
 *    easy → medium → hard.
 *  - { all: true }: skip the LLM and return EVERY sovereign country, easiest →
 *    hardest (WORLD_ORDER). Used by "Continue".
 * Country names come from flagcdn (so every code has a real, loadable flag).
 */

type Difficulty = "easy" | "medium" | "hard";
type RoundOut = { code: string; name: string; aliases: string[]; difficulty: Difficulty; flag: string };

const genSchema = z.object({
  title: z.string().describe("A short, fun title, e.g. 'World Flags', 'Hard Mode', 'European Flags'."),
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
        name: z.string().describe("The country's common English name (e.g. 'France')."),
        aliases: z.array(z.string()).default([]).describe("Accepted alternative names/spellings/abbreviations."),
        difficulty: z.enum(["easy", "medium", "hard"]).describe("How globally recognizable the flag is."),
      })
    )
    .min(1)
    .max(40),
});

// Authoritative code → name from flagcdn (every code here has a real flag).
let cache: Map<string, string> | null = null;
let cacheAt = 0;
const DAY = 24 * 60 * 60 * 1000;

const uniq = (arr: (string | undefined)[]) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && x.trim().length > 1)));
const flagUrl = (code: string) => `https://flagcdn.com/${code}.svg`;

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

const SYSTEM = `You are setting up a "guess the country by its flag" game. Build the rounds based ENTIRELY on the user's request — honour any continent/region, specific countries, difficulty, theme, number of rounds, "random", or custom set they ask for. If they don't specify, use 12 rounds with a good SPREAD of difficulties (a few easy, a few medium, a few hard) using a varied, randomized selection of countries.
Rules:
- Use ONLY real countries/territories that have a flag, with correct ISO 3166-1 alpha-2 codes — accuracy is essential (the code MUST match the country).
- 'easy' = globally famous flags (e.g. us, fr, jp, br); 'hard' = obscure ones.
- Give each country's common English name + a few accepted aliases (short names, common spellings, abbreviations).
- No duplicate countries. If the user specifies a number of rounds, produce EXACTLY that many; otherwise 12 (hard cap 40).`;

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

  if (!hasGroq() && !hasAnthropic()) return NextResponse.json({ title: "Flags", rounds: [] });

  const model = hasAnthropic() ? MODELS.genius() : MODELS.fast();
  let object: z.infer<typeof genSchema>;
  try {
    ({ object } = await generateObject({
      model,
      schema: genSchema,
      system: SYSTEM,
      prompt: body.request?.trim() || "A varied mix of 12 flags, a spread of easy/medium/hard.",
      temperature: 0.8, // more variety in which countries get picked each play

      maxRetries: 1,
    }));
  } catch {
    return NextResponse.json({ title: "Flags", rounds: [] });
  }

  const rounds: RoundOut[] = [];
  const seen = new Set<string>();
  for (const r of object.rounds) {
    const code = (r.code || "").toLowerCase().trim();
    if (!/^[a-z]{2}$/.test(code) || seen.has(code)) continue;
    // Drop codes that don't have a real flag (so every round's flag loads).
    if (names.size > 0 && !names.has(code)) continue;
    seen.add(code);
    const name = names.get(code) || r.name || code.toUpperCase();
    rounds.push({
      code,
      name,
      aliases: uniq([name, r.name, ...(r.aliases || []), ...(WORLD_ALIASES[code] || [])]),
      difficulty: r.difficulty,
      flag: flagUrl(code),
    });
  }

  return NextResponse.json({
    title: object.title || "Flags",
    secondsPerRound: object.secondsPerRound ?? 7,
    // Difficulty ramp, but randomized within each tier (different every play).
    rounds: orderByTier(rounds),
  });
}
