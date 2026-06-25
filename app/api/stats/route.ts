import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { PALETTE, type RaceRaw } from "@/lib/stats/types";
import { GDP_FALLBACK } from "@/lib/stats/fallback";

export const runtime = "nodejs";
export const maxDuration = 60; // multi-decade research is heavier than the flags game

const HEX = /^#?[0-9a-fA-F]{6}$/;

const schema = z.object({
  title: z.string().describe("Punchy title, e.g. 'World's Largest Economies'."),
  subtitle: z.string().optional().describe("Range / unit note, e.g. '1560 – 2026, nominal GDP'."),
  valueLabel: z.string().describe("What the number represents, e.g. 'GDP', 'ELO rating'."),
  unitPrefix: z.string().optional().describe("Prefix shown before each value, e.g. '$'. Empty if none."),
  unitSuffix: z.string().optional().describe("Suffix after each value, e.g. 'T', 'B', 'M', ' pts', '%'. Empty if none."),
  timeLabel: z.string().optional().describe("Label for the time axis, e.g. 'Year'."),
  entities: z
    .array(z.object({ name: z.string(), color: z.string().optional().describe("Distinct hex like '#c0392b'.") }))
    .min(2)
    .max(22)
    .describe("Every competitor that appears in ANY keyframe; distinct, readable colors."),
  keyframes: z
    .array(
      z.object({
        time: z.number().describe("The year/time, ascending across keyframes."),
        values: z
          .array(z.object({ name: z.string().describe("MUST match an entities[].name exactly."), value: z.number() }))
          .min(2)
          .max(22),
      })
    )
    .min(2)
    .max(36)
    .describe("Chronological, ascending. Sparse but enough to interpolate smoothly. Omit a name before it existed."),
});

const SYSTEM = `You are a meticulous data historian building an animated bar-chart race ("stat battle"). Given the user's topic and time range, return ACCURATE ranking-over-time data from established knowledge.
RULES:
- Use REAL, historically credible figures. Prefer widely-accepted estimates; for eras with only estimates (e.g. pre-1900 GDP) use sensible scholarly approximations — never invent fake precision.
- Pick the ~8-14 entities that genuinely dominated the metric ACROSS the span, INCLUDING ones that entered or fell out of the top over time (omit a name from early keyframes where it didn't rank — that entering/leaving is what makes the race compelling).
- Keyframes must be chronological/ascending and span the FULL requested range; space them so values change believably (14-22 keyframes is ideal; denser where history moves fast).
- ONE consistent unit for the whole chart. Choose a unit that keeps numbers readable (e.g. GDP in trillions of USD → unitPrefix "$", unitSuffix "T", values like 30.3). State it via valueLabel/unitPrefix/unitSuffix.
- Every values[].name MUST exactly match an entities[].name. Give each entity a DISTINCT high-contrast hex color.
- Be exact with dates and the most recent keyframe (present-day standing).`;

/** Clean the model output so the renderer never sees malformed data. */
function normalize(raw: RaceRaw): RaceRaw {
  const seen = new Set<string>();
  const entities = (raw.entities || [])
    .filter((e) => e && e.name && !seen.has(e.name) && seen.add(e.name))
    .map((e, i) => ({ name: e.name.trim(), color: HEX.test(e.color || "") ? (e.color!.startsWith("#") ? e.color! : "#" + e.color!) : PALETTE[i % PALETTE.length] }));
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
    timeLabel: raw.timeLabel || "",
    entities,
    keyframes,
  };
}

export async function POST(req: NextRequest) {
  let body: { request?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const request = (body.request || "").trim();

  if (!request || !hasAnthropic()) {
    return NextResponse.json(normalize(GDP_FALLBACK));
  }

  try {
    const { object } = await generateObject({
      model: MODELS.genius(),
      schema,
      system: SYSTEM,
      prompt: request,
      temperature: 0.2,
      maxRetries: 2,
    });
    const norm = normalize(object as RaceRaw);
    if (norm.entities.length >= 2 && norm.keyframes.length >= 2) return NextResponse.json(norm);
  } catch {
    /* fall through */
  }
  // A specific request failed (transient) — signal the client to offer a retry
  // rather than returning the (wrong-topic) GDP fallback.
  return NextResponse.json({ error: true }, { status: 200 });
}
