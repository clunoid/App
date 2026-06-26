import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { PALETTE, type EntityKind, type RaceEventRaw, type RaceRaw } from "@/lib/stats/types";
import { GDP_FALLBACK } from "@/lib/stats/fallback";
import { INDICATORS, INDICATOR_KEYS, indicatorMenu, guessIndicatorKey, detectYears, SCALE_DIV, SCALE_SUFFIX, type DisplayScale, type IndicatorKey } from "@/lib/stats/indicators";
import { buildWorldBankRace } from "@/lib/stats/sources/worldbank";
import { flagUrlForName } from "@/lib/stats/flags";
import { hasSearch, webSearch } from "@/lib/data/search";

export const runtime = "nodejs";
export const maxDuration = 180; // the brain may research + build long historical spans — give it room

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
  return {}; // → the indicator's default (money: millions)
}

/** Did the user explicitly TYPE a year beyond World Bank's coverage (wants projection)? */
function wantsBeyondWB(request: string): boolean {
  const yrs = (request.match(/\b(1[5-9]\d{2}|20\d{2})\b/g) || []).map(Number);
  return yrs.some((y) => y > WB_LATEST);
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
  fromYear: z.number().int().describe("EXACT start the user asked for (e.g. 1560, or 1 for '1 AD'). Only default (≈1960) when the user gave none."),
  toYear: z.number().int().describe("EXACT end the user asked for (e.g. 2026). Default the current year when none given."),
  topN: z.number().int().min(3).max(25).describe("How many bars are VISIBLE at once. Use the user's number if they gave one (e.g. 'top 15'→15, '5 players'→5); otherwise pick a natural count for the topic (≈10–15). This is the visible window, NOT the total roster."),
  entityKind: z.enum(["country", "company", "person", "mixed", "other"]).describe("What the competitors ARE — drives their bar media: country→flag, company→logo, person→photo. 'mixed' if it varies."),
  namedEntities: z.array(z.string()).optional().describe("If the user EXPLICITLY listed competitors (e.g. 'Elon Musk vs Jeff Bezos vs ...'), list them EXACTLY here; else omit."),
  events: z
    .array(
      z.object({
        time: z.number().describe("Year this beat begins (within the range, ascending)."),
        title: z.string().describe("Bold era/event headline."),
        description: z.string().describe("1–2 factual sentences about what happened and its effect on the ranking."),
        partyCodes: z.array(z.string()).optional().describe("ISO-3166 alpha-2 codes (lowercase) of the countries involved → shown as flags. Use for country topics / wars."),
        vsCodes: z.array(z.string()).optional().describe("ONLY for conflicts: the opposing side's ISO-3166 alpha-2 codes."),
        subjects: z.array(z.string()).optional().describe("For NON-country topics: 1–3 entity/person/company names whose photo/logo best illustrates this beat (e.g. ['Kylian Mbappé'] or ['Tesla, Inc.']). Names should match entities where possible."),
      })
    )
    .min(3)
    .max(50)
    .describe("The real story across the FULL span — major, factual events that explain the movement, ascending by time. Roughly one beat per major turning point (more for longer spans)."),
});

function planSystem(): string {
  return `You plan an animated bar-chart race ("stat battle") AND write its factual event story. Numbers come from VERIFIED sources, so focus on (a) routing and (b) an accurate narrative.

ROUTING:
- mode="worldbank" ONLY when it's a by-COUNTRY ranking that matches a catalogue indicator AND the whole span is modern (fromYear ≥ 1960). Pick the EXACT indicatorKey:
${indicatorMenu()}
- mode="model" for EVERYTHING ELSE — historical spans (pre-1960, e.g. "GDP 1560–2026", "armies 1 AD–2026"), people/companies/clubs (net worth, market cap, transfer values), sports, or any custom list. These get web-researched.

HONOR THE USER EXACTLY — never override an explicit request:
- fromYear/toYear = EXACTLY the years asked (1560, 1 for "1 AD", 2026, …). Only default (fromYear≈1960, toYear=${NOW}) when the user gives none.
- topN = the user's requested visible-bar count if given (e.g. "top 15"→15, "5 players"→5); else a natural number for the topic.
- If the user NAMES specific competitors (e.g. "Elon Musk vs Jeff Bezos vs Bernard Arnault"), put them verbatim in namedEntities and set topN to that count.
- entityKind: country (flags), company (logos), person (photos), or mixed.
- Units — show FULL figures, NEVER abbreviated/rounded (no "0.6B"): national GDP → displayScale "M" (full millions, e.g. 28750956); company market-cap → "raw" (full dollars, e.g. 757423097909); personal net worth → "M" (full millions, e.g. 72751); ratings/counts → "raw". decimals 0 always (full integers). Only use B/T if the user EXPLICITLY asks to abbreviate.

EVENT STORY: the REAL, well-established events across the WHOLE span that explain the movement (wars, crashes, oil shocks, reforms, booms, a person's company IPO, a record transfer). Each beat: punchy title, 1–2 truthful sentences, and media — for COUNTRY topics use partyCodes (flags; vsCodes only for a conflict's other side); for PEOPLE/COMPANY topics use subjects (the names whose photo/logo illustrates the beat). Be exact with dates/facts.`;
}

/* ── 2. MODEL DATA: web-researched series for anything the catalogue can't cover ── */
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
    .describe("EVERY competitor that appears in ANY keyframe across the whole span (a rolling roster — far more than are visible at once); distinct, readable colors."),
  keyframes: z
    .array(
      z.object({
        time: z.number().describe("The year/time, ascending across keyframes."),
        values: z.array(z.object({ name: z.string().describe("MUST match an entities[].name exactly."), value: z.number() })).min(2).max(44),
      })
    )
    .min(2)
    .max(60)
    .describe("Chronological, ascending; FIRST keyframe = the exact start year, LAST = the exact end year. Each keyframe lists ONLY the entities that genuinely exist/compete that year."),
});

function seriesSystem(opts: { from: number; to: number; topN: number; nowLabel: string; named?: string[]; context: string; anchor: string; scaleHint: string }): string {
  return `You assemble ACCURATE ranking-over-time data for an animated bar-chart race. Accuracy is paramount — use the research notes + authoritative anchors below; otherwise use the most credible scholarly figures (e.g. Maddison Project for historical GDP, IMF/World Bank for recent economics, Forbes for net worth, Transfermarkt for football values, recognised historical scholarship for army sizes). NEVER invent fake precision.

REQUIREMENTS:
- Span EXACTLY ${opts.from} to ${opts.to}: the FIRST keyframe's time = ${opts.from}, the LAST = ${opts.to}. For years beyond the latest real data, give the best current projection/estimate; for ancient/historical years, the best scholarly estimate.
- ${opts.scaleHint}
- METRIC DEFINITION: use the single most standard, widely-cited definition of the metric and apply it CONSISTENTLY across every year (e.g. army size = ACTIVE military personnel, not reserves or total available manpower; GDP = nominal). State nothing — just be consistent.
- PRESENT-DAY ACCURACY (MOST IMPORTANT): the FINAL keyframe represents TODAY (${opts.nowLabel}) — its ranking AND values MUST equal the CURRENT real-world figures as of now (use the "LATEST STANDINGS" research as the source of truth; e.g. a company's live market cap today). Use PRECISE real figures, NOT suspiciously round numbers — real values look like 4,824,531,000,000, never exactly 3,300,000,000,000. Sanity-check against common knowledge (today's biggest economies are USA>China>Germany/Japan/India/UK; largest active militaries China/India/USA/NK/Russia).
- ${
    opts.named && opts.named.length >= 2
      ? `Use EXACTLY these competitors (no more, no fewer): ${opts.named.join(", ")}. Include every one in every keyframe of the range.`
      : `ROLLING ROSTER: provide a LARGE pool of entities (aim for ~2–3× the ${opts.topN} visible bars, up to ~40) so that as leaders fade/retire/are overtaken, FRESH ones rise to replace them — a real race, never a static set. Only include an entity in a keyframe for years it actually competes; a value of essentially 0 means "not present" — simply OMIT it from that keyframe rather than listing 0 (an entity that retires/dissolves should DISAPPEAR, replaced by the next real competitor).`
  }
- HISTORICAL VALIDITY: an entity must NOT appear in any keyframe before it existed (e.g. no Ottoman Empire before ~1300, no USA before 1776, no Germany before 1871, a footballer only during their career) and not after it dissolved/retired. Use period-appropriate entities.
- Use 14–24 keyframes (max 28) spaced across the full span so the race moves believably; more for longer spans.
- Every values[].name must EXACTLY match an entities[].name. Give each a DISTINCT high-contrast hex color. Use widely-recognised names.
- For EACH entity set its "country" field = the ISO-3166 alpha-2 (lowercase) of its origin (company HQ, person's nationality) — e.g. Apple→"us", Mbappé→"fr", Toyota→"jp". This shows a small flag of where it's from.
- Be exact with the most recent / present-day standing.

${opts.anchor ? `AUTHORITATIVE ANCHORS (real World Bank actuals, NOMINAL current-US$, in the SAME units you must output). Match these for the listed years, and CRUCIALLY keep the SAME measure for ALL years — figures BEFORE the earliest anchor year must be SMALLER than that anchor and trend smoothly into it with NO jump or discontinuity (e.g. if US 1960 ≈ 543,000 (millions), then US 1929 must be far lower like ~100,000, not higher). Do NOT switch to inflation-adjusted or PPP dollars for the historical part.\n${opts.anchor}\n` : ""}RESEARCH NOTES:
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

/* ── research: web search for grounding (kept to ONE query to conserve search quota;
 *  the model path runs a second, targeted "current value" search) ── */
async function research(request: string): Promise<string> {
  if (!hasSearch()) return "";
  const results = [await webSearch(`${request} — figures by year and current values`).catch(() => null)];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!r) continue;
    if (r.answer && !seen.has(r.answer)) {
      seen.add(r.answer);
      lines.push(r.answer);
    }
    for (const x of r.results.slice(0, 4)) {
      const line = `• ${x.title}: ${x.content}`;
      if (!seen.has(x.url)) {
        seen.add(x.url);
        lines.push(line);
      }
    }
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
      partyCodes: (e.partyCodes || []).map((c) => String(c).toLowerCase().trim()).filter((c) => ISO2.test(c)).slice(0, 8),
      vsCodes: (e.vsCodes || []).map((c) => String(c).toLowerCase().trim()).filter((c) => ISO2.test(c)).slice(0, 8),
      subjects: (e.subjects || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 4),
    }))
    .sort((a, b) => a.time - b.time)
    .slice(0, 50);
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
  const keyframes = (raw.keyframes || [])
    .map((k) => ({
      time: Number(k.time),
      values: (k.values || [])
        .filter((v) => v && names.has(v.name) && Number.isFinite(Number(v.value)))
        .map((v) => ({ name: v.name, value: Math.max(0, Number(v.value)) })),
    }))
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
  const request = (body.request || "").trim();
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

  try {
    const context = await research(request);

    const { object: plan } = await generateObject({
      model: MODELS.genius(),
      schema: planSchema,
      system: planSystem(),
      prompt: context ? `${request}\n\nResearch notes (for routing + the story):\n${context}` : request,
      temperature: 0.2,
      maxRetries: 3,
      maxTokens: 12000, // the long-span event story can be many beats
    });

    const from = Math.min(plan.fromYear, plan.toYear);
    const to = Math.max(plan.fromYear, plan.toYear);
    const topN = plan.topN || 12;
    const key = plan.indicatorKey as IndicatorKey;
    const { scale, decimals } = detectScale(request);
    const named = (plan.namedEntities || []).map((n) => n.trim()).filter(Boolean);

    // World Bank is used ONLY when the whole span is modern (≥1960), the user didn't
    // ask for a year beyond real data, and no specific competitors were named.
    const wbEligible =
      plan.mode === "worldbank" &&
      INDICATOR_KEYS.includes(key) &&
      from >= 1960 &&
      !wantsBeyondWB(request) &&
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
      const money = plan.unitPrefix === "$";
      // Scale is DETERMINISTIC (the brain's choice is unreliable) and always FULL — no
      // "0.6B" abbreviation. Company market-cap → raw full dollars (the classic look);
      // GDP / net worth → full millions; counts → the brain's scale. User can override.
      const chosenScale: DisplayScale = scale
        ? scale
        : money
        ? plan.entityKind === "company"
          ? "raw"
          : "M"
        : (plan.displayScale as DisplayScale) || "raw";
      const unitPrefix = plan.unitPrefix || "";
      const unitSuffix = money ? SCALE_SUFFIX[chosenScale] : plan.unitSuffix || "";
      const dec = decimals ?? plan.decimals ?? 0; // full integers by default (no "0.6B" rounding)
      const scaleHint = scaleHintFor(money, chosenScale, plan.valueLabel || "", unitSuffix);

      const anchorKey = INDICATOR_KEYS.includes(key) ? key : guess; // anchor GDP/etc. to WB reality
      const anchor = anchorKey ? await wbAnchor(anchorKey, from, to, chosenScale) : "";

      // A targeted search for TODAY's figures — the current value is the hardest to get
      // right (model knowledge lags), so ground it explicitly with up-to-the-moment data.
      let ctx = context;
      if (hasSearch()) {
        const tr = await webSearch(`${plan.title} current value ${NOW_LABEL} — today's exact figures and ranking`).catch(() => null);
        if (tr) ctx = (ctx + `\nLATEST STANDINGS (as of ${NOW_LABEL} — use these exact current figures for the final keyframe): ` + [tr.answer, ...tr.results.slice(0, 5).map((x) => `• ${x.title}: ${x.content}`)].filter(Boolean).join("\n")).slice(0, 8500);
      }

      const series = (
        await generateObject({
          model: MODELS.genius(),
          schema: seriesSchema,
          system: seriesSystem({ from, to, topN, nowLabel: NOW_LABEL, named, context: ctx, anchor, scaleHint }),
          prompt: `${request}\nProduce the ranking-over-time series for EXACTLY ${from} to ${to}. The final keyframe is TODAY (${NOW_LABEL}) with current real values.`,
          temperature: 0.2,
          maxRetries: 3,
          maxTokens: 24000, // many entities × keyframes of JSON — never truncate the series
        })
      ).object;

      const ek = plan.entityKind;
      const kindOf = (name: string): EntityKind =>
        ek === "mixed" ? (flagUrlForName(name) ? "country" : "other") : ek === "country" || ek === "company" || ek === "person" ? ek : "other";
      race = {
        title: plan.title,
        valueLabel: plan.valueLabel || "",
        unitPrefix,
        unitSuffix,
        timeLabel: "Year",
        decimals: dec,
        topN: named.length >= 2 ? named.length : topN,
        source: hasSearch() ? "Researched data" : "",
        entities: (series.entities || []).map((e) => ({ name: e.name, color: e.color || "", kind: kindOf(e.name), country: e.country })),
        keyframes: series.keyframes || [],
      };
    }

    // Merge the plan's headline + story onto the data.
    race.title = plan.title || race.title;
    race.subtitle = plan.subtitle || race.subtitle;
    race.events = plan.events as RaceEventRaw[];

    const norm = normalize(race);
    // If the race runs to the current year, nudge the LAST keyframe's time to TODAY
    // (fractional), so the counter ends at the current month (e.g. "Jun 2026") not January.
    const lastKf = norm.keyframes[norm.keyframes.length - 1];
    if (lastKf && Math.round(lastKf.time) === NOW && NOW_FRAC > lastKf.time) lastKf.time = NOW_FRAC;
    if (norm.entities.length >= 2 && norm.keyframes.length >= 2) return NextResponse.json(norm);
  } catch (e) {
    console.error("[stats] build failed:", e);
  }

  // The brain failed (transient). For catalogue topics, still return VERIFIED data.
  if (guess) {
    const v = await buildVerified(guess, request).catch(() => null);
    if (v) return NextResponse.json(normalize(v));
  }
  return NextResponse.json({ error: true }, { status: 200 });
}
