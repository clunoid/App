import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { PALETTE, type RaceEventRaw, type RaceRaw } from "@/lib/stats/types";
import { GDP_FALLBACK } from "@/lib/stats/fallback";
import { INDICATORS, INDICATOR_KEYS, indicatorMenu, guessIndicatorKey, detectYears, type DisplayScale, type IndicatorKey } from "@/lib/stats/indicators";
import { buildWorldBankRace } from "@/lib/stats/sources/worldbank";
import { flagUrlForName } from "@/lib/stats/flags";
import { hasSearch, webSearch } from "@/lib/data/search";

export const runtime = "nodejs";
export const maxDuration = 90; // real research + multi-decade data is heavier than the flags game

const HEX = /^#?[0-9a-fA-F]{6}$/;
const ISO2 = /^[a-z]{2}$/;
const NOW = new Date().getFullYear();

/** Read the display scale from the request text (deterministic, not model-guessed).
 *  Default for big figures is millions; the user can ask for exact/billions/etc. */
function detectScale(request: string): { scale?: DisplayScale; decimals?: number } {
  const s = request.toLowerCase();
  if (/\b(exact|full figures?|precise|to the (dollar|cent)|unrounded)\b/.test(s)) return { scale: "raw", decimals: 0 };
  if (/\btrillions?\b/.test(s)) return { scale: "T" };
  if (/\bbillions?\b/.test(s)) return { scale: "B" };
  if (/\bmillions?\b/.test(s)) return { scale: "M" };
  if (/\bthousands?\b/.test(s)) return { scale: "K" };
  return {}; // → the indicator's default (money: millions)
}

/* ── 1. PLAN + STORY: map the free-text request to a data plan + event timeline ── */
const planSchema = z.object({
  mode: z.enum(["worldbank", "model"]).describe("'worldbank' if a catalogue indicator below fits a by-country ranking; else 'model' for web-researched data."),
  indicatorKey: z.string().describe("One catalogue key (exact) when mode='worldbank', else 'none'."),
  title: z.string().describe("Punchy headline, e.g. \"World's Largest Economies\"."),
  subtitle: z.string().optional().describe("Range + unit note, e.g. 'Nominal GDP · 1960–2026'."),
  valueLabel: z.string().optional().describe("[model mode] what the number is, e.g. 'ELO rating'."),
  unitPrefix: z.string().optional().describe("[model] prefix e.g. '$' (empty if none)."),
  unitSuffix: z.string().optional().describe("[model] suffix e.g. ' pts', '%', 'M' (empty if none)."),
  displayScale: z.enum(["raw", "K", "M", "B", "T"]).optional().describe("How to scale big numbers; for money default 'M' (millions) unless the user asks otherwise (e.g. 'exact'→'raw', 'in billions'→'B')."),
  decimals: z.number().int().min(0).max(3).optional().describe("Decimals shown per value (money: 1; counts/ratings: 0)."),
  fromYear: z.number().int().describe("Start year (respect the user; sensible default else)."),
  toYear: z.number().int().describe("End year (default the current year)."),
  topN: z.number().int().min(5).max(20).describe("Visible bars (default 12)."),
  events: z
    .array(
      z.object({
        time: z.number().describe("Year this beat begins (within the range, ascending)."),
        title: z.string().describe("Bold era/event headline."),
        description: z.string().describe("1–2 factual sentences about what happened and its effect on the ranking."),
        partyCodes: z.array(z.string()).optional().describe("ISO-3166 alpha-2 codes (lowercase) of the main countries/side involved → shown as flags."),
        vsCodes: z.array(z.string()).optional().describe("ONLY for conflicts: the opposing side's ISO-3166 alpha-2 codes."),
      })
    )
    .min(3)
    .max(16)
    .describe("The real story across the FULL span — major, factual events that explain the movement, ascending by time."),
});

function planSystem(): string {
  return `You plan an animated bar-chart race ("stat battle") AND write its factual event story. The numbers come from VERIFIED sources, never from you, so focus on (a) routing to the right data and (b) an accurate narrative.

DATA ROUTING — prefer verified World Bank data. If the request is a by-country ranking that matches one of these indicators, set mode="worldbank" and indicatorKey to that EXACT key:
${indicatorMenu()}
Otherwise set mode="model", indicatorKey="none" (e.g. chess ELO, football clubs, companies, YouTubers — these will be web-researched).

UNITS: for money default displayScale "M" (millions, full figures) with decimals 1, UNLESS the user specifies (e.g. "exact figures"→"raw" decimals 0; "in billions"→"B"; "trillions"→"T"). Counts/ratings → decimals 0.

RANGE: respect any years the user gives. Otherwise default fromYear≈1960 (World Bank data starts ~1960) and toYear=${NOW}. topN default 12.

EVENT STORY: write the REAL, well-established events across the whole span that explain why the ranking shifts (wars, oil shocks, recessions, reforms, booms). Each beat: a punchy title, 1–2 truthful sentences, and the ISO-3166 alpha-2 flags of the countries involved (partyCodes; add vsCodes only for a conflict's opposing side). Be accurate with dates and facts.`;
}

/* ── 2. MODEL DATA: web-researched series for topics no catalogue covers ──────── */
const seriesSchema = z.object({
  entities: z
    .array(z.object({ name: z.string(), color: z.string().optional().describe("Distinct hex like '#c0392b'.") }))
    .min(2)
    .max(30)
    .describe("Every competitor that appears in ANY keyframe; distinct, readable colors."),
  keyframes: z
    .array(
      z.object({
        time: z.number().describe("The year/time, ascending across keyframes."),
        values: z.array(z.object({ name: z.string().describe("MUST match an entities[].name exactly."), value: z.number() })).min(2).max(30),
      })
    )
    .min(2)
    .max(60)
    .describe("Chronological, ascending. Sparse but enough to interpolate smoothly. Omit a name before it existed."),
});

function seriesSystem(context: string): string {
  return `You assemble ACCURATE ranking-over-time data for an animated bar-chart race. Use the research notes below as your primary source; fill gaps only with well-established facts. NEVER invent fake precision.
- Pick 8–14 entities (max 16) that genuinely led the metric across the span, including ones that entered or fell out of the top over time.
- 12–18 keyframes (max 24), ascending, spanning the FULL range; space them so values change believably. Omit a name before it existed.
- Every values[].name must exactly match an entities[].name. Give each a DISTINCT high-contrast hex color.
- Be exact with the most recent keyframe (present-day standing).

RESEARCH NOTES:
${context || "(none — use well-established knowledge; do not fabricate precision)"}`;
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
    }))
    .sort((a, b) => a.time - b.time);
}

function normalize(raw: RaceRaw): RaceRaw {
  const seen = new Set<string>();
  const entities = (raw.entities || [])
    .filter((e) => e && e.name && !seen.has(e.name) && seen.add(e.name))
    .map((e, i) => ({
      name: e.name.trim(),
      color: HEX.test(e.color || "") ? (e.color!.startsWith("#") ? e.color! : "#" + e.color!) : PALETTE[i % PALETTE.length],
      image: e.image || flagUrlForName(e.name) || undefined,
    }));
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
    topN: raw.topN && raw.topN >= 5 ? Math.min(20, raw.topN) : 12,
    source: raw.source || "",
    entities,
    keyframes,
    events: cleanEvents(raw.events),
  };
}

/** Build a VERIFIED World Bank race for an indicator (no brain needed) — used as a
 *  fallback so common topics still show real data if the brain is unavailable. */
async function buildVerified(key: IndicatorKey, request: string): Promise<RaceRaw | null> {
  const { from, to } = detectYears(request, NOW);
  const { scale, decimals } = detectScale(request);
  const wbFrom = Math.max(1960, from);
  const wbTo = Math.min(NOW, Math.max(to, wbFrom + 1));
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

  // No brain available: still serve VERIFIED data for catalogue topics (no story);
  // topics that need research can't be built, so signal a retry.
  if (!hasAnthropic()) {
    if (guess) {
      const v = await buildVerified(guess, request).catch(() => null);
      if (v) return NextResponse.json(normalize(v));
    }
    return NextResponse.json({ error: true }, { status: 200 });
  }

  try {
    // Optional live web research — grounds the plan + any model-built series in real sources.
    let context = "";
    if (hasSearch()) {
      const r = await webSearch(`${request} ranking by year (data)`).catch(() => null);
      if (r) context = [r.answer, ...r.results.slice(0, 4).map((x) => `• ${x.title}: ${x.content}`)].filter(Boolean).join("\n").slice(0, 4000);
    }

    const { object: plan } = await generateObject({
      model: MODELS.genius(),
      schema: planSchema,
      system: planSystem(),
      prompt: context ? `${request}\n\nResearch notes (for the story + routing):\n${context}` : request,
      temperature: 0.2,
      maxRetries: 3,
    });

    const from = Math.min(plan.fromYear, plan.toYear);
    const to = Math.max(plan.fromYear, plan.toYear);
    const topN = plan.topN || 12;
    const key = plan.indicatorKey as IndicatorKey;

    let race: RaceRaw | null = null;

    // Verified World Bank path. Scale is read from the request (deterministic),
    // defaulting to the indicator's natural scale (money → millions).
    if (plan.mode === "worldbank" && INDICATOR_KEYS.includes(key)) {
      const wbFrom = Math.max(1960, from); // World Bank data begins ~1960
      const { scale, decimals } = detectScale(request);
      try {
        race = await buildWorldBankRace({
          indicatorKey: key,
          from: wbFrom,
          to: Math.min(NOW, to),
          topN,
          scale,
          decimals,
        });
      } catch {
        race = null;
      }
    }

    // Web-researched model path (topics no catalogue covers).
    if (!race) {
      const { object: series } = await generateObject({
        model: MODELS.genius(),
        schema: seriesSchema,
        system: seriesSystem(context),
        prompt: `${request}\nRange: ${from} to ${to}. Provide the ranking-over-time series.`,
        temperature: 0.2,
        maxRetries: 3,
      });
      race = {
        title: plan.title,
        valueLabel: plan.valueLabel || "",
        unitPrefix: plan.unitPrefix || "",
        unitSuffix: plan.unitSuffix || "",
        timeLabel: "Year",
        decimals: plan.decimals ?? (plan.unitPrefix === "$" ? 1 : 0),
        topN,
        source: hasSearch() ? "Web research" : "",
        entities: (series.entities || []).map((e) => ({ name: e.name, color: e.color || "", image: flagUrlForName(e.name) || undefined })),
        keyframes: series.keyframes || [],
      };
    }

    // Merge the plan's headline + story onto the data.
    race.title = plan.title || race.title;
    race.subtitle = plan.subtitle || race.subtitle;
    race.events = plan.events as RaceEventRaw[];

    const norm = normalize(race);
    if (norm.entities.length >= 2 && norm.keyframes.length >= 2) return NextResponse.json(norm);
  } catch (e) {
    console.error("[stats] build failed:", e);
  }

  // The brain failed (e.g. transient / out of credits). For catalogue topics we can
  // still return VERIFIED World Bank data (just without the written story).
  if (guess) {
    const v = await buildVerified(guess, request).catch(() => null);
    if (v) return NextResponse.json(normalize(v));
  }
  // A specific non-catalogue request failed — tell the client to offer a retry.
  return NextResponse.json({ error: true }, { status: 200 });
}
