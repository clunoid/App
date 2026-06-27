import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { flagUrlForName } from "@/lib/stats/flags";
import { PALETTE, type EntityKind, type RaceRaw } from "@/lib/stats/types";

export const runtime = "nodejs";
export const maxDuration = 300; // an Opus rewrite of the full dataset can run long

const ISO2 = /^[a-z]{2}$/;
const HEX = /^#?[0-9a-fA-F]{6}$/;

/* The edited dataset Opus returns (entities + per-time values, + optional meta tweaks). */
const kfItem = z.object({
  time: z.number(),
  values: z.array(z.object({ name: z.string(), value: z.number() })).min(1).max(44),
});
const editSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  valueLabel: z.string().optional(),
  unitPrefix: z.string().optional(),
  unitSuffix: z.string().optional(),
  decimals: z.number().int().min(0).max(3).optional(),
  topN: z.number().int().min(2).max(30).optional(),
  entities: z.array(z.object({ name: z.string(), color: z.string().optional(), country: z.string().optional() })).min(2).max(60),
  keyframes: z.array(kfItem).min(2).max(60).optional().describe("USE THIS field name. Chronological, ascending."),
  values: z.array(kfItem).max(60).optional().describe("Alias for keyframes — only if you didn't use keyframes."),
});

type RaceLike = {
  title?: string;
  subtitle?: string;
  valueLabel?: string;
  unitPrefix?: string;
  unitSuffix?: string;
  decimals?: number;
  topN?: number;
  source?: string;
  entities?: { name: string; kind?: EntityKind; country?: string; color?: string; image?: string }[];
  frames?: { time: number; values: Record<string, number> }[];
  events?: unknown[];
};

/** Compact, token-light serialization of the current data for the edit prompt. */
function serialize(d: RaceLike): string {
  const ents = (d.entities || []).map((e) => `${e.name}${e.country ? ` [${e.country}]` : ""}`).join(", ");
  const kfs = (d.frames || [])
    .map((f) => `${f.time}: ${Object.entries(f.values).map(([n, v]) => `${n}=${v}`).join(", ")}`)
    .join("\n");
  return `TITLE: ${d.title || ""}\nSUBTITLE: ${d.subtitle || ""}\nMETRIC: ${d.valueLabel || ""} | unit "${d.unitPrefix || ""}…${d.unitSuffix || ""}" | decimals ${d.decimals ?? 0} | visible bars ${d.topN ?? 12}\nCOMPETITORS: ${ents}\nVALUES BY TIME:\n${kfs}`.slice(0, 16000);
}

/**
 * AI edit: take the CURRENT stat-battle data + a plain-English instruction and return
 * the FULL updated dataset (so users can refine exactly what they want without manually
 * editing every cell, and can turn a saved battle into a new one just by asking).
 */
export async function POST(req: NextRequest) {
  if (!hasAnthropic()) return NextResponse.json({ error: true }, { status: 200 });
  let body: { data?: RaceLike; instruction?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const cur = body.data;
  const instruction = (body.instruction || "").trim();
  if (!cur || !instruction || !cur.entities?.length) return NextResponse.json({ error: true }, { status: 200 });

  try {
    const system = `You EDIT an existing animated bar-chart-race ("stat battle") dataset to match the user's instruction. You are given the CURRENT dataset and one instruction. Return the FULL updated dataset in the schema — apply ONLY what the instruction asks and keep everything else IDENTICAL (same competitors, values, years, units) unless the instruction changes them.
RULES: keep figures ACCURATE and real (never invent fake precision); keep the SAME value scale/units unless asked to change; every keyframe should still have enough REAL competitors to fill the chart; values[].name must match an entities[].name; give any NEW entity a distinct hex color and its ISO-3166 alpha-2 "country"; preserve the present-day (final) values' accuracy. If the instruction changes the metric/topic/range entirely, rebuild accordingly. Put the time data under "keyframes".`;
    const prompt = `CURRENT DATASET:\n${serialize(cur)}\n\nINSTRUCTION FROM THE USER:\n${instruction}\n\nReturn the full updated dataset.`;

    const out = (
      await generateObject({
        model: MODELS.max(),
        schema: editSchema,
        system,
        prompt,
        maxRetries: 3,
        maxTokens: 24000,
      })
    ).object;

    const keyframes = (out.keyframes ?? out.values ?? []) as { time: number; values: { name: string; value: number }[] }[];
    // entity kind: keep the current kind for names we already had; default to the prior race's dominant kind.
    const priorKind = new Map((cur.entities || []).map((e) => [e.name, e.kind]));
    const fallbackKind: EntityKind = ((cur.entities || []).find((e) => e.kind)?.kind as EntityKind) || "other";
    const seen = new Set<string>();
    const entities = (out.entities || [])
      .filter((e) => e.name && !seen.has(e.name) && seen.add(e.name))
      .map((e, i) => {
        const cc = String(e.country || "").toLowerCase().trim();
        const kind = (priorKind.get(e.name) as EntityKind) || fallbackKind;
        return {
          name: e.name.trim(),
          color: HEX.test(e.color || "") ? (e.color!.startsWith("#") ? e.color! : "#" + e.color!) : PALETTE[i % PALETTE.length],
          kind,
          country: ISO2.test(cc) ? cc : undefined,
          image: kind === "country" ? flagUrlForName(e.name) || undefined : undefined,
        };
      });

    const race: RaceRaw = {
      title: out.title || cur.title || "Stat Battle",
      subtitle: out.subtitle ?? cur.subtitle,
      valueLabel: out.valueLabel ?? cur.valueLabel ?? "",
      unitPrefix: out.unitPrefix ?? cur.unitPrefix ?? "",
      unitSuffix: out.unitSuffix ?? cur.unitSuffix ?? "",
      timeLabel: "Year",
      decimals: out.decimals ?? cur.decimals ?? 0,
      topN: out.topN ?? cur.topN ?? 12,
      source: cur.source || "Researched data",
      entities,
      keyframes,
      events: (cur.events as RaceRaw["events"]) || [], // keep the existing story; the user edits beats in the sheet
    };
    if (entities.length >= 2 && keyframes.length >= 2) return NextResponse.json(race);
  } catch (e) {
    console.error("[stats/edit] failed:", e);
  }
  return NextResponse.json({ error: true }, { status: 200 });
}
