/**
 * Curated set of well-known countries for the flag game. Flags are served by
 * flagcdn.com (free, no key, no rate limit) using the ISO 3166-1 alpha-2 code.
 * Keeping this static means zero external latency and perfect reliability.
 */
export type Country = { code: string; name: string; aliases?: string[] };

export const COUNTRIES: Country[] = [
  { code: "us", name: "United States", aliases: ["usa", "america", "united states of america"] },
  { code: "gb", name: "United Kingdom", aliases: ["uk", "britain", "great britain", "england"] },
  { code: "ca", name: "Canada" },
  { code: "mx", name: "Mexico" },
  { code: "br", name: "Brazil" },
  { code: "ar", name: "Argentina" },
  { code: "cl", name: "Chile" },
  { code: "co", name: "Colombia" },
  { code: "pe", name: "Peru" },
  { code: "fr", name: "France" },
  { code: "de", name: "Germany" },
  { code: "it", name: "Italy" },
  { code: "es", name: "Spain" },
  { code: "pt", name: "Portugal" },
  { code: "nl", name: "Netherlands", aliases: ["holland"] },
  { code: "be", name: "Belgium" },
  { code: "ch", name: "Switzerland" },
  { code: "at", name: "Austria" },
  { code: "se", name: "Sweden" },
  { code: "no", name: "Norway" },
  { code: "dk", name: "Denmark" },
  { code: "fi", name: "Finland" },
  { code: "ie", name: "Ireland" },
  { code: "pl", name: "Poland" },
  { code: "cz", name: "Czechia", aliases: ["czech republic"] },
  { code: "gr", name: "Greece" },
  { code: "ru", name: "Russia" },
  { code: "ua", name: "Ukraine" },
  { code: "tr", name: "Turkey", aliases: ["turkiye"] },
  { code: "eg", name: "Egypt" },
  { code: "za", name: "South Africa" },
  { code: "ng", name: "Nigeria" },
  { code: "ke", name: "Kenya" },
  { code: "gh", name: "Ghana" },
  { code: "et", name: "Ethiopia" },
  { code: "tz", name: "Tanzania" },
  { code: "ug", name: "Uganda" },
  { code: "ma", name: "Morocco" },
  { code: "dz", name: "Algeria" },
  { code: "cn", name: "China" },
  { code: "jp", name: "Japan" },
  { code: "kr", name: "South Korea", aliases: ["korea"] },
  { code: "in", name: "India" },
  { code: "pk", name: "Pakistan" },
  { code: "bd", name: "Bangladesh" },
  { code: "id", name: "Indonesia" },
  { code: "th", name: "Thailand" },
  { code: "vn", name: "Vietnam" },
  { code: "ph", name: "Philippines" },
  { code: "my", name: "Malaysia" },
  { code: "sg", name: "Singapore" },
  { code: "sa", name: "Saudi Arabia" },
  { code: "ae", name: "United Arab Emirates", aliases: ["uae"] },
  { code: "il", name: "Israel" },
  { code: "ir", name: "Iran" },
  { code: "iq", name: "Iraq" },
  { code: "au", name: "Australia" },
  { code: "nz", name: "New Zealand" },
  { code: "jm", name: "Jamaica" },
  { code: "cu", name: "Cuba" },
  { code: "is", name: "Iceland" },
  { code: "hu", name: "Hungary" },
  { code: "ro", name: "Romania" },
  { code: "rs", name: "Serbia" },
  { code: "hr", name: "Croatia" },
  { code: "qa", name: "Qatar" },
];

/** Find a country by (normalized) name or alias — used to show its flag. */
export function findCountryByName(name: string): Country | undefined {
  const g = name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!g) return undefined;
  return COUNTRIES.find((c) =>
    [c.name, ...(c.aliases ?? [])].some((n) => n.toLowerCase() === g)
  );
}

/** Pick a random country, optionally avoiding a recently shown code. */
export function pickCountry(avoidCode?: string): Country {
  let c = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  if (avoidCode && COUNTRIES.length > 1) {
    while (c.code === avoidCode) {
      c = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    }
  }
  return c;
}

export function flagUrl(code: string): string {
  return `https://flagcdn.com/w640/${code.toLowerCase()}.png`;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ");

/** Lenient grading: exact / alias / contained match after normalization. */
export function isCorrectGuess(guess: string, country: Country): boolean {
  const g = normalize(guess);
  if (!g) return false;
  const candidates = [country.name, ...(country.aliases ?? [])].map(normalize);
  return candidates.some((c) => c === g || g.includes(c) || c.includes(g));
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/**
 * Autocorrect a spoken/typed guess to the nearest country name. Handles
 * mis-hears like "pero" -> "Peru". Returns the corrected display name (or the
 * original input if nothing is close enough).
 */
export function autocorrectCountry(input: string): string {
  const g = normalize(input);
  if (!g) return input;
  let best: { name: string; dist: number } | null = null;
  for (const country of COUNTRIES) {
    for (const cand of [country.name, ...(country.aliases ?? [])]) {
      const d = editDistance(g, normalize(cand));
      if (best === null || d < best.dist) best = { name: country.name, dist: d };
    }
  }
  if (!best) return input;
  // Accept the correction only when it's a close match (scaled to word length).
  const threshold = Math.max(1, Math.floor(g.length * 0.34));
  return best.dist <= threshold ? best.name : input;
}

/**
 * Does this utterance look like a country guess (vs. a command / topic change)?
 * Used to decide whether to grade it as a flag answer or hand it to the brain.
 */
export function looksLikeCountryGuess(text: string): boolean {
  const g = normalize(text);
  if (!g) return false;
  for (const c of COUNTRIES) {
    for (const cand of [c.name, ...(c.aliases ?? [])]) {
      const n = normalize(cand);
      if (g === n || g.includes(n)) return true;
    }
  }
  // A short phrase that confidently snaps to a country (e.g. "canata" -> Canada).
  if (g.split(" ").length <= 3) {
    return normalize(autocorrectCountry(g)) !== g;
  }
  return false;
}
