import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  title: z.string().describe("A punchy, scroll-stopping video title (YouTube/TikTok style), ~6-10 words."),
  caption: z.string().describe("1-2 engaging sentences that hook viewers and mention clunoid.com."),
  hashtags: z.array(z.string()).min(6).max(14).describe("Relevant hashtag words WITHOUT the '#' (e.g. 'datavisualization')."),
});

const SYSTEM = `You write share-ready social copy for an animated "stat battle" bar-chart-race video created on clunoid.com (where anyone can type a ranking and watch it race). Make it catchy and platform-native. Return a punchy title, a short caption that hooks viewers and credits clunoid.com, and a set of relevant lowercase hashtags (no '#').`;

export async function POST(req: NextRequest) {
  let body: { title?: string; subtitle?: string; source?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const title = (body.title || "").trim();
  if (!title || !hasAnthropic()) return NextResponse.json({ error: true }, { status: 200 });

  try {
    const { object } = await generateObject({
      model: MODELS.smart(), // cheap + fast is plenty for a caption
      schema,
      system: SYSTEM,
      prompt: `Topic: ${title}${body.subtitle ? `\nDetails: ${body.subtitle}` : ""}${body.source ? `\nData source: ${body.source}` : ""}`,
      temperature: 0.8,
      maxRetries: 2,
      maxTokens: 1200,
    });
    const hashtags = (object.hashtags || []).map((h) => "#" + String(h).replace(/[^a-zA-Z0-9]/g, "")).filter((h) => h.length > 1).slice(0, 14);
    return NextResponse.json({ title: object.title, caption: object.caption, hashtags });
  } catch {
    return NextResponse.json({ error: true }, { status: 200 });
  }
}
