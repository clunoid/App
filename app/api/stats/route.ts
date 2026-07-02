import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { PALETTE, type EntityKind, type RaceEventRaw, type RaceRaw } from "@/lib/stats/types";
import { GDP_FALLBACK } from "@/lib/stats/fallback";
import { INDICATORS, INDICATOR_KEYS, indicatorMenu, guessIndicatorKey, detectYears, wantsBeyondWB, SCALE_DIV, SCALE_SUFFIX, type DisplayScale, type IndicatorKey } from "@/lib/stats/indicators";
import { buildWorldBankRace } from "@/lib/stats/sources/worldbank";
import { flagUrlForName } from "@/lib/stats/flags";
import { hasSearch, webSearch } from "@/lib/data/search";
import { requireUser } from "@/lib/auth/requireUser";
import { chargeCredits, chargeCapped, chargeError, refund, creditsAvailable } from "@/lib/billing/meter";
import { ACTION_COSTS, INPUT_CAPS, STATS_OPUS_FLOOR } from "@/lib/billing/costs";

export const runtime = "nodejs";
export const maxDuration = 300; // research + plan (Sonnet) + the Opus data series can run long — give it room

const HEX = /^#?[0-9a-fA-F]{6}$/;
const ISO2 = /^[a-z]{2}$/;
const _D = new Date();
const NOW = _D.getFullYear();
const NOW_MONTH = _D.getMonth(); // 0-11
const NOW_FRAC = NOW + NOW_MONTH / 12; // current date as a fractional year (e.g. 2026.42 in Jun)
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NOW_LABEL = `${MONTH_NAMES[NOW_MONTH]} ${NOW}`; // e.g. "June 2026"
const WB_LATEST = NOW - 2; // World Bank annual data lags ~2 years (e.g. 2024 today)

/** Display scale read from the request text (deterministic, not model-guessed). */
function detectScale(request: string): { scale?: DisplayScale; decimals?: number } {
  const s = request.toLowerCase();
  if (/\b(exact|full figures?|precise|to the (dollar|cent)|unrounded)\b/.test(s)) return { scale: "raw", decimals: 0 };
  if (/\btrillions?\b/.test(s)) return { scale: "T" };
  if (/\bbillions?\b/.test(s)) return { scale: "B" };
  if (/\bmillions?\b/.test(s)) return { scale: "M" };
  if (/\bthousands?\b/.test(s)) return { scale: "K" };
  // DEFAULT when the user gives no unit: EXACT — full, un-abbreviated figures (no
  // M/B/T). Decimals stay natural per metric (whole dollars/counts, but % keep their
  // precision). Users can still ask for "millions"/"billions" etc. above to abbreviate.
  return { scale: "raw" };
}

const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/**
 * DETERMINISTIC sub-year window detection — the #1 fix for "it ignored my window".
 * The model is NOT reliable at honoring an explicit window (at temperature it
 * sometimes widens "May 2026" into an all-time race). So when the request clearly
 * names ONE month / quarter / single year, we FORCE that window here and the model
 * can never widen it. Returns null for multi-year / open-ended / "all-time" / "over
 * the years" requests, which keep racing by year exactly as before.
 */
function detectWindow(request: string): { period: string; unit: "day" | "week" | "month"; year: number } | null {
  const s = request.toLowerCase();
  // Explicitly multi-period phrasings → NOT a single window.
  if (/\b(all[-\s]?time|over time|over the years|through the years|throughout history|each year|year[-\s]by[-\s]year|history|ever|decade)\b/.test(s)) return null;
  const years = (s.match(/\b(1[5-9]\d{2}|20\d{2})\b/g) || []).map(Number);
  const distinct = [...new Set(years)];
  if (distinct.length >= 2) return null; // a multi-year range, not one window
  const yr = distinct[0] ?? NOW;
  const hasRange = /\b(to|through|thru|until|till|–|—)\b/.test(s) || /\b(from|since|after|before)\s+\d{4}\b/.test(s) || /\b(today|now|present|current|onwards?)\b/.test(s);
  // Quarter, e.g. "Q1 2026".
  const q = s.match(/\bq([1-4])\b/);
  if (q) return { period: `Q${q[1]} ${yr}`, unit: "month", year: yr };
  // Month + year adjacency, e.g. "May 2026", "in may 2026", "May, 2026".
  const my = s.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*,?\s*(\d{4})\b/);
  if (my) {
    const mi = MONTH_ABBR.indexOf(my[1].slice(0, 3));
    if (mi >= 0) return { period: `${MONTH_NAMES[mi]} ${my[2]}`, unit: "week", year: Number(my[2]) };
  }
  // "this month" / "last month".
  if (/\bthis month\b/.test(s)) return { period: NOW_LABEL, unit: "week", year: NOW };
  if (/\blast month\b/.test(s)) {
    const mi = (NOW_MONTH + 11) % 12;
    const y = NOW_MONTH === 0 ? NOW - 1 : NOW;
    return { period: `${MONTH_NAMES[mi]} ${y}`, unit: "week", year: y };
  }
  // A single explicit year on its own (no range words) → race the MONTHS of that year
  // (e.g. "biggest box office movies in 2024"). "1960 to today" is excluded by hasRange.
  if (distinct.length === 1 && !hasRange) return { period: `${yr}`, unit: "month", year: yr };
  return null;
}

/**
 * Does the prompt ask for a GLOBAL/worldwide ranking? If so the roster must span
 * the whole world (not default to one country, usually the US). Matches genuine
 * global phrasings but NOT scoped proper nouns where "world" isn't a geography.
 */
function wantsWorldwide(request: string): boolean {
  const s = request.toLowerCase();
  // exclude proper nouns where "world" isn't a geographic scope
  if (/\b(world series|world cup|world war|disney\s*world|world of warcraft|wizarding world|world bank|world trade|westworld|world record)\b/.test(s)) return false;
  return /\b(in the world|world'?s|worldwide|globally?|across the globe|every country|all countries|international(?:ly)?)\b/.test(s);
}

/**
 * Is this an ALL-TIME ranking (keep everyone, overtaken by rank) vs the default
 * "top each year" live snapshot (a competitor drops off once past its peak)?
 */
function wantsAllTime(request: string): boolean {
  return /\b(all[- ]?time|of all time|in history|throughout history|history|ever)\b/.test(request.toLowerCase());
}

/* ── 1. PLAN + STORY: map the free-text request to a data plan + event timeline ── */
const planSchema = z.object({
  mode: z.enum(["worldbank", "model"]).describe("'worldbank' ONLY for a modern (1960+) by-country ranking matching a catalogue indicator; 'model' for everything else (historical, people, clubs, projections, custom lists)."),
  indicatorKey: z.string().describe("One catalogue key (exact) when mode='worldbank', else 'none'."),
  title: z.string().describe("Punchy headline, e.g. \"World's Largest Economies\"."),
  subtitle: z.string().optional().describe("Range + unit note, e.g. 'Nominal GDP · 1560–2026'."),
  valueLabel: z.string().optional().describe("[model] what the number is, e.g. 'Net worth', 'ELO', 'Army size'."),
  unitPrefix: z.string().optional().describe("[model] prefix e.g. '$' (empty if none)."),
  unitSuffix: z.string().optional().describe("[model] suffix e.g. ' pts', '%', 'M', ' troops' (empty if none)."),
  displayScale: z.enum(["raw", "K", "M", "B", "T"]).optional().describe("[model] magnitude. Money → 'M' unless the user says otherwise."),
  decimals: z.number().int().min(0).max(3).optional().describe("Decimals per value (money: 1; counts/ratings: 0)."),
  timeUnit: z
    .enum(["year", "month", "week", "day"])
    .optional()
    .describe(
      "GRANULARITY, inferred from the prompt's exact time window. A multi-year span or no period given → 'year' (default). A SINGLE specific year (e.g. '2024') → 'month'. A SINGLE month (e.g. 'May 2026', 'this month') → 'week' (or 'day'). A SINGLE week → 'day'. NEVER widen a single specified window into multiple years."
    ),
  period: z
    .string()
    .optional()
    .describe(
      "When the user asked for ONE sub-year window, its human label — e.g. 'May 2026', 'the week of 1 June 2026', 'Q1 2026'. Leave EMPTY for multi-year / open-ended spans (those use fromYear/toYear)."
    ),
  fromYear: z.number().int().optional().describe("EXACT start the user asked for (e.g. 1560, or 1 for '1 AD'). For a SINGLE sub-year window set this = that window's year (May 2026 → 2026), NOT earlier. Only default (≈1960) for an open-ended multi-year request with no start."),
  toYear: z.number().int().optional().describe("EXACT end the user asked for (e.g. 2026). For a single sub-year window set this = that window's year. Default the current year when none given."),
  topN: z.number().int().min(3).max(25).describe("How many bars are VISIBLE at once. Use the user's number if they gave one (e.g. 'top 15'→15, '5 players'→5); otherwise pick a natural count for the topic (≈10–15). This is the visible window, NOT the total roster."),
  entityKind: z.enum(["country", "company", "person", "mixed", "other"]).describe("What the competitors ARE — drives their bar media: country→flag, company→logo, person→photo. 'mixed' if it varies."),
  namedEntities: z.array(z.string()).optional().describe("If the user EXPLICITLY listed competitors (e.g. 'Elon Musk vs Jeff Bezos vs ...'), list them EXACTLY here; else omit."),
  rosterNotes: z
    .string()
    .optional()
    .describe(
      "If the ranking is GLOBAL/WORLDWIDE (e.g. 'richest people in the world', 'biggest companies in the world'), THINK HARD and list the genuine entities to include from ACROSS THE WORLD over the whole span — era by era — so the result isn't skewed to one country (usually the US). Name the real international leaders of EACH period who genuinely ranked, e.g. for worldwide wealth: ~1900s the Nizam of Hyderabad, the Rothschilds, Henri Deterding, Calouste Gulbenkian, Sir Basil Zaharoff, Tsar Nicholas II; mid-century Aristotle Onassis, K. P. Birla, the Sultan of Brunei, Adnan Khashoggi; 1980s–90s Yoshiaki Tsutsumi & Taikichiro Mori (Japan, world #1), Li Ka-shing (Hong Kong); modern Bernard Arnault, Amancio Ortega, Mukesh Ambani, Lakshmi Mittal, Gautam Adani, Masayoshi Son, Jack Ma. Recall the ACTUAL ones for THIS prompt — don't copy these verbatim. Leave EMPTY for country-scoped or local rankings."
    ),
  events: z
    .array(
      z.object({
        time: z.number().describe("Year this beat begins (within the range, ascending). For a SINGLE sub-year window (a month/week/day) just place the beats in chronological ORDER — the exact number doesn't matter, they're spaced across the window automatically."),
        title: z.string().describe("Bold era/event headline."),
        description: z.string().describe("1–2 factual sentences about what happened and its effect on the ranking."),
        partyCodes: z.array(z.string()).optional().describe("ISO-3166 alpha-2 codes (lowercase) of the countries involved → shown as flags. Use for country topics / wars."),
        vsCodes: z.array(z.string()).optional().describe("ONLY for conflicts: the opposing side's ISO-3166 alpha-2 codes."),
        subjects: z.array(z.string()).optional().describe("The 1–3 entity/person/company/song/album names whose photo, cover art or logo best illustrates this beat (e.g. ['Kylian Mbappé'], ['Tesla, Inc.'], ['Sabrina Carpenter','Short n' Sweet']). Match entities[].name where possible so their media is reused. Fill this for any NON-country topic."),
      })
    )
    .min(3)
    .max(50)
    .describe("The real story that explains the movement, ascending by time — and it must NEVER be empty. MULTI-YEAR span: the major factual turning points across the whole span (wars, crashes, oil shocks, reforms, booms, a company IPO, a record transfer) — roughly one per turning point. SINGLE SUB-YEAR window (e.g. 'May 2026'): 4–8 beats about the real, specific things that happened DURING that exact window and drove the ranking — new releases/drops, viral moments, chart débuts, record-breaking days, launches, results, notable news of THAT month/week — each with `subjects` for its media."),
});

function planSystem(): string {
  return `You plan an animated bar-chart race ("stat battle") AND write its factual event story. Numbers come from VERIFIED sources, so focus on (a) routing and (b) an accurate narrative.

ROUTING:
- mode="worldbank" ONLY when it's a by-COUNTRY ranking that matches a catalogue indicator AND the whole span is modern (fromYear ≥ 1960). Pick the EXACT indicatorKey:
${indicatorMenu()}
- mode="model" for EVERYTHING ELSE — historical spans (pre-1960, e.g. "GDP 1560–2026", "armies 1 AD–2026"), people/companies/clubs (net worth, market cap, transfer values), sports, or any custom list. These get web-researched.

TIME SCOPE — MATCH THE PROMPT'S WINDOW EXACTLY (this is the #1 source of errors — getting it wrong ruins the result):
- Read the exact TIME WINDOW the user asked for and set timeUnit + period to fit it. Do NOT widen a narrow window into many years.
  • SINGLE MONTH ("Most Streamed Songs — May 2026", "best-selling phones this month") → timeUnit "week" (or "day"), period "May 2026", fromYear=toYear=2026. The race covers ONLY that month; its values are the standings AS OF that month. NEVER begin years earlier.
  • SINGLE YEAR ("box office 2024", "in 2010") → timeUnit "month", period "2024", fromYear=toYear that year — race the months of that one year.
  • SINGLE WEEK / DAY → timeUnit "day", period the exact week/day.
  • MULTI-YEAR span ("GDP 1980–2026", "richest people over time") OR no period at all → timeUnit "year", set fromYear/toYear, leave period empty.
- A specific window ("in May 2026", "May 2026", "this month", "in 2024", "Q1 2026") ALWAYS wins: set period to it and race INSIDE it. For a windowed prompt the metric is that window's OWN activity (e.g. "most streamed … in May 2026" = streams DURING May 2026, a monthly chart that moves day-to-day), NEVER an all-time/lifetime cumulative total — and title/subtitle must name the window (e.g. "Most-Streamed Songs — May 2026"). NEVER label a windowed race "all-time" or "cumulative"; that would freeze the race. "All-time"/"ever"/"in history" with NO specific window is the only time you race the full multi-year span.

HONOR THE USER EXACTLY — never override an explicit request:
- fromYear/toYear = EXACTLY the years asked (1560, 1 for "1 AD", 2026, …). Only default (fromYear≈1960, toYear=${NOW}) for an OPEN-ENDED multi-year request with no period.
- topN = the user's requested visible-bar count if given (e.g. "top 15"→15, "5 players"→5); else a natural number for the topic.
- If the user NAMES specific competitors (e.g. "Elon Musk vs Jeff Bezos vs Bernard Arnault"), put them verbatim in namedEntities and set topN to that count.
- entityKind: country (flags), company (logos), person (photos), or mixed.
- Units — DEFAULT TO FULL, EXACT figures: the COMPLETE number with every digit, NEVER abbreviated, scaled, or rounded (no "0.6B", no "1,234M"). Counts/streams/views/subscribers → the whole number (e.g. 1750000000); money → full dollars (e.g. 757423097909). unitSuffix = the REAL unit only (%, pts, yrs, goals…) — NEVER a magnitude letter (no "M"/"B"). decimals 0 (full integers). ONLY express values in thousands/millions/billions if the user EXPLICITLY asks (e.g. "in billions").

WORLDWIDE COVERAGE: when the request is global ("…in the world", "world's…", "worldwide", "global", "international"), it must NOT default to one country (people most easily recall US names). THINK HARD and fill rosterNotes with the genuine WORLD leaders of EACH era across the whole span (multiple countries/regions) so the race has real global coverage — every entity that legitimately ranked, wherever they're from. Leave rosterNotes empty for country-scoped/local requests (e.g. "richest Americans", "Premier League scorers").

EVENT STORY: the REAL, well-established events that explain the movement — and the story must NEVER be empty. Each beat: punchy title, 1–2 truthful sentences, and media — for COUNTRY topics use partyCodes (flags; vsCodes only for a conflict's other side); for PEOPLE/COMPANY/MUSIC topics use subjects (the names whose photo, cover art or logo illustrates the beat). Be exact with dates/facts.
- MULTI-YEAR span: the major turning points across the WHOLE span (wars, crashes, oil shocks, reforms, booms, an IPO, a record transfer).
- SINGLE SUB-YEAR window (timeUnit month/week/day with a period, e.g. "May 2026"): do NOT write century-spanning history. Write 4–8 beats about what genuinely happened INSIDE that exact window and moved the ranking — new releases/drops, viral moments, chart débuts, record-breaking days, tournament results, launches, notable news of THAT month/week — in chronological order, each with subjects = the songs/albums/artists/teams/products/people whose cover art, photo or logo best illustrates it (match entity names so their media is reused).`;
}

/* ── 2. MODEL DATA: web-researched series for anything the catalogue can't cover ── */
const keyframeItem = z.object({
  time: z.number().describe("Ascending position across keyframes. Multi-year span → the year (e.g. 1990). Sub-year window → simple ascending indices (0,1,2,…)."),
  label: z
    .string()
    .optional()
    .describe(
      "The human time shown on screen. SET THIS ON EVERY KEYFRAME for a sub-year window (e.g. 'May 1 2026', 'May 8 2026', or just 'May 2026'). OMIT it for multi-year spans (the year is shown automatically from `time`)."
    ),
  values: z.array(z.object({ name: z.string().describe("MUST match an entities[].name exactly."), value: z.number() })).min(2).max(44),
});
const keyframesDesc =
  "Chronological, ascending; FIRST keyframe = the exact start year, LAST = the exact end year. EVERY keyframe — ESPECIALLY THE FIRST — must rank a FULL field (at least the visible bar count) so the chart is full top-to-bottom from the very start; list the genuine leaders of that year, omitting only entities that truly didn't exist yet or had retired.";
const seriesSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string(),
        color: z.string().optional().describe("Distinct hex like '#c0392b'."),
        country: z.string().optional().describe("ISO-3166 alpha-2 (lowercase) of the entity's origin — a company's HQ country, a person's nationality (e.g. 'us' for Apple, 'fr' for Mbappé). Omit for country entities."),
      })
    )
    .min(2)
    .max(44)
    .describe("EVERY competitor that appears in ANY keyframe across the whole span (a rolling roster — far more than are visible at once); distinct, readable colors. Include the PERIOD-APPROPRIATE leaders for the START of the span too (whoever actually led the metric back then), not only the names famous at the end — so the very first keyframe already has a full field."),
  // PRIMARY field. Optional only so that a model which emits the array under the
  // alias `values` (some do) still validates — we read `keyframes ?? values` below.
  keyframes: z.array(keyframeItem).min(2).max(60).optional().describe(`The keyframes (USE THIS FIELD NAME). ${keyframesDesc}`),
  values: z.array(keyframeItem).max(60).optional().describe("Alias for `keyframes` — only fill this if you did NOT use `keyframes`."),
});

function seriesSystem(opts: { from: number; to: number; topN: number; nowLabel: string; named?: string[]; context: string; anchor: string; current: string; scaleHint: string; worldwide: boolean; rosterNotes: string; allTime: boolean; period?: string; unit?: string }): string {
  const windowReq = opts.period
    ? `- TIME WINDOW — the race covers EXACTLY ${opts.period} (a ${opts.unit || "month"}-level window), NOTHING WIDER and NOTHING EARLIER. Step through it at ${opts.unit || "week"} granularity: output 8–16 keyframes, EACH with a "label" = the on-screen time (e.g. for a month: "May 1 2026", "May 8 2026", …). Use ascending integer "time" indices (0,1,2,…). Do NOT span any other year or reach back before the window.
- THE METRIC IS THE ACTIVITY *WITHIN* ${opts.period} — the amount GAINED DURING ${opts.period} (e.g. "most streamed in ${opts.period}" = streams counted DURING ${opts.period}, NOT an artist's all-time/lifetime Spotify total; "best-selling in ${opts.period}" = units sold DURING it). This is CRITICAL: do NOT output huge lifetime cumulative totals — those barely change over a few weeks and produce a DEAD, static chart.
- MOVEMENT IS MANDATORY — a chart where the same items stay in roughly the same order is a FAILURE (that is exactly the dead result to avoid). Model the window REALISTICALLY so the ranking churns: (a) items that launch or go viral DURING the window ENTER partway through (their FIRST keyframe is mid-window, starting low) and CLIMB FAST past established leaders; (b) early front-runners lose momentum and slip down; (c) every release / viral moment / event you put in the STORY must show up as a real climb or fall in the VALUES. The TOP of the chart (the #1 and top-3) MUST change at least twice across the window — do not let one item lead from start to finish. Vary each item's per-step gain so positions genuinely swap between consecutive keyframes.
- The FIRST keyframe = the opening of ${opts.period} (small early values); the LAST keyframe = the ACCURATE end-of-${opts.period} totals for the window, taken from the CURRENT STANDINGS below.`
    : `- Span EXACTLY ${opts.from} to ${opts.to}: the FIRST keyframe's time = ${opts.from}, the LAST = ${opts.to}. For years beyond the latest real data, give the best current projection/estimate; for ancient/historical years, the best scholarly estimate. (Leave each keyframe's "label" EMPTY — the year is shown from "time".)`;
  return `You assemble ACCURATE ranking-over-time data for an animated bar-chart race. Accuracy is paramount — use the research notes + authoritative anchors below; otherwise use the most credible scholarly figures (e.g. Maddison Project for historical GDP, IMF/World Bank for recent economics, Forbes for net worth, Transfermarkt for football values, official platform charts — Spotify/YouTube/Billboard — for streaming/chart stats, recognised historical scholarship for army sizes). NEVER invent fake precision.

REQUIREMENTS:
${windowReq}
- ${opts.scaleHint}
- METRIC DEFINITION: use the single most standard, widely-cited definition of the metric and apply it CONSISTENTLY across every year (e.g. army size = ACTIVE military personnel, not reserves or total available manpower; GDP = nominal). State nothing — just be consistent.
- PRESENT-DAY ACCURACY (THE MOST IMPORTANT REQUIREMENT — users fact-check this against Google): the FINAL keyframe represents ${opts.period ? `the END of ${opts.period}` : `TODAY (${opts.nowLabel})`}. Its ranking AND values MUST equal the ${opts.period ? `accurate standings for ${opts.period}` : "live figure for RIGHT NOW"} taken from the "CURRENT STANDINGS" block below (and the "CURRENT (${opts.nowLabel})" research line). Your own training knowledge is STALE for fast-moving stats — if the research shows a current number that differs from what you remember, TRUST THE RESEARCH, not your memory (e.g. a footballer's career-goal tally keeps climbing: if you "remember" ~900 but the research says 975 today, use 975). Use the value labelled today/current/latest, NOT a recent peak, all-time high, season total, or a months-old value. Use the MOST PRECISE figure the research gives (avoid suspiciously round numbers when a precise one exists). When sources cite DIFFERENT totals for the same entity (e.g. club-only vs all-competitions goals, or one source vs another), use the LARGER, most-commonly-cited HEADLINE figure — the number someone sees when they Google that entity — and apply that SAME definition consistently to EVERY competitor (so e.g. if Ronaldo is counted as ~975 all-competition goals, Messi must be his comparable ~870–915 all-competition figure, not a club-only count). Pin a real present-day number for EVERY top entity, not just the leader. Sanity-check against common knowledge (today's biggest economies are USA>China>Germany/Japan/India/UK; largest active militaries China/India/USA/NK/Russia).
- ${
    opts.named && opts.named.length >= 2
      ? `Use EXACTLY these competitors (no more, no fewer): ${opts.named.join(", ")}. Include every one in every keyframe of the range.`
      : `FULL CHART OF REAL DATA AT EVERY MOMENT (THE #1 RULE — getting this wrong ruins the whole video):
  Every keyframe — and ESPECIALLY THE FIRST (year ${opts.from}) — MUST contain at least ${opts.topN} entities whose value is REAL and GREATER THAN ZERO for that year.
  • A value of 0 (or a tiny placeholder) means "not present": it is DROPPED and leaves an EMPTY ROW. So you must NEVER list an entity at 0, and NEVER pad the early years with future / not-yet-existing famous names set to 0 just to reach the count.
  • WRONG (this is the exact mistake to avoid) for "top football scorers from ${opts.from}": listing today's stars like Cristiano Ronaldo, Lionel Messi, Lewandowski at value 0 in ${opts.from} → only 3–4 real bars, the chart looks broken and half-empty.
  • RIGHT: fill ${opts.from} with the entities that ACTUALLY led the metric THEN — the genuine top ${opts.topN}+ of THAT era, each with its real value — and let modern names ENTER the race only in the later keyframes, at the year they truly start competing (their first appearance is simply their first keyframe, never a 0 row earlier).
  ROLLING ROSTER: supply a LARGE pool of REAL, widely-recognised names (~2–3× the ${opts.topN} visible bars, up to ~40) spanning ALL eras of the span, so that in EVERY keyframe at least ${opts.topN} of them have real non-zero values; as era leaders fade and newer ones rise, the count of real bars never drops below ${opts.topN}. NEVER invent or pad with obscure filler names to hit the count — if you genuinely cannot name ${opts.topN} real entities for an early year, include as many real ones as exist and they will fill the chart.`
  }
- ${
    opts.allTime
      ? `ALL-TIME ranking: once a competitor appears, KEEP it listed at its final/peak value in EVERY later keyframe — it never vanishes, only overtaken by RANK. Peak fortunes and cumulative records PERSIST to the end.`
      : `TOP-EACH-MOMENT (a live snapshot — this is NOT an all-time ranking): show who genuinely ranks AT EACH TIME. For LIVE/fluctuating values (net worth, market cap, transfer value, ELO), once a competitor is clearly past their peak — they died, declined, or were overtaken and are no longer near the top — DROP them from the later keyframes (simply stop listing them) so the current leaders compete and the race keeps MOVING. Do NOT freeze an old leader at a flat value forever (it makes the race stall, e.g. stuck on a 1900s tycoon for a century). Fresh names rise to replace them. (CUMULATIVE metrics — career goals, total titles — only ever rise, so KEEP those record-holders; this drop-off is only for live/fluctuating values.)`
  }
${
    opts.worldwide
      ? `- WORLDWIDE COVERAGE (THE REQUEST IS GLOBAL — do not skew to one country): the roster MUST reflect the genuinely top entities FROM AROUND THE WORLD in each era, not just the USA/the West (which are the easiest to recall). In EVERY era include the real international leaders who legitimately ranked — e.g. for worldwide WEALTH, history's richest were often NOT American (the Nizam of Hyderabad was the world's richest man in the 1940s; Japan's Yoshiaki Tsutsumi & Taikichiro Mori were Forbes world #1 in the late 1980s–90s; Li Ka-shing, the Sultan of Brunei, the Rothschilds, Henri Deterding, Calouste Gulbenkian, and today Bernard Arnault, Mukesh Ambani, Lakshmi Mittal, Gautam Adani, Amancio Ortega). Rank STRICTLY by real value — never drop a legitimately higher-ranked non-US entity to make room for a lower-ranked US one. Aim for a genuine mix of countries/regions across the span. Set each entity's "country" correctly so the flags show that mix.
${opts.rosterNotes ? `  ROSTER TO DRAW FROM (real international names for this topic — include those that genuinely rank, add others you know): ${opts.rosterNotes}\n` : ""}`
      : ""
  }- HISTORICAL VALIDITY: an entity must NOT appear in any keyframe before it existed (e.g. no Ottoman Empire before ~1300, no USA before 1776, no Germany before 1871, a footballer only during their career) and not after it dissolved/retired. Use period-appropriate entities.
- ${opts.period ? `Use 8–16 keyframes stepping through ${opts.period} at ${opts.unit || "week"} granularity (each with its "label").` : "Use 14–24 keyframes (max 28) spaced across the full span so the race moves believably; more for longer spans."}
- Every values[].name must EXACTLY match an entities[].name. Give each a DISTINCT high-contrast hex color. Use widely-recognised names.
- For EACH entity set its "country" field = the ISO-3166 alpha-2 (lowercase) of its origin (company HQ, person's nationality) — e.g. Apple→"us", Mbappé→"fr", Toyota→"jp". This shows a small flag of where it's from.
- Be exact with the most recent / present-day standing.

${opts.current ? `CURRENT STANDINGS — the EXACT present-day reality as of ${opts.nowLabel}, freshly researched. The FINAL keyframe (${opts.to}) MUST match these latest figures for the present-day leaders; do NOT override them with older remembered values:\n${opts.current}\n\n` : ""}${opts.anchor ? `AUTHORITATIVE ANCHORS (real World Bank actuals, NOMINAL current-US$, in the SAME units you must output). Match these for the listed years, and CRUCIALLY keep the SAME measure for ALL years — figures BEFORE the earliest anchor year must be SMALLER than that anchor and trend smoothly into it with NO jump or discontinuity (e.g. if US 1960 ≈ 543,000 (millions), then US 1929 must be far lower like ~100,000, not higher). Do NOT switch to inflation-adjusted or PPP dollars for the historical part.\n${opts.anchor}\n` : ""}RESEARCH NOTES:
${opts.context || "(none — use well-established knowledge; do not fabricate precision)"}`;
}

/** Human description of the output scale + a concrete calibration example. */
function scaleHintFor(money: boolean, scale: DisplayScale, valueLabel: string, suffix: string): string {
  if (money) {
    const names: Record<DisplayScale, string> = { raw: "actual US dollars", K: "thousands of USD", M: "millions of USD", B: "billions of USD", T: "trillions of USD" };
    const ref = (28.75e12 / SCALE_DIV[scale]).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `Output every value as a NUMBER in ${names[scale]} (calibration: a $28.75 trillion economy = ${ref}). Do NOT include the currency symbol or commas in the number.`;
  }
  return `Output every value as the actual ${valueLabel || "figure"}${suffix ? ` (unit: ${suffix.trim()})` : ""} as a plain number.`;
}

/* ── research: ONE web search per generation (conserves Tavily quota). Advanced
 *  depth returns rich content with REAL numbers — both historical AND current —
 *  so it grounds the whole race (routing, story, and the up-to-the-moment value). ── */
async function research(request: string, nowLabel: string): Promise<string> {
  if (!hasSearch()) return "";
  const r = await webSearch(`${request} — full ranking over time with historical AND exact CURRENT figures as of ${nowLabel} (with numbers)`, { depth: "advanced", maxResults: 6 }).catch(() => null);
  if (!r) return "";
  const lines: string[] = [];
  const seen = new Set<string>();
  if (r.answer) lines.push(`CURRENT (${nowLabel}): ${r.answer}`);
  for (const x of r.results.slice(0, 6)) {
    if (seen.has(x.url)) continue;
    seen.add(x.url);
    lines.push(`• ${x.title}: ${x.content}`);
  }
  return lines.join("\n").slice(0, 9000);
}

/* ── targeted PRESENT-DAY research: the broad pass often misses the EXACT current
 *  figure (e.g. a footballer's live goal tally — the model's training cutoff is
 *  stale), so this focused advanced search fetches the up-to-the-moment top values
 *  to lock the FINAL keyframe to today's reality. ── */
async function currentStandings(title: string, valueLabel: string, nowLabel: string, named?: string[]): Promise<string> {
  if (!hasSearch()) return "";
  const who = named && named.length ? named.join(", ") : "EACH of the present-day top contenders (name every one of the current leaders with their own number)";
  const q = `${title}: the EXACT up-to-date ${valueLabel || "figures"} as of ${nowLabel} for ${who} — each one's precise current number RIGHT NOW (latest live total, not a historical or season figure)`;
  const r = await webSearch(q, { depth: "advanced", maxResults: 8 }).catch(() => null);
  if (!r) return "";
  const lines: string[] = [];
  const seen = new Set<string>();
  if (r.answer) lines.push(r.answer);
  for (const x of r.results.slice(0, 8)) {
    if (seen.has(x.url)) continue;
    seen.add(x.url);
    lines.push(`• ${x.title}: ${x.content}`);
  }
  return lines.join("\n").slice(0, 6000);
}

/** Compact World Bank "anchor" (a few sampled years' top values) to ground the brain. */
async function wbAnchor(key: IndicatorKey, from: number, to: number, scale?: DisplayScale): Promise<string> {
  try {
    const wb = await buildWorldBankRace({ indicatorKey: key, from: Math.max(1960, from), to: Math.min(WB_LATEST, to), topN: 12, scale });
    if (!wb || wb.keyframes.length < 2) return "";
    const kfs = wb.keyframes;
    const pick = [kfs[0], kfs[Math.floor(kfs.length / 2)], kfs[kfs.length - 1]];
    const suffix = wb.unitSuffix || "";
    const prefix = wb.unitPrefix || "";
    return pick
      .map((k) => {
        const top = [...k.values].sort((a, b) => b.value - a.value).slice(0, 10);
        return `${k.time}: ` + top.map((v) => `${v.name} ${prefix}${Math.round(v.value).toLocaleString()}${suffix}`).join(", ");
      })
      .join("\n");
  } catch {
    return "";
  }
}

/* ── normalization (the renderer must never see malformed data) ────────────────── */
function cleanEvents(events: RaceEventRaw[] | undefined): RaceEventRaw[] {
  return (events || [])
    .filter((e) => e && e.title && Number.isFinite(Number(e.time)))
    .map((e) => ({
      time: Number(e.time),
      title: String(e.title).trim(),
      description: String(e.description || "").trim(),
      label: typeof e.label === "string" && e.label.trim() ? e.label.trim().slice(0, 40) : undefined,
      partyCodes: (e.partyCodes || []).map((c) => String(c).toLowerCase().trim()).filter((c) => ISO2.test(c)).slice(0, 8),
      vsCodes: (e.vsCodes || []).map((c) => String(c).toLowerCase().trim()).filter((c) => ISO2.test(c)).slice(0, 8),
      subjects: (e.subjects || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 4),
    }))
    .sort((a, b) => a.time - b.time)
    .slice(0, 50);
}

/**
 * SUB-YEAR STORY: the plan writes the beats with YEAR times, but a sub-year window's
 * keyframes use ascending INDEX times — so the beats would never match the playhead
 * (they'd freeze on beat 0). Re-time each beat, IN the plan's chronological order,
 * evenly across the keyframe index span so the story PROGRESSES through the race
 * (beat 0 at the start, the rest spaced through the window). Each beat also gets a
 * `label` (its point in the window, from the nearest keyframe) for the review sheet /
 * data document. The rendered story panel itself still shows the keyframe label.
 */
function retimeWindowEvents(events: RaceEventRaw[], keyframes: { time: number; label?: string }[]): RaceEventRaw[] {
  const first = keyframes[0].time;
  const last = keyframes[keyframes.length - 1].time;
  const span = last - first;
  const m = events.length;
  const labelAt = (t: number): string | undefined => {
    let lab: string | undefined;
    for (const k of keyframes) if (k.time <= t + 1e-9) lab = k.label;
    return lab ?? keyframes[keyframes.length - 1].label;
  };
  return events.map((e, i) => {
    const t = m <= 1 || span <= 0 ? first : first + (i / m) * span;
    return { ...e, time: t, label: e.label || labelAt(t) };
  });
}

function normalize(raw: RaceRaw): RaceRaw {
  const seen = new Set<string>();
  const entities = (raw.entities || [])
    .filter((e) => e && e.name && !seen.has(e.name) && seen.add(e.name))
    .map((e, i) => {
      const cc = String(e.country || "").toLowerCase().trim();
      return {
        name: e.name.trim(),
        color: HEX.test(e.color || "") ? (e.color!.startsWith("#") ? e.color! : "#" + e.color!) : PALETTE[i % PALETTE.length],
        kind: e.kind,
        country: ISO2.test(cc) ? cc : undefined,
        // only auto-attach a flag for country entities; logos/photos are resolved client-side
        image: e.image || (e.kind && e.kind !== "country" ? undefined : flagUrlForName(e.name)) || undefined,
      };
    });
  const names = new Set(entities.map((e) => e.name));
  // Rescue near-miss name mismatches between values[].name and entities[].name (a
  // stray space / case / apostrophe difference used to make normalize DROP every
  // value → 0 keyframes → the "couldn't build that one" failure). Remap by a
  // normalized key back to the canonical entity name.
  const nkey = (s: string) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/['’".]/g, "").trim();
  const canon = new Map<string, string>();
  for (const e of entities) if (!canon.has(nkey(e.name))) canon.set(nkey(e.name), e.name);
  const keyframes = (raw.keyframes || [])
    .map((k) => {
      const seenV = new Set<string>();
      const values = (k.values || [])
        .map((v) => {
          if (!v || !Number.isFinite(Number(v.value))) return null;
          const nm = names.has(v.name) ? v.name : canon.get(nkey(v.name));
          if (!nm || seenV.has(nm)) return null;
          seenV.add(nm);
          return { name: nm, value: Math.max(0, Number(v.value)) };
        })
        .filter((v): v is { name: string; value: number } => v !== null);
      return {
        time: Number(k.time),
        label: typeof k.label === "string" && k.label.trim() ? k.label.trim().slice(0, 40) : undefined,
        values,
      };
    })
    .filter((k) => Number.isFinite(k.time) && k.values.length)
    .sort((a, b) => a.time - b.time);
  return {
    title: raw.title || "Stat Battle",
    subtitle: raw.subtitle,
    valueLabel: raw.valueLabel || "",
    unitPrefix: raw.unitPrefix || "",
    unitSuffix: raw.unitSuffix || "",
    timeLabel: raw.timeLabel || "Year",
    decimals: Number.isFinite(raw.decimals as number) ? Math.max(0, Math.min(3, raw.decimals as number)) : 1,
    topN: raw.topN && raw.topN >= 3 ? Math.min(25, raw.topN) : 12,
    source: raw.source || "",
    entities,
    keyframes,
    events: cleanEvents(raw.events),
  };
}

/** Verified World Bank race for an indicator (no brain needed). */
async function buildVerified(key: IndicatorKey, request: string): Promise<RaceRaw | null> {
  const { from, to } = detectYears(request, NOW);
  const { scale, decimals } = detectScale(request);
  const wbFrom = Math.max(1960, from);
  const wbTo = Math.min(WB_LATEST, Math.max(to > WB_LATEST ? WB_LATEST : to, wbFrom + 1));
  const wb = await buildWorldBankRace({ indicatorKey: key, from: wbFrom, to: wbTo, topN: 12, scale, decimals });
  if (!wb) return null;
  const ind = INDICATORS[key];
  return { ...wb, title: ind.headline, subtitle: `${ind.valueLabel} · ${wbFrom}–${wbTo}` };
}

/** Offline / no-key default: real World Bank GDP if reachable, else the static set. */
async function defaultRace(): Promise<RaceRaw> {
  try {
    const v = await buildVerified("gdp", "gdp 1960 to today");
    if (v) return v;
  } catch {
    /* fall through to static */
  }
  return GDP_FALLBACK;
}

export async function POST(req: NextRequest) {
  let body: { request?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const request = (body.request || "").trim().slice(0, INPUT_CAPS.statsRequest);
  const guess = guessIndicatorKey(request); // keyword → verified indicator (no AI)

  if (!request) {
    return NextResponse.json(normalize(await defaultRace()));
  }

  // No brain: still serve VERIFIED data for catalogue topics (no story); else retry.
  if (!hasAnthropic()) {
    if (guess) {
      const v = await buildVerified(guess, request).catch(() => null);
      if (v) return NextResponse.json(normalize(v));
    }
    return NextResponse.json({ error: true }, { status: 200 });
  }

  // A likely-CUSTOM battle (no catalogue keyword match) will need Opus — the most
  // intense compute we run. PRE-CHECK that the user can afford the FULL build BEFORE
  // we spend anything on research/planning, so heavy AI never runs for a request
  // that can't complete (and they get a clear "this feature is power-intensive"
  // prompt to top up). Catalogue topics (cheap, ~stats_plan) skip this.
  if (!guess) {
    const avail = await creditsAvailable();
    if (avail !== null && avail < STATS_OPUS_FLOOR) {
      return NextResponse.json({ error: "credits", feature: "stats", balance: avail }, { status: 402 });
    }
  }

  // Meter the BASE build (Sonnet routing/plan + Tavily research). Catalogue topics
  // that resolve to verified World Bank data are charged only this; a custom battle
  // additionally pays for Opus below.
  const base = await chargeCredits("stats_plan", ACTION_COSTS.stats_plan, { request: request.slice(0, 80) }, user);
  if (!base.ok) return chargeError(base);
  let opusCharged = 0; // the ACTUAL credits taken for the Opus step (0 = not charged)
  let opusInvoked = false; // true once the Opus call actually RAN (so we never refund real compute)

  try {
    const context = await research(request, NOW_LABEL);

    const { object: plan } = await generateObject({
      model: MODELS.genius(),
      schema: planSchema,
      system: planSystem(),
      // Give the model TODAY'S date (in the user message, so the cached system prompt
      // stays byte-stable) so relative windows ("this month", "last month") and the
      // present-day story resolve to the real current date — not the model's stale sense of "now".
      prompt: `Today's date: ${NOW_LABEL}.\n\n${request}${context ? `\n\nResearch notes (for routing + the story):\n${context}` : ""}`,
      temperature: 0.2,
      maxRetries: 3,
      maxTokens: 12000, // the long-span event story can be many beats
    });

    // The model usually returns the years, but can omit them (esp. on long prompts) —
    // fall back to the years parsed deterministically from the request text.
    const dy = detectYears(request, NOW);
    // SUB-YEAR WINDOW: a prompt scoped to one month/quarter/year (e.g. "May 2026")
    // races INSIDE that window. We detect it DETERMINISTICALLY from the request text
    // (detectWindow) and only fall back to the model's own timeUnit/period when the
    // text is less explicit — so an explicit window can NEVER be widened into an
    // all-time race (the failure users saw), and from=to is pinned to that year.
    const det = detectWindow(request);
    const modelSub = !!plan.timeUnit && plan.timeUnit !== "year" && !!(plan.period && plan.period.trim());
    const subYear = !!det || modelSub;
    const timeUnit = det ? det.unit : plan.timeUnit && plan.timeUnit !== "year" ? plan.timeUnit : "week";
    const period = det ? det.period : subYear ? plan.period!.trim().slice(0, 60) : undefined;
    const periodYear = det ? det.year : plan.toYear ?? plan.fromYear ?? dy.to;
    const fromY = subYear ? periodYear : (plan.fromYear ?? dy.from);
    const toY = subYear ? periodYear : (plan.toYear ?? dy.to);
    const from = Math.min(fromY, toY);
    const to = Math.max(fromY, toY);
    const topN = plan.topN || 12;
    const key = plan.indicatorKey as IndicatorKey;
    const { scale, decimals } = detectScale(request);
    const named = (plan.namedEntities || []).map((n) => n.trim()).filter(Boolean);

    // World Bank is used ONLY when the whole span is modern (≥1960), the user didn't
    // ask for a year beyond real data, and no specific competitors were named.
    // A sub-year window is always a custom topic → never the (annual) WorldBank path.
    const wbEligible =
      !subYear &&
      plan.mode === "worldbank" &&
      INDICATOR_KEYS.includes(key) &&
      from >= 1960 &&
      !wantsBeyondWB(request, NOW) &&
      named.length < 2;

    let race: RaceRaw | null = null;

    if (wbEligible) {
      try {
        race = await buildWorldBankRace({ indicatorKey: key, from, to: Math.min(WB_LATEST, to), topN, scale, decimals });
      } catch {
        race = null;
      }
    }

    // Web-researched model path — honors the EXACT span, named entities, projections.
    if (!race) {
      // Custom data needs Opus. GENEROUS charge: a user with at least HALF the list price
      // (STATS_OPUS_FLOOR total; the 40 plan is already charged, so the Opus step floor is
      // STATS_OPUS_FLOOR − stats_plan) may proceed — it then drains the rest of their
      // credits, capped at stats_opus. Below the floor → 402 (refund the base). Atomic &
      // non-negative, so heavy Opus can never run for a user under the floor.
      const opus = await chargeCapped("stats_opus", ACTION_COSTS.stats_opus, STATS_OPUS_FLOOR - ACTION_COSTS.stats_plan, {}, user);
      if (!opus.ok) {
        await refund(user.id, ACTION_COSTS.stats_plan, "stats_plan");
        return chargeError(opus);
      }
      opusCharged = opus.charged; // the ACTUAL amount taken (≤ stats_opus; the remainder when draining to 0)
      const money = plan.unitPrefix === "$";
      // EXACT BY DEFAULT: the display scale is deterministic from the request text (raw
      // unless the user literally said millions/billions/etc.), so unspecified figures
      // render FULL and un-abbreviated (no "0.6B", no "1,234M").
      const userMag = /\b(trillion|billion|million|thousand)s?\b/i.test(request);
      const chosenScale: DisplayScale = scale || "raw";
      const unitPrefix = plan.unitPrefix || "";
      // Money → the magnitude letter for the chosen scale. Non-money → keep the model's
      // REAL unit (%, pts, yrs, goals…) but DROP a stray magnitude ("M"/"million") the
      // user never asked for, so plain counts show full exact integers, not "1,234M".
      const rawSuffix = (plan.unitSuffix || "").trim();
      const isMagSuffix = /^(m|k|b|t|mn|bn|mm|million|billion|thousand|trillion)s?\.?$/i.test(rawSuffix);
      const unitSuffix = money ? SCALE_SUFFIX[chosenScale] : !userMag && isMagSuffix ? "" : rawSuffix;
      const dec = decimals ?? plan.decimals ?? 0; // full integers by default (no "0.6B" rounding)
      const wantExact = !money && chosenScale === "raw" && !userMag;
      const scaleHint = wantExact
        ? `Output every value as the FULL, EXACT ${plan.valueLabel || "figure"} — the complete whole number with ALL of its digits (e.g. 1750000000, NEVER 1750, 1.75B, or "1750 million"). Do NOT scale down, round to millions/billions, or attach a magnitude suffix.`
        : scaleHintFor(money, chosenScale, plan.valueLabel || "", unitSuffix);

      const anchorKey = INDICATOR_KEYS.includes(key) ? key : guess; // anchor GDP/etc. to WB reality
      // Run the WB anchor + a TARGETED present-day search together (one extra search,
      // worth it for accuracy): the broad pass grounds history, this nails the exact
      // up-to-the-minute figures so the final keyframe matches reality (not training).
      const reachesToday = to >= NOW;
      const [anchor, current] = await Promise.all([
        anchorKey && !subYear ? wbAnchor(anchorKey, from, to, chosenScale) : Promise.resolve(""),
        reachesToday ? currentStandings(plan.title, plan.valueLabel || "", subYear ? period! : NOW_LABEL, named) : Promise.resolve(""),
      ]);

      // The SERIES (the actual historical data + present-day values) is the hardest
      // factual task, so it runs on the strongest model (MODELS.max = Opus) for the
      // best recall/accuracy. The plan/routing/story stays on genius (Sonnet).
      const series = (
        await generateObject({
          model: MODELS.max(),
          schema: seriesSchema,
          system: seriesSystem({ from, to, topN, nowLabel: NOW_LABEL, named, context, anchor, current, scaleHint, worldwide: wantsWorldwide(request), rosterNotes: plan.rosterNotes || "", allTime: wantsAllTime(request), period, unit: subYear ? timeUnit : undefined }),
          prompt: subYear
            ? `${request}\nProduce the ranking series for EXACTLY ${period} — step at ${timeUnit} granularity and put a "label" (the on-screen time) on EVERY keyframe. The final keyframe carries the accurate standings for ${period}. Do NOT span any other year.`
            : `${request}\nProduce the ranking-over-time series for EXACTLY ${from} to ${to}. The final keyframe is TODAY (${NOW_LABEL}) with current real values.`,
          // NOTE: MODELS.max() (Opus) rejects the `temperature` param — omit it here.
          maxRetries: 3,
          maxTokens: 24000, // many entities × keyframes of JSON — never truncate the series
        })
      ).object;
      opusInvoked = true; // Opus produced output — its compute cost is real, never refund it

      const ek = plan.entityKind;
      const kindOf = (name: string): EntityKind =>
        ek === "mixed" ? (flagUrlForName(name) ? "country" : "other") : ek === "country" || ek === "company" || ek === "person" ? ek : "other";
      race = {
        title: plan.title,
        valueLabel: plan.valueLabel || "",
        unitPrefix,
        unitSuffix,
        timeLabel: subYear ? "Date" : "Year",
        decimals: dec,
        topN: named.length >= 2 ? named.length : topN,
        source: hasSearch() ? "Researched data" : "",
        entities: (series.entities || []).map((e) => ({ name: e.name, color: e.color || "", kind: kindOf(e.name), country: e.country })),
        keyframes: series.keyframes ?? series.values ?? [],
      };
    }

    // Merge the plan's headline + story onto the data.
    race.title = plan.title || race.title;
    race.subtitle = plan.subtitle || race.subtitle;
    race.events = (plan.events as RaceEventRaw[]) || [];
    // A windowed race must never read "all-time / cumulative" (it misdescribes the race
    // and implies a frozen chart). Strip those qualifiers and make sure the window shows
    // in the subtitle — belt-and-braces on top of the model guidance above.
    if (subYear && period) {
      const strip = (s?: string) => (s || "").replace(/\b(all[-\s]?time|cumulative|lifetime)\b/gi, "").replace(/\s{2,}/g, " ").replace(/^[\s·\-–—]+|[\s·\-–—]+$/g, "").trim();
      race.title = strip(race.title) || race.title;
      race.valueLabel = strip(race.valueLabel) || race.valueLabel;
      // If we DETERMINISTICALLY forced the window but the model titled it with a
      // DIFFERENT date (e.g. it guessed "June 2025" for "this month"), correct the
      // title to the real window so the headline never contradicts the race.
      if (det && !race.title.toLowerCase().includes(period.toLowerCase()) && /\b(?:19|20)\d{2}\b/.test(race.title)) {
        const base = race.title
          .replace(/\s*[—–-]\s*[^—–-]*\b(?:19|20)\d{2}\b[^—–-]*$/, "")
          .replace(/\s+(?:of|in|for|during)\s+[^,]*\b(?:19|20)\d{2}\b\s*$/i, "")
          .replace(/\s*\(\s*[^)]*\b(?:19|20)\d{2}\b[^)]*\)\s*$/, "")
          .trim()
          .replace(/[—–\-·,]\s*$/, "")
          .trim();
        if (base) race.title = `${base} — ${period}`;
      }
      const sub = strip(race.subtitle);
      const showsPeriod = sub && sub.toLowerCase().includes(period.toLowerCase());
      race.subtitle = showsPeriod ? sub : race.valueLabel ? `${race.valueLabel} · ${period}` : period;
    }

    const norm = normalize(race);
    // If the race runs to the current year, nudge the LAST keyframe's time to TODAY
    // (fractional), so the counter ends at the current month (e.g. "Jun 2026") not January.
    // Skip for a labelled sub-year window — its on-screen time comes from the label, and
    // its `time` values are plain indices (nudging them would distort the spacing).
    const lastKf = norm.keyframes[norm.keyframes.length - 1];
    if (lastKf && !lastKf.label && Math.round(lastKf.time) === NOW && NOW_FRAC > lastKf.time) lastKf.time = NOW_FRAC;
    // Sub-year window: re-time the story beats onto the keyframe index span so they
    // progress through the race (they carry year times from the plan) and fill the
    // info panel with the window's real events instead of leaving it empty.
    if (subYear && norm.events && norm.events.length && norm.keyframes.length >= 2) {
      norm.events = retimeWindowEvents(norm.events, norm.keyframes);
    }
    if (norm.entities.length >= 2 && norm.keyframes.length >= 2) return NextResponse.json(norm);
  } catch (e) {
    console.error("[stats] build failed:", e);
  }

  // The brain failed — refund the cheap routing fee, but KEEP the Opus charge if
  // Opus actually ran (real compute; prevents free-Opus abuse via prompts crafted
  // to fail normalization). Only refund Opus when it was charged but never ran.
  await refund(user.id, ACTION_COSTS.stats_plan, "stats_plan");
  if (opusCharged > 0 && !opusInvoked) await refund(user.id, opusCharged, "stats_opus");
  if (guess) {
    const v = await buildVerified(guess, request).catch(() => null);
    if (v) return NextResponse.json(normalize(v));
  }
  return NextResponse.json({ error: true }, { status: 200 });
}
