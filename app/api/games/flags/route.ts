import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic, hasGroq } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Isaac's brain builds the flag game. Given ANY natural request ("hard European
 * flags", "tricky lookalikes", "20 random", "flags of former Soviet states"…),
 * the LLM picks real countries dynamically — nothing is hardcoded. The picks are
 * then validated + enriched server-side against the REST Countries dataset
 * (authoritative names + alternative spellings for grading) and returned with
 * never-cropped flagcdn SVG URLs. This is the ONLY place a flag game is made.
 */

const genSchema = z.object({
  title: z.string().describe("A short, fun title for the set, e.g. 'World Flags', 'Hard Mode', 'European Flags'."),
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

type Info = { name: string; aliases: string[] };
let cache: Map<string, Info> | null = null;
let cacheAt = 0;
const DAY = 24 * 60 * 60 * 1000;

const uniq = (arr: (string | undefined)[]) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && x.trim().length > 1)));

async function loadCountries(): Promise<Map<string, Info>> {
  if (cache && Date.now() - cacheAt < DAY) return cache;
  try {
    const res = await fetch("https://restcountries.com/v3.1/all?fields=cca2,name,altSpellings", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error("rest countries failed");
    const data = (await res.json()) as Array<{
      cca2?: string;
      name?: { common?: string; official?: string };
      altSpellings?: string[];
    }>;
    const m = new Map<string, Info>();
    for (const c of data) {
      const code = (c.cca2 || "").toLowerCase();
      if (!/^[a-z]{2}$/.test(code)) continue;
      const name = c.name?.common || code.toUpperCase();
      m.set(code, { name, aliases: uniq([name, c.name?.official, ...(c.altSpellings || [])]) });
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

const SYSTEM = `You are setting up a "guess the country by its flag" game. Build the rounds based ENTIRELY on the user's request — honour any continent/region, specific countries, difficulty, theme, number of rounds, "random", or custom set they ask for. If they don't specify, use 12 rounds with a good SPREAD of difficulties (some easy, some medium, some hard). Order does NOT matter — the rounds are shuffled into a random order before play.
Rules:
- Use ONLY real countries/territories that have a flag, with correct ISO 3166-1 alpha-2 codes — accuracy is essential (the code MUST match the country).
- 'easy' = globally famous flags (e.g. us, fr, jp, br); 'hard' = obscure ones.
- Give each country's common English name + a few accepted aliases (short names, common spellings, abbreviations).
- No duplicate countries. If the user specifies a number of rounds, produce EXACTLY that many; otherwise 12 (hard cap 40).`;

export async function POST(req: NextRequest) {
  if (!hasGroq() && !hasAnthropic()) return NextResponse.json({ title: "Flags", rounds: [] });

  let request = "";
  try {
    ({ request } = await req.json());
  } catch {
    return new Response(null, { status: 400 });
  }

  const model = hasAnthropic() ? MODELS.genius() : MODELS.fast();
  let object: z.infer<typeof genSchema>;
  try {
    ({ object } = await generateObject({
      model,
      schema: genSchema,
      system: SYSTEM,
      prompt: request?.trim() || "A worldwide mix of 12 flags, easy to hard.",
      temperature: 0.4,
      maxRetries: 1,
    }));
  } catch {
    return NextResponse.json({ title: "Flags", rounds: [] });
  }

  const countries = await loadCountries();
  const rounds: Array<{ code: string; name: string; aliases: string[]; difficulty: string; flag: string }> = [];
  const seen = new Set<string>();
  for (const r of object.rounds) {
    const code = (r.code || "").toLowerCase().trim();
    if (!/^[a-z]{2}$/.test(code) || seen.has(code)) continue;
    const info = countries.get(code);
    // If we have the authoritative list and the code isn't in it, drop it.
    if (countries.size > 0 && !info) continue;
    seen.add(code);
    const name = info?.name || r.name || code.toUpperCase();
    rounds.push({
      code,
      name,
      aliases: uniq([name, r.name, ...(r.aliases || []), ...(info?.aliases || [])]),
      difficulty: r.difficulty,
      flag: `https://flagcdn.com/${code}.svg`,
    });
  }

  // Randomize the order so flags never come in a predictable easy→hard run (the
  // difficulty rail still reflects each round's own level).
  for (let i = rounds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
  }

  return NextResponse.json({
    title: object.title || "Flags",
    secondsPerRound: object.secondsPerRound ?? 7,
    rounds,
  });
}
