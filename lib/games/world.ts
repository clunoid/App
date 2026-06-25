/**
 * Sovereign countries in rough EASIEST → HARDEST order (familiarity ≈ population
 * + global prominence). Used by the "Continue · all countries" mode so the full
 * world game ramps from the flags everyone knows to the obscure ones. Names come
 * from flagcdn at runtime (authoritative + matched to the flag); this file only
 * fixes the ORDER and a few common alternate names for grading. Reference data —
 * not game logic — so it stays in one place, easy to extend.
 */

export const WORLD_ORDER: string[] = [
  // most populous / most recognizable
  "in", "cn", "us", "id", "pk", "ng", "br", "bd", "ru", "mx",
  "jp", "et", "ph", "eg", "cd", "vn", "ir", "tr", "de", "th",
  "gb", "fr", "it", "za", "tz", "mm", "ke", "kr", "co", "es",
  "ug", "ar", "dz", "sd", "ua", "iq", "af", "pl", "ca", "ma",
  "sa", "uz", "pe", "ao", "my", "mz", "gh", "ye", "np", "ve",
  // widely known
  "mg", "cm", "ci", "au", "kp", "ne", "tw", "lk", "bf", "ml",
  "ro", "mw", "cl", "kz", "zm", "gt", "ec", "sy", "nl", "sn",
  "kh", "td", "so", "zw", "gn", "rw", "bj", "bi", "tn", "bo",
  "be", "ht", "cu", "jo", "gr", "do", "cz", "pt", "se", "az",
  "hu", "ae", "by", "tj", "hn", "at", "pg", "il", "ch", "tg",
  // lesser known
  "sl", "la", "rs", "bg", "py", "ly", "lb", "ni", "sv", "kg",
  "tm", "sg", "dk", "fi", "sk", "no", "cg", "er", "ps", "om",
  "cr", "lr", "ie", "nz", "cf", "mr", "pa", "kw", "hr", "ge",
  "uy", "ba", "mn", "am", "jm", "qa", "al", "lt", "na", "gm",
  "bw", "ga", "ls", "gw", "si", "mk", "lv", "gq", "tt", "bh",
  // obscure / smallest
  "tl", "ee", "mu", "cy", "sz", "dj", "fj", "km", "gy", "bt",
  "sb", "lu", "me", "sr", "cv", "mt", "bn", "bz", "bs", "is",
  "vu", "bb", "st", "ws", "lc", "ki", "sc", "gd", "to", "vc",
  "fm", "ad", "ag", "dm", "mh", "kn", "li", "mc", "sm", "pw",
  "tv", "nr", "va",
];

/** Common alternate names/abbreviations for grading (only where the plain name
 *  isn't what people usually say). Everything else just uses its flagcdn name. */
export const WORLD_ALIASES: Record<string, string[]> = {
  us: ["USA", "United States of America", "America", "the US"],
  gb: ["UK", "United Kingdom", "Britain", "Great Britain", "England"],
  ae: ["UAE", "Emirates"],
  kr: ["South Korea", "Korea"],
  kp: ["North Korea", "DPRK"],
  cd: ["DR Congo", "Democratic Republic of the Congo", "DRC", "Congo Kinshasa"],
  cg: ["Republic of the Congo", "Congo", "Congo Brazzaville"],
  cz: ["Czech Republic", "Czechia"],
  cv: ["Cape Verde", "Cabo Verde"],
  ci: ["Ivory Coast", "Cote d'Ivoire"],
  sz: ["Swaziland", "Eswatini"],
  mm: ["Myanmar", "Burma"],
  tl: ["East Timor", "Timor-Leste"],
  va: ["Vatican", "Vatican City", "Holy See"],
  tw: ["Taiwan"],
  mk: ["North Macedonia", "Macedonia"],
  nl: ["Netherlands", "Holland"],
  st: ["Sao Tome and Principe", "Sao Tome"],
  kn: ["Saint Kitts and Nevis", "St Kitts"],
  vc: ["Saint Vincent and the Grenadines", "St Vincent"],
  lc: ["Saint Lucia", "St Lucia"],
};
