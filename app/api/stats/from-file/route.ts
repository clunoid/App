import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { flagUrlForName } from "@/lib/stats/flags";
import { PALETTE, type EntityKind, type RaceRaw } from "@/lib/stats/types";

export const runtime = "nodejs";
export const maxDuration = 300; // Opus reading a document + assembling the dataset can run long

const ISO2 = /^[a-z]{2}$/;
const HEX = /^#?[0-9a-fA-F]{6}$/;
const KINDS = ["country", "company", "person", "other"] as const;
// Keep the payload comfortably under the serverless request-body limit (~4.5 MB);
// the client caps the file at 3 MB → ~4 MB once base64-encoded.
const MAX_B64 = 4_600_000;
const MAX_TEXT = 600_000;

const kfItem = z.object({
  time: z.number(),
  values: z.array(z.object({ name: z.string(), value: z.number() })).min(1).max(44),
});
const fileSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  valueLabel: z.string().optional(),
  unitPrefix: z.string().optional(),
  unitSuffix: z.string().optional(),
  decimals: z.number().int().min(0).max(3).optional(),
  topN: z.number().int().min(2).max(30).optional(),
  entities: z
    .array(z.object({ name: z.string(), kind: z.enum(KINDS).optional(), country: z.string().optional(), color: z.string().optional() }))
    .min(2)
    .max(60),
  keyframes: z.array(kfItem).min(2).max(60).optional().describe("USE THIS field name. Chronological, ascending."),
  values: z.array(kfItem).max(60).optional().describe("Alias for keyframes — only if you didn't use keyframes."),
  notEnoughData: z.boolean().optional().describe("true ONLY if the document has no usable ranking / quantitative data for a stat battle"),
});

type Part = { type: "text"; text: string } | { type: "file"; data: Buffer; mimeType: string };

/**
 * Build a stat battle FROM a user-uploaded document. Opus reads the file (PDFs are
 * passed natively as a document block; text/CSV/etc. are passed as text) and
 * extracts the ranking-over-time into the same RaceRaw the rest of the feature uses.
 */
export async function POST(req: NextRequest) {
  if (!hasAnthropic()) return NextResponse.json({ error: true }, { status: 200 });
  let body: { kind?: string; filename?: string; text?: string; dataBase64?: string; note?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const note = (body.note || "").trim();
  const filename = (body.filename || "").slice(0, 200);
  const isPdf = body.kind === "pdf" && !!body.dataBase64;
  const text = (body.text || "").trim();
  if (isPdf && body.dataBase64!.length > MAX_B64) return NextResponse.json({ error: true, reason: "too-large" }, { status: 200 });
  if (!isPdf && !text) return NextResponse.json({ error: true }, { status: 200 });

  const system = `You turn a USER-PROVIDED DOCUMENT into an animated bar-chart-race ("stat battle") dataset. Extract the ranking / quantitative data from the document and structure it for the schema.
RULES:
- Use the document's OWN figures — EXACT, never invented. Do not add competitors or numbers the document doesn't support.
- If the document has values at MULTIPLE points in time (years / dates), build keyframes from that real time-series (chronological, ascending).
- If the document is a SINGLE snapshot (one ranking, no time dimension), make a short clean ANIMATION of that ranking: 3–4 keyframes where bars grow from a small fraction up to the document's final values. Anchor those keyframe times WITHIN the document's reference year so the on-screen year counter reads naturally (e.g. a 2024 ranking → times 2024.0, 2024.5, 2024.9); if no year is stated, use the current year (2026). This is a reveal of the SAME ranking — do NOT fabricate fake historical figures.
- valueLabel = what the numbers measure; set unitPrefix / unitSuffix (e.g. "$"/"", ""/" mph") and decimals so the figures show EXACTLY as in the document.
- Give each entity a distinct hex color, its ISO-3166 alpha-2 "country" when known, and a "kind": country / company / person / other (so the chart shows the right flag / logo / photo).
- topN = how many ranked items to show (capped at 30). Put the time data under "keyframes".
- If the document has NO usable ranking or quantitative data, set notEnoughData=true.`;

  const ask = `Build the best possible stat battle from this document${filename ? ` ("${filename}")` : ""}.${note ? ` The user adds: ${note}` : ""}`;

  try {
    const content: Part[] = [{ type: "text", text: ask }];
    if (isPdf) content.push({ type: "file", data: Buffer.from(body.dataBase64!, "base64"), mimeType: "application/pdf" });
    else content.push({ type: "text", text: `DOCUMENT (${filename || "file"}):\n\n${text.slice(0, MAX_TEXT)}` });

    const out = (
      await generateObject({
        model: MODELS.max(),
        schema: fileSchema,
        system,
        messages: [{ role: "user", content }],
        maxRetries: 3,
        maxTokens: 24000,
      })
    ).object;

    if (out.notEnoughData) return NextResponse.json({ error: true, reason: "no-data" }, { status: 200 });

    const keyframes = (out.keyframes ?? out.values ?? []) as { time: number; values: { name: string; value: number }[] }[];
    const seen = new Set<string>();
    const entities = (out.entities || [])
      .map((e) => ({ ...e, name: (e.name || "").trim() })) // trim FIRST so dedup + storage agree
      .filter((e) => e.name && !seen.has(e.name) && seen.add(e.name))
      .map((e, i) => {
        const cc = String(e.country || "").toLowerCase().trim();
        const kind: EntityKind = (KINDS as readonly string[]).includes(e.kind || "") ? (e.kind as EntityKind) : "other";
        return {
          name: e.name,
          color: HEX.test(e.color || "") ? (e.color!.startsWith("#") ? e.color! : "#" + e.color!) : PALETTE[i % PALETTE.length],
          kind,
          country: ISO2.test(cc) ? cc : undefined,
          image: kind === "country" ? flagUrlForName(e.name) || undefined : undefined,
        };
      });

    const race: RaceRaw = {
      title: out.title || filename || "Stat Battle",
      subtitle: out.subtitle,
      valueLabel: out.valueLabel ?? "",
      unitPrefix: out.unitPrefix ?? "",
      unitSuffix: out.unitSuffix ?? "",
      timeLabel: "Year",
      decimals: out.decimals ?? 0,
      topN: out.topN ?? Math.min(entities.length, 12),
      source: filename ? `From “${filename}”` : "Uploaded document",
      entities,
      keyframes,
      events: [], // a document gives data, not a researched story; users can add beats in the sheet
    };
    if (entities.length >= 2 && keyframes.length >= 2) return NextResponse.json(race);
  } catch (e) {
    console.error("[stats/from-file] failed:", e);
  }
  return NextResponse.json({ error: true }, { status: 200 });
}
