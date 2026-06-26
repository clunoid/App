/**
 * Resolve an entity name → an ISO-3166 alpha-2 code → a flag image URL (flagcdn,
 * free + CORS-enabled so it never taints the canvas). World Bank data already
 * carries the code, so this is only needed for web-researched / fallback country
 * topics. Non-country entities simply resolve to no flag (the bar shows no media).
 */
import { COUNTRIES } from "@/lib/data/countries";
import { WORLD_ALIASES } from "@/lib/games/world";

/** Extra big economies / common stat-battle countries not in the curated game set. */
const EXTRA: Record<string, string> = {
  taiwan: "tw", "south korea": "kr", "north korea": "kp", "hong kong": "hk", "czech republic": "cz",
  "saudi arabia": "sa", "united arab emirates": "ae", uae: "ae", venezuela: "ve", iraq: "iq",
  kazakhstan: "kz", "sri lanka": "lk", myanmar: "mm", burma: "mm", angola: "ao", sudan: "sd",
  uzbekistan: "uz", luxembourg: "lu", slovakia: "sk", slovenia: "si", bulgaria: "bg",
  belarus: "by", lithuania: "lt", latvia: "lv", estonia: "ee", azerbaijan: "az", georgia: "ge",
  cyprus: "cy", malta: "mt", "costa rica": "cr", panama: "pa", uruguay: "uy", paraguay: "py",
  bolivia: "bo", ecuador: "ec", guatemala: "gt", "dominican republic": "do", lebanon: "lb",
  jordan: "jo", kuwait: "kw", oman: "om", bahrain: "bh", yemen: "ye", afghanistan: "af",
  nepal: "np", cambodia: "kh", laos: "la", mongolia: "mn", "democratic republic of the congo": "cd",
  "dr congo": "cd", congo: "cg", "ivory coast": "ci", "cote d'ivoire": "ci", cameroon: "cm",
  senegal: "sn", zambia: "zm", zimbabwe: "zw", mozambique: "mz", madagascar: "mg", mali: "ml",
  "burkina faso": "bf", tunisia: "tn", libya: "ly", botswana: "bw", namibia: "na", rwanda: "rw",
  "papua new guinea": "pg", brunei: "bn", iceland: "is", "north macedonia": "mk", macedonia: "mk",
  albania: "al", "bosnia and herzegovina": "ba", montenegro: "me", moldova: "md", armenia: "am",
  turkmenistan: "tm", kyrgyzstan: "kg", tajikistan: "tj", honduras: "hn", "el salvador": "sv",
  nicaragua: "ni", "trinidad and tobago": "tt", "puerto rico": "pr",
  // common historical names → modern successor's flag (best-effort proxy)
  "soviet union": "ru", ussr: "ru", "russian sfsr": "ru", "russian empire": "ru",
  "west germany": "de", "east germany": "de", "german empire": "de", "nazi germany": "de",
  "kingdom of italy": "it", "empire of japan": "jp", "ottoman empire": "tr",
  "republic of china": "tw", "great qing": "cn", "qing dynasty": "cn", "british raj": "in",
  "french state": "fr", "austria-hungary": "at", czechoslovakia: "cz", yugoslavia: "rs",
};

const norm = (s: string) =>
  s.toLowerCase().trim().replace(/^the\s+/, "").replace(/[^a-z\s]/g, "").replace(/\s+/g, " ");

// Build one lookup once: alias/name → iso2 (curated game set + world aliases + extras).
const NAME_TO_ISO2: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of COUNTRIES) {
    m[norm(c.name)] = c.code;
    for (const a of c.aliases ?? []) m[norm(a)] = c.code;
  }
  for (const [code, names] of Object.entries(WORLD_ALIASES)) for (const n of names) m[norm(n)] = code;
  for (const [name, code] of Object.entries(EXTRA)) m[norm(name)] = code;
  return m;
})();

/** ISO-3166 alpha-2 → a CORS-enabled flag PNG (or null for a non-code). */
export function flagUrlFromIso2(code?: string | null): string | null {
  const c = (code || "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(c) ? `https://flagcdn.com/w320/${c}.png` : null;
}

/** Best-effort: a country name → its flag URL (null if it isn't a known country). */
export function flagUrlForName(name: string): string | null {
  const iso = NAME_TO_ISO2[norm(name)];
  return iso ? flagUrlFromIso2(iso) : null;
}

/** Best-effort: a country name → its ISO-3166 alpha-2 code. */
export function iso2ForName(name: string): string | null {
  return NAME_TO_ISO2[norm(name)] || null;
}
