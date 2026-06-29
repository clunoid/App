import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { gate, refund } from "@/lib/billing/meter";
import { ACTION_COSTS } from "@/lib/billing/costs";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  title: z.string().describe("A punchy, scroll-stopping title (TikTok/YouTube/Reels style), ~5-9 words. No '#', no quotes."),
  caption: z.string().describe("1-2 lively sentences that hook viewers and naturally credit clunoid.com (where they can make their own)."),
  hashtags: z.array(z.string()).min(7).max(13).describe("Relevant lowercase tags WITHOUT the '#'. The FIRST tag MUST be exactly 'clunoid'; then the most relevant, high-reach tags (e.g. 'flags', 'geography', 'dataviz')."),
});

const SYSTEM = `You write share-ready social copy for a short video made on clunoid.com — a site where anyone can create shareable clips like animated "stat battle" bar-chart races and "Guess the Country" flag-quiz games. Write copy that is catchy, platform-native (TikTok / Reels / Shorts / X), and SPECIFIC to this clip — never generic filler. Return:
- a punchy, scroll-stopping title;
- a 1-2 sentence caption that hooks viewers and naturally credits clunoid.com (where they can make their own);
- relevant lowercase hashtags (no '#'), and the FIRST hashtag must be exactly "clunoid".`;

export async function POST(req: NextRequest) {
  let body: { title?: string; subtitle?: string; source?: string; kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const title = (body.title || "").trim();
  if (!title || !hasAnthropic()) return NextResponse.json({ error: true }, { status: 200 });

  const g = await gate("caption", ACTION_COSTS.caption, { title: title.slice(0, 60) });
  if (!g.ok) return g.res;

  try {
    const { object } = await generateObject({
      model: MODELS.smart(), // cheap + fast is plenty for a caption
      schema,
      system: SYSTEM,
      prompt: `${body.kind ? `Clip type: ${body.kind}\n` : ""}Topic: ${title}${body.subtitle ? `\nDetails: ${body.subtitle}` : ""}${body.source ? `\nData source: ${body.source}` : ""}`,
      temperature: 0.8,
      maxRetries: 2,
      maxTokens: 1200,
    });
    // Clean the title; guarantee the caption credits clunoid.com; force "#clunoid"
    // first in the hashtags (then dedupe) regardless of what the model returned.
    const cleanTitle = (object.title || "").replace(/["#]+/g, "").trim();
    let caption = (object.caption || "").trim();
    if (caption && !/clunoid\.com/i.test(caption)) caption += " Make yours at clunoid.com.";
    const rest = (object.hashtags || [])
      .map((h) => "#" + String(h).replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
      .filter((h) => h.length > 1 && h !== "#clunoid");
    const hashtags = [...new Set(["#clunoid", ...rest])].slice(0, 14);
    return NextResponse.json({ title: cleanTitle, caption, hashtags });
  } catch {
    await refund(g.userId, ACTION_COSTS.caption, "caption");
    return NextResponse.json({ error: true }, { status: 200 });
  }
}
