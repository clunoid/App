/**
 * World Bank Open Data — Stat Battle's source of VERIFIED, authoritative data for
 * economy / demographics topics (no API key, returns ISO codes → flags). We pull
 * the full per-year series for every country in one call, filter out aggregate
 * "regions/income groups", then build a true bar-chart race where countries enter
 * and leave the top as their real numbers cross over. No estimates, no hardcoding.
 */
import { PALETTE, type RaceRaw } from "../types";
import { INDICATORS, SCALE_DIV, SCALE_SUFFIX, type DisplayScale, type IndicatorKey } from "../indicators";
import { flagUrlFromIso2 } from "../flags";

const BASE = "https://api.worldbank.org/v2";

// World Bank's terse names → friendly display names (only the common big ones).
const RENAME: Record<string, string> = {
  "Russian Federation": "Russia", "Korea, Rep.": "South Korea", "Korea, Dem. People's Rep.": "North Korea",
  "Egypt, Arab Rep.": "Egypt", "Iran, Islamic Rep.": "Iran", "Venezuela, RB": "Venezuela",
  "Syrian Arab Republic": "Syria", "Turkiye": "Turkey", "Viet Nam": "Vietnam", "Lao PDR": "Laos",
  "Slovak Republic": "Slovakia", "Kyrgyz Republic": "Kyrgyzstan", "Brunei Darussalam": "Brunei",
  "Hong Kong SAR, China": "Hong Kong", "Macao SAR, China": "Macao", "Congo, Dem. Rep.": "DR Congo",
  "Congo, Rep.": "Congo", "Gambia, The": "Gambia", "Bahamas, The": "Bahamas", "Yemen, Rep.": "Yemen",
  "Micronesia, Fed. Sts.": "Micronesia", "Czechia": "Czechia",
};

type WBRow = { iso2: string; name: string; year: number; value: number };

// Cache the real-country whitelist across warm invocations (it rarely changes).
let _countriesP: Promise<Map<string, string>> | null = null;
/** iso3 → iso2 for REAL countries only (aggregates filtered out). */
function realCountries(): Promise<Map<string, string>> {
  if (_countriesP) return _countriesP;
  _countriesP = (async () => {
    const res = await fetch(`${BASE}/country?format=json&per_page=400`, { next: { revalidate: 86400 } });
    const data = (await res.json()) as [unknown, { id: string; iso2Code: string; region: { value: string } }[]];
    const m = new Map<string, string>();
    for (const c of data[1] || []) {
      if (c.region?.value && c.region.value !== "Aggregates" && /^[A-Za-z]{2}$/.test(c.iso2Code)) {
        m.set(c.id, c.iso2Code.toLowerCase());
      }
    }
    return m;
  })().catch((e) => {
    _countriesP = null; // allow retry next request
    throw e;
  });
  return _countriesP;
}

/** Pull one indicator's full series for [from,to], real countries only. */
async function fetchSeries(code: string, from: number, to: number): Promise<WBRow[]> {
  const countries = await realCountries();
  const url = `${BASE}/country/all/indicator/${code}?format=json&date=${from}:${to}&per_page=20000`;
  // No Next.js fetch cache here: the response is >2MB (over the cache limit), and
  // it's a single fast call anyway.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`world bank ${res.status}`);
  const data = (await res.json()) as [
    unknown,
    { countryiso3code: string; country: { value: string }; date: string; value: number | null }[]
  ];
  const rows: WBRow[] = [];
  for (const r of data[1] || []) {
    const iso2 = countries.get(r.countryiso3code);
    if (!iso2 || r.value == null) continue;
    const year = Number(r.date);
    if (!Number.isFinite(year)) continue;
    rows.push({ iso2, name: RENAME[r.country.value] || r.country.value, year, value: r.value });
  }
  return rows;
}

export type WorldBankOpts = {
  indicatorKey: IndicatorKey;
  from: number;
  to: number;
  topN: number;
  scale?: DisplayScale; // user override (else the indicator default)
  decimals?: number; // user override
};

/**
 * Build a verified RaceRaw from World Bank data. Entities = every country that
 * reaches the visible top in ANY year (so bars genuinely enter/leave the chart);
 * keyframes = one per year of real data; flags attached from each ISO code.
 */
export async function buildWorldBankRace(opts: WorldBankOpts): Promise<RaceRaw | null> {
  const ind = INDICATORS[opts.indicatorKey];
  if (!ind) return null;
  const rows = await fetchSeries(ind.code, opts.from, opts.to);
  if (rows.length < 4) return null;

  // index: year → (iso2 → {name,value})
  const byYear = new Map<number, Map<string, { name: string; value: number }>>();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Map());
    byYear.get(r.year)!.set(r.iso2, { name: r.name, value: r.value });
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length < 2) return null;

  // entities = union of those reaching the visible top in ANY year (a real race),
  // capped so the renderer's interpolation set stays lean.
  const everTop = new Map<string, { name: string; peak: number }>(); // iso2 → best rank seen
  for (const y of years) {
    const ranked = [...byYear.get(y)!.entries()].sort((a, b) => b[1].value - a[1].value);
    ranked.slice(0, opts.topN).forEach(([iso2, info], i) => {
      const prev = everTop.get(iso2);
      if (!prev || i < prev.peak) everTop.set(iso2, { name: info.name, peak: i });
    });
  }
  const chosen = [...everTop.entries()].sort((a, b) => a[1].peak - b[1].peak).slice(0, Math.max(opts.topN + 12, 24));
  const order = chosen.map(([iso2]) => iso2);

  const divisor = ind.scalable ? SCALE_DIV[opts.scale || ind.scale] : 1;
  const entities = order.map((iso2, i) => ({
    name: everTop.get(iso2)!.name,
    color: PALETTE[i % PALETTE.length],
    kind: "country" as const,
    image: flagUrlFromIso2(iso2) || undefined,
  }));

  const keyframes = years.map((y) => {
    const yr = byYear.get(y)!;
    const values: { name: string; value: number }[] = [];
    for (const iso2 of order) {
      const rec = yr.get(iso2);
      if (rec) values.push({ name: rec.name, value: rec.value / divisor });
    }
    return { time: y, values };
  }).filter((k) => k.values.length >= 2);

  if (keyframes.length < 2) return null;

  const unitSuffix = ind.suffix ?? (ind.scalable ? SCALE_SUFFIX[opts.scale || ind.scale] : "");
  return {
    title: "",
    valueLabel: ind.valueLabel,
    unitPrefix: ind.prefix,
    unitSuffix,
    timeLabel: "Year",
    decimals: opts.decimals ?? ind.decimals,
    topN: opts.topN,
    source: "World Bank",
    entities,
    keyframes,
  };
}
