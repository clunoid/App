/**
 * Shared flag-game core: the authoritative flagcdn code→name dataset (daily-cached)
 * and the deterministic round builders. Extracted so BOTH the play route
 * (/api/games/flags) and the Video Direct planner (/api/games/plan) use ONE cache
 * and identical validation — no drift, no duplicate daily fetch. Server-only.
 */
import { WORLD_ORDER, WORLD_ALIASES } from "@/lib/games/world";

export type Difficulty = "easy" | "medium" | "hard";
export type RoundOut = { code: string; name: string; aliases: string[]; difficulty: Difficulty; flag: string };

/** Size of a default/general/worldwide game — a varied spread sampled fresh each play. */
export const DEFAULT_SPREAD = 12;

export const uniq = (arr: (string | undefined)[]) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && x.trim().length > 1)));

// PNG (not SVG): flagcdn SVGs are inconsistent — some omit width/height and only
// carry a viewBox, which renders as a tiny "dot" in an <img>. The PNG always has
// real pixel dimensions, so every flag displays at full size. w1280 is crisp.
export const flagUrl = (code: string) => `https://flagcdn.com/w1280/${code}.png`;

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Keep the difficulty RAMP (all easy, then medium, then hard) but SHUFFLE the
 * countries WITHIN each tier — so every play has a different sequence.
 */
export function orderByTier(rounds: RoundOut[]): RoundOut[] {
  const t: Record<Difficulty, RoundOut[]> = { easy: [], medium: [], hard: [] };
  for (const r of rounds) t[r.difficulty].push(r);
  return [...shuffle(t.easy), ...shuffle(t.medium), ...shuffle(t.hard)];
}

// Authoritative code → name from flagcdn (every code here has a real flag). One
// shared daily cache across all routes that import this module.
let cache: Map<string, string> | null = null;
let cacheAt = 0;
const DAY = 24 * 60 * 60 * 1000;

export async function loadFlagNames(): Promise<Map<string, string>> {
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
export function buildAllCountries(names: Map<string, string>): RoundOut[] {
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
 * A varied difficulty-spread of `n` flags drawn RANDOMLY from ALL world countries
 * (different every play) — used for general/worldwide requests. Keeps the ramp.
 */
export function worldSpread(names: Map<string, string>, n: number): RoundOut[] {
  const all = buildAllCountries(names);
  const per = Math.ceil(n / 3);
  const pick = (d: Difficulty) => shuffle(all.filter((r) => r.difficulty === d)).slice(0, per);
  return orderByTier([...pick("easy"), ...pick("medium"), ...pick("hard")].slice(0, n));
}

/** Turn a validated set of {code,difficulty} into full rounds (official names + flags). */
export function roundsFromCodes(items: { code: string; difficulty: Difficulty }[], names: Map<string, string>): RoundOut[] {
  const rounds: RoundOut[] = [];
  const seen = new Set<string>();
  for (const r of items) {
    const code = (r.code || "").toLowerCase().trim();
    if (!/^[a-z]{2}$/.test(code) || seen.has(code)) continue;
    if (names.size > 0 && !names.has(code)) continue; // must have a real flag
    seen.add(code);
    const name = names.get(code) || code.toUpperCase();
    rounds.push({ code, name, aliases: uniq([name, ...(WORLD_ALIASES[code] || [])]), difficulty: r.difficulty, flag: flagUrl(code) });
  }
  return rounds;
}
