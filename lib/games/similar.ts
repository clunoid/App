/**
 * Visually-confusable flag clusters, keyed by flagcdn 2-letter code (lowercase).
 * Used to make the multiple-choice quiz HARDER: when a flag has look-alikes, we
 * prefer those look-alikes as the wrong choices, so a player has to actually know
 * the flag rather than spot the odd one out. Pure reference data — no game logic.
 *
 * Each inner array is a "these look alike at a glance" group; a country can sit in
 * several groups (e.g. Italy is both a green-white-red and a vertical-tricolour).
 * The union per code is precomputed below into SIMILAR.
 */
const GROUPS: string[][] = [
  ["td", "ro", "ad", "md"], // blue–yellow–red vertical tricolours
  ["id", "mc", "pl", "sg"], // red/white (Indonesia, Monaco, Poland, Singapore)
  ["ru", "nl", "lu", "hr", "sk", "si", "rs"], // white/blue/red & Pan-Slavic horizontals
  ["dk", "no", "is", "se", "fi"], // Nordic crosses
  ["co", "ec", "ve"], // yellow–blue–red (Gran Colombia)
  ["ar", "uy"], // light-blue & white with a sun
  ["ie", "ci", "it", "ne", "in"], // green/white/orange (+ central emblem)
  ["it", "mx", "hu", "bg", "ir", "tj"], // green/white/red family
  ["ml", "gn", "sn", "cm"], // Pan-African vertical green-yellow-red (+ star)
  ["gh", "bo", "lt", "mm"], // red-yellow-green horizontal
  ["eg", "iq", "sy", "ye", "sd"], // Pan-Arab horizontal red-white-black
  ["jo", "ps", "kw", "ae", "sd"], // Pan-Arab with hoist triangle
  ["au", "nz", "fj", "tv"], // blue ensign + Union Jack + stars
  ["us", "lr", "my"], // stripes + canton
  ["tr", "tn"], // red with crescent & star
  ["pk", "dz", "mr"], // green with crescent
  ["qa", "bh"], // maroon/red & white serrated edge
  ["vn", "cn", "ma"], // red field with a single star
  ["jp", "bd", "pw", "la"], // a single centred disc on a plain field
  ["ch", "to"], // red field with a white cross
  ["hn", "sv", "ni", "gt"], // Central-America blue-white-blue
  ["be", "de"], // black/yellow/red
  ["cr", "th"], // blue-white-red horizontal bands
  ["py", "nl", "lu"], // red-white-blue horizontal (Paraguay)
];

const SIMILAR: Record<string, string[]> = (() => {
  const sets: Record<string, Set<string>> = {};
  for (const group of GROUPS) {
    for (const code of group) {
      const set = (sets[code] ??= new Set<string>());
      for (const other of group) if (other !== code) set.add(other);
    }
  }
  const out: Record<string, string[]> = {};
  for (const code in sets) out[code] = [...sets[code]];
  return out;
})();

/** Codes whose flags look like `code`'s flag (empty if it has no notable twins). */
export function similarCodes(code: string): string[] {
  return SIMILAR[code] ?? [];
}
