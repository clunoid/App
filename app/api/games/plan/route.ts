import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { requireUser } from "@/lib/auth/requireUser";
import { chargeCredits, chargeError, refund, isAdmin } from "@/lib/billing/meter";
import { ACTION_COSTS, INPUT_CAPS } from "@/lib/billing/costs";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_SPREAD, loadFlagNames, orderByTier, buildAllCountries, worldSpread, roundsFromCodes } from "@/lib/games/flagcodes";

export const runtime = "nodejs";
export const maxDuration = 60; // Opus planning a large category list can run a little long

/**
 * VIDEO DIRECT — the OPUS planner. Turns ANY prompt ("20 african countries",
 * "hard european flags", "all world flags") into a full, accurate flag round list
 * for a directly-generated recap video. Same {title,subtitle?,secondsPerRound,rounds}
 * contract the play route + buildGameReel already speak — this route ONLY plans;
 * the video is rendered client-side.
 *
 * Billing: every generation is credit-charged (video_plan) like the other features.
 * PREMIUM (Isaac) videos additionally consume the free tier's 2/month allowance
 * (claim_video_direct RPC); subscribers + admins are unlimited. Non-premium voices
 * never touch the counter.
 */

const planSchema = z.object({
  title: z.string().describe("A short, fun title, e.g. 'World Flags', 'African Flags', 'Island Nations'."),
  subtitle: z.string().optional().describe("A brief 2-4 word label naming the category exactly as searched (e.g. 'Arab countries flags', 'Island nations'); OMIT for a general/all game."),
  mode: z.enum(["category", "general", "all"]).describe("'category' = a specific named set/region/theme/property; 'general' = a vague worldwide/random mix; 'all' = every country in the world."),
  secondsPerRound: z.number().int().min(2).max(60).optional().describe("Seconds per round, ONLY if the user asked for a specific pace; otherwise omit."),
  rounds: z
    .array(
      z.object({
        code: z.string().describe("ISO 3166-1 alpha-2 country code, lowercase (e.g. 'fr', 'jp', 'br')."),
        difficulty: z.enum(["easy", "medium", "hard"]).describe("How globally recognizable the flag is: easy=famous, hard=obscure."),
      })
    )
    .min(1)
    .max(250)
    .describe("For 'category': EVERY real country/territory that matches (the COMPLETE list, do not cap), OR EXACTLY the number the user asked for. For 'general'/'all': a few samples — the server expands. Return ONLY code + difficulty."),
});

const SYSTEM = `You are planning a "guess the country by its flag" recap VIDEO. Read the user's request and decide the MODE, then return the flags — accuracy is essential (every code MUST be the correct country and MUST be a real flag).

- "category": the request names a SPECIFIC set — a region, continent, theme, or property (e.g. "islands", "African flags", "Arab countries", "Kenya's neighbours", "Scandinavian flags", "hard European flags"). List EVERY real country/territory that matches — the COMPLETE, EXHAUSTIVE set, none missing, none that don't belong. Do NOT cap or sample. The ONLY exception: if the user explicitly asks for a NUMBER of flags (e.g. "20 african countries", "15 hard flags"), return EXACTLY that many, chosen to span easy/medium/hard. Set a brief 2-4 word "subtitle" naming the category as the user framed it.

- "general": a vague worldwide / random / mixed request with NO specific category ("random", "a mix", "world flags", "surprise me"). Return a FEW samples — the server expands into a full worldwide spread. OMIT the subtitle.

- "all": the user wants every country / all the flags in the world. Return a few samples — the server expands to the full world list. OMIT the subtitle.

Rules:
- Use ONLY real countries/territories with correct lowercase ISO 3166-1 alpha-2 codes. Include dependent territories when they genuinely fit the category.
- Be EXHAUSTIVE and ACCURATE for a category; honor an explicit count EXACTLY.
- For each round return ONLY the lowercase code and a difficulty ('easy' = globally famous like us/fr/jp/br; 'medium' = moderately known; 'hard' = obscure). The server fills in official names.
- No duplicate countries.`;

/** Refund a consumed premium-video slot (service-role) when a claimed render can't complete. */
async function refundSlot(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.rpc("refund_video_direct", { p_user: userId });
  } catch {
    /* best-effort */
  }
}

export async function POST(req: NextRequest) {
  let body: { request?: string; voice?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const request = (body.request || "").trim().slice(0, INPUT_CAPS.statsRequest);
  if (!request) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (!hasAnthropic()) return NextResponse.json({ error: true }, { status: 200 });

  // The only premium video voice today is Isaac. Server re-derives it (never trusts the
  // client for gating). Premium + non-subscriber + non-admin spends a monthly slot.
  const premium = (body.voice || "") === "isaac";
  const admin = isAdmin(user);

  // 1) PREMIUM MONTHLY GATE — atomic + server-authoritative, BEFORE any spend.
  let claimedSlot = false;
  if (premium && !admin) {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.rpc("claim_video_direct");
    if (error || data !== true) {
      return NextResponse.json({ error: "video_limit", feature: "video" }, { status: 402 });
    }
    claimedSlot = true;
  }

  // 2) CHARGE the Opus planning (admins/bypass handled inside chargeCredits).
  const charge = await chargeCredits("video_plan", ACTION_COSTS.video_plan, { request: request.slice(0, 60) }, user);
  if (!charge.ok) {
    if (claimedSlot) await refundSlot(user.id);
    return chargeError(charge);
  }

  const names = await loadFlagNames();

  // 3) OPUS PLAN. NO temperature (Opus 4.8 rejects it — MODELS.max strips it too).
  let object: z.infer<typeof planSchema> | null = null;
  try {
    ({ object } = await generateObject({
      model: MODELS.max(),
      schema: planSchema,
      system: SYSTEM,
      prompt: request,
      maxRetries: 2,
      maxTokens: 8000, // up to ~250 rounds of {code,difficulty}
    }));
  } catch {
    /* fall through to the dataset fallback below */
  }

  // 4) DISPATCH by mode, reusing the SAME validated flagcdn builders as the play route.
  if (object?.mode === "all") {
    return NextResponse.json({ title: object.title || "All Countries", secondsPerRound: object.secondsPerRound ?? 8, rounds: orderByTier(buildAllCountries(names)), premium });
  }
  if (object?.mode === "general") {
    return NextResponse.json({ title: object.title || "World Flags", secondsPerRound: object.secondsPerRound ?? 7, rounds: worldSpread(names, DEFAULT_SPREAD), premium });
  }

  // "category" → Opus's COMPLETE list, validated against flagcdn (drops fake/dupe codes).
  let rounds = roundsFromCodes(object?.rounds || [], names);
  // Honor an explicit count in the prompt as a safety cap (Opus should already obey it).
  const askedN = Number((request.match(/\b(\d{1,3})\b/) || [])[1]);
  if (askedN >= 1 && askedN < rounds.length) rounds = orderByTier(rounds).slice(0, askedN);

  if (!rounds.length) {
    // Opus hiccup / empty → refund the spend + any premium slot, hand back nothing so
    // the client can retry (rather than a silent wrong video).
    await refund(user.id, ACTION_COSTS.video_plan, "video_plan");
    if (claimedSlot) await refundSlot(user.id);
    return NextResponse.json({ error: true }, { status: 200 });
  }

  return NextResponse.json({
    title: object?.title || "Flags",
    subtitle: object?.subtitle?.trim() || undefined,
    secondsPerRound: object?.secondsPerRound ?? 7,
    rounds: orderByTier(rounds),
    premium,
  });
}
