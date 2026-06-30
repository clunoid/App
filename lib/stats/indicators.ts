/**
 * Curated World Bank indicators — the verified, authoritative data behind Stat
 * Battle's economy/demographics topics. The brain maps a free-text request to one
 * of these KEYS (or "none" → web-researched data); nothing about the request is
 * hardcoded, only the catalogue of trustworthy series. Codes are stable World
 * Bank indicator IDs (https://data.worldbank.org). Add a row to support a metric.
 */
export type DisplayScale = "raw" | "K" | "M" | "B" | "T";

export type Indicator = {
  code: string; // World Bank indicator id
  valueLabel: string; // e.g. "GDP"
  headline: string; // a ready title when the brain isn't writing one
  prefix: string; // e.g. "$"
  suffix?: string; // fixed unit (e.g. "%", " yrs", " Mt") — overrides scale letters
  scale: DisplayScale; // default magnitude the numbers are shown at
  decimals: number; // decimals on each value
  scalable: boolean; // can the user re-scale it (money/counts) — false for %/ratios
  blurb: string; // shown to the brain so it can match the request to this key
  match: RegExp; // keyword fallback so verified data works without the brain
};

export const SCALE_DIV: Record<DisplayScale, number> = { raw: 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
export const SCALE_SUFFIX: Record<DisplayScale, string> = { raw: "", K: "K", M: "M", B: "B", T: "T" };

export const INDICATORS: Record<string, Indicator> = {
  gdp_per_capita: { code: "NY.GDP.PCAP.CD", valueLabel: "GDP per capita", headline: "Richest Countries by GDP per Capita", prefix: "$", scale: "raw", decimals: 0, scalable: true, blurb: "GDP per person (current US$) — 'richest countries per capita'.", match: /\b(gdp\s*per\s*capita|per\s*capita\s*(gdp|income)|richest\s*countr)/ },
  gni_per_capita: { code: "NY.GNP.PCAP.CD", valueLabel: "GNI per capita", headline: "Countries by GNI per Capita", prefix: "$", scale: "raw", decimals: 0, scalable: true, blurb: "Gross national income per person (current US$).", match: /\bgni\s*per\s*capita\b/ },
  gdp_ppp: { code: "NY.GDP.MKTP.PP.CD", valueLabel: "GDP (PPP)", headline: "Largest Economies by GDP (PPP)", prefix: "$", scale: "M", decimals: 1, scalable: true, blurb: "GDP by purchasing power parity (international $).", match: /\bgdp\b.*\bppp\b|purchasing power/ },
  gdp: { code: "NY.GDP.MKTP.CD", valueLabel: "GDP", headline: "World's Largest Economies", prefix: "$", scale: "M", decimals: 1, scalable: true, blurb: "Nominal GDP (current US$) — 'largest economies', 'GDP'.", match: /\bgdp\b|largest\s*econom|biggest\s*econom|\beconomies\b/ },
  population: { code: "SP.POP.TOTL", valueLabel: "Population", headline: "World's Most Populous Countries", prefix: "", scale: "raw", decimals: 0, scalable: true, blurb: "Total population — 'most populous countries'.", match: /\bpopulous\b|\bpopulation\b/ },
  military: { code: "MS.MIL.XPND.CD", valueLabel: "Military spending", headline: "Top Military Spenders", prefix: "$", scale: "M", decimals: 1, scalable: true, blurb: "Military / defense expenditure (current US$).", match: /\bmilitary\b|\bdefen[cs]e\s*(spending|budget|expenditure)/ },
  exports: { code: "NE.EXP.GNFS.CD", valueLabel: "Exports", headline: "Top Exporting Countries", prefix: "$", scale: "M", decimals: 1, scalable: true, blurb: "Exports of goods and services (current US$).", match: /\bexports?\b/ },
  imports: { code: "NE.IMP.GNFS.CD", valueLabel: "Imports", headline: "Top Importing Countries", prefix: "$", scale: "M", decimals: 1, scalable: true, blurb: "Imports of goods and services (current US$).", match: /\bimports?\b/ },
  fdi: { code: "BX.KLT.DINV.CD.WD", valueLabel: "Foreign investment", headline: "Top Foreign Investment Destinations", prefix: "$", scale: "M", decimals: 1, scalable: true, blurb: "Foreign direct investment, net inflows (current US$).", match: /foreign\s*(direct\s*)?investment|\bfdi\b/ },
  co2: { code: "EN.GHG.CO2.MT.CE.AR5", valueLabel: "CO₂ emissions", headline: "Biggest CO₂ Emitters", prefix: "", suffix: " Mt", scale: "raw", decimals: 1, scalable: false, blurb: "CO₂ emissions (million tonnes) — 'biggest emitters'.", match: /\bco2\b|carbon|emission/ },
  life_expectancy: { code: "SP.DYN.LE00.IN", valueLabel: "Life expectancy", headline: "Life Expectancy by Country", prefix: "", suffix: " yrs", scale: "raw", decimals: 1, scalable: false, blurb: "Life expectancy at birth, in years.", match: /life\s*expectancy|longevity/ },
  inflation: { code: "FP.CPI.TOTL.ZG", valueLabel: "Inflation", headline: "Inflation by Country", prefix: "", suffix: "%", scale: "raw", decimals: 1, scalable: false, blurb: "Inflation, consumer prices (annual %).", match: /\binflation\b/ },
  unemployment: { code: "SL.UEM.TOTL.ZS", valueLabel: "Unemployment", headline: "Unemployment by Country", prefix: "", suffix: "%", scale: "raw", decimals: 1, scalable: false, blurb: "Unemployment (% of labor force).", match: /unemployment/ },
  internet_users: { code: "IT.NET.USER.ZS", valueLabel: "Internet users", headline: "Internet Adoption by Country", prefix: "", suffix: "%", scale: "raw", decimals: 1, scalable: false, blurb: "Individuals using the internet (% of population).", match: /internet\s*user|internet\s*adoption/ },
  mobile: { code: "IT.CEL.SETS", valueLabel: "Mobile subscriptions", headline: "Mobile Subscriptions by Country", prefix: "", scale: "M", decimals: 1, scalable: true, blurb: "Mobile cellular subscriptions (count).", match: /mobile\s*(subscri|phone)|cell\s*phone/ },
  tourism: { code: "ST.INT.ARVL", valueLabel: "Tourist arrivals", headline: "Most Visited Countries", prefix: "", scale: "M", decimals: 1, scalable: true, blurb: "International tourist arrivals (count).", match: /tourist|tourism\s*arrival|most\s*visited/ },
};

export type IndicatorKey = keyof typeof INDICATORS;
export const INDICATOR_KEYS = Object.keys(INDICATORS) as IndicatorKey[];

/** The catalogue the brain reads to pick a key (or "none"). */
export function indicatorMenu(): string {
  return INDICATOR_KEYS.map((k) => `- ${k}: ${INDICATORS[k].blurb}`).join("\n");
}

/** Keyword fallback (no AI): map a request to a verified indicator, or null. */
export function guessIndicatorKey(request: string): IndicatorKey | null {
  const s = request.toLowerCase();
  for (const k of INDICATOR_KEYS) if (INDICATORS[k].match.test(s)) return k;
  return null;
}

/** Pull a year range out of free text (e.g. "1990 to 2020"), else sensible defaults. */
export function detectYears(request: string, now: number): { from: number; to: number } {
  const yrs = (request.match(/\b(1[5-9]\d{2}|20\d{2})\b/g) || []).map(Number).filter((y) => y >= 1500 && y <= now);
  if (yrs.length >= 2) return { from: Math.min(...yrs), to: Math.max(...yrs) };
  if (yrs.length === 1) return { from: Math.min(yrs[0], now), to: now };
  return { from: 1960, to: now };
}

/** Did the user explicitly TYPE a year beyond World Bank's coverage (≈ now − 2, since WB
 *  annual data lags ~2 years)? Such a request wants a projection → the Opus model path,
 *  NOT the cheap catalogue path. Shared so the route and the credit pre-flight agree. */
export function wantsBeyondWB(request: string, now: number): boolean {
  const wbLatest = now - 2;
  const yrs = (request.match(/\b(1[5-9]\d{2}|20\d{2})\b/g) || []).map(Number);
  return yrs.some((y) => y > wbLatest);
}
