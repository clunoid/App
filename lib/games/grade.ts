/**
 * Answer grading for the flag game — intelligent fuzzy matching so typos and
 * mis-hears still count. Pure functions, no app dependencies. Fresh implementation.
 */

/** lowercase, strip accents + punctuation, drop a leading "the". */
// Combining diacritical marks (U+0300–U+036F) — built from escapes to avoid
// embedding raw combining characters in source.
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .replace(/\bthe\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Is `guess` a correct answer for `answer` (with accepted `aliases`)? */
export function isCorrect(guess: string, answer: string, aliases: string[] = []): boolean {
  const g = normalize(guess);
  if (!g) return false;
  const cands = [answer, ...aliases].map(normalize).filter(Boolean);
  for (const c of cands) {
    if (g === c) return true;
    // containment for multi-word names (e.g. "korea" ⊂ "south korea")
    if (c.length >= 4 && (g.includes(c) || c.includes(g))) return true;
    // typo tolerance scaled to length (~1 edit per 5 chars), never for tiny words
    if (c.length > 3) {
      const tol = Math.max(1, Math.floor(c.length / 5));
      if (levenshtein(g, c) <= tol) return true;
    }
  }
  return false;
}

/**
 * Snap a noisy guess to the closest known country name (for display), e.g. a
 * mis-heard "pero" → "Peru". Returns the original if nothing is close enough.
 */
export function autocorrect(input: string, names: string[]): string {
  const g = normalize(input);
  if (!g) return input;
  let best: { name: string; dist: number } | null = null;
  for (const name of names) {
    const d = levenshtein(g, normalize(name));
    if (!best || d < best.dist) best = { name, dist: d };
  }
  if (!best) return input;
  const threshold = Math.max(1, Math.floor(g.length * 0.34));
  return best.dist <= threshold ? best.name : input;
}
