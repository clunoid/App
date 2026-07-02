import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasGroq } from "@/lib/models";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * MOTION GRAPHICS idea generator — a FREE, fast Groq call that returns a fresh,
 * randomized batch of video ideas across many domains. Powers the "Suggest an
 * idea" button so a user can keep clicking for new directions until one clicks.
 * No credits are charged (free tier model); it only needs a signed-in user.
 */

// A broad domain palette. We shuffle and take a random slice each call so no two
// batches lean on the same categories — the ideas stay genuinely varied.
const DOMAINS = [
  "education", "science", "technology", "artificial intelligence", "space & astronomy",
  "medicine & health", "history", "gaming", "sports", "business & startups",
  "marketing & advertising", "personal finance", "crypto & web3", "nature & the environment",
  "psychology", "food & cooking", "travel", "music & art", "productivity & self-improvement",
  "engineering & how things work", "product launch / demo", "company explainer",
  "social media growth", "storytelling & documentary", "motivation",
];

const schema = z.object({
  ideas: z
    .array(z.string())
    .min(8)
    .max(12)
    .describe("8-12 short, standalone video prompts (4-9 words each). Imperative or a question. No numbering, no quotes, no hashtags."),
});

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ideas: [] }, { status: 401 });
  if (!hasGroq()) return NextResponse.json({ ideas: [] }, { status: 200 });

  // Random subset of domains + a nonce so every call is different.
  const pool = [...DOMAINS].sort(() => Math.random() - 0.5).slice(0, 10);
  const nonce = Math.random().toString(36).slice(2, 8);

  try {
    const { object } = await generateObject({
      model: MODELS.fast(),
      schema,
      system:
        "You brainstorm ideas for short, professional MOTION GRAPHICS explainer videos (the modern SaaS/tech/startup style). Each idea is a punchy, standalone prompt a user could paste to generate a video — like \"Explain how AI works\", \"How does Bitcoin mining work?\", \"History of Ancient Rome\", \"Market a cozy neighborhood restaurant\", \"Create a product launch video for a fitness app\". Keep each 4-9 words, concrete and interesting, spanning DIFFERENT topics. No numbering, quotes, emojis, or hashtags.",
      prompt: `Give a fresh, diverse batch of video ideas. Spread them across these domains (one or two each, no repeats): ${pool.join(", ")}. Make them specific and clickable, not generic. Batch id: ${nonce}.`,
      temperature: 1,
      maxRetries: 1,
      maxTokens: 700,
    });

    const ideas = (object.ideas || [])
      .map((s) => String(s).replace(/^["'\d.)\-\s]+/, "").replace(/["']+$/, "").trim())
      .filter((s) => s.length >= 4 && s.length <= 90);
    return NextResponse.json({ ideas: [...new Set(ideas)] });
  } catch {
    // The client falls back to its own seed list, so a soft failure is fine.
    return NextResponse.json({ ideas: [] }, { status: 200 });
  }
}
