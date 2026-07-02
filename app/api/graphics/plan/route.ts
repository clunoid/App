import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { MODELS, hasAnthropic } from "@/lib/models";
import { requireUser } from "@/lib/auth/requireUser";
import { chargeCredits, chargeError, isAdmin, creditsAvailable } from "@/lib/billing/meter";
import { ACTION_COSTS, INPUT_CAPS } from "@/lib/billing/costs";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { motionSpecSchema, ICON_NAMES, type MotionSpec } from "@/lib/graphics/spec";
import { pexelsPhotos, hasPexels } from "@/lib/data/pexels";

export const runtime = "nodejs";
export const maxDuration = 300; // Opus designing a full multi-scene spec is our longest single call

/**
 * MOTION GRAPHICS planner — Opus designs the complete declarative scene graph
 * (story, layouts, elements, animations, palette, narration) from one prompt.
 * ACCESS: Pro/Max subscribers, or users who bought credits (purchased balance) —
 * no free-tier trial (top-tier model, the priciest plan we run). Admin bypasses.
 * Every generation is credit-charged (graphics_plan); narration TTS bills per line
 * during the client render.
 */

const SYSTEM = `You are a SENIOR MOTION DESIGNER + copywriter directing a professional animated explainer video (the modern SaaS / tech / startup style: kinetic typography, stroked vector icons, animated UI mockups, charts, counters, timelines, soft gradient backgrounds). You output a complete SCENE GRAPH the render engine animates. You never write code — only the structured spec.

STORY (this is what separates professional videos from slideshows):
- Build a real arc across 5–8 scenes: HOOK (grab in 1 line) → PROBLEM or CONTEXT → the CORE IDEA / SOLUTION → HOW IT WORKS (steps) → PROOF (numbers/chart) → CTA. Adapt the arc to the topic (education = curiosity → concept → example → recap).
- narration: conversational SPOKEN language, 1–3 short sentences per scene (≈8–20 words each). No markdown, no "in this video". Write in the SAME LANGUAGE as the user's prompt. The video's pacing follows the narration.
- headline: 2–6 punchy words that COMPLEMENT (not repeat) the narration. kicker: a tiny eyebrow like "THE PROBLEM", "STEP 2", "BY THE NUMBERS" — use on most scenes.

VISUAL DIRECTION:
- ONE strong focal element per scene beats three weak ones. 0–2 elements per scene; a headline-only scene is fine for the hook.
- Match element to content: process/steps → timeline · comparison/growth → chart (real-looking values) · a big stat → counter · product/app/service → uiCard (browser for web, phone for apps; give it rows/stat/cta) · concepts/features → icon or iconGrid (3–4 items) · list of benefits → bullets · testimonial/famous line → quote · real-world subject (place, food, nature, people) → image with a 2–4 word imageQuery.
- icons: choose ONLY from this library: ${ICON_NAMES.join(", ")}.
- charts: 3–6 data points, plausible real values, highlight the standout index.
- layout: vary across scenes (center for the hook, split for explanation, grid for features, full for images, stack otherwise). transition: vary (fade/slide/wipe/zoom) — never the same twice in a row. bg: vary the flavor.
- style: theme dark for tech/finance/startup/cinematic, light for health/education/lifestyle when it fits. hue: match the topic's emotion (250 violet tech-AI, 210 trust-blue fintech, 160 teal health/eco, 25 orange energy-food, 340 pink creative). energy: calm for serious topics, high for hype/product-launch. music: ambient for explainers, upbeat for launches/promos, none only if the topic demands silence.
- style.brand ONLY if the prompt is about a specific named product/company — then open scene 1 with a logo element (text = the brand) and close the CTA with it.
- FINAL scene = a clear CTA (follow, try it, remember the takeaway) with a short headline; keep it under 12 narration words.

ACCURACY: facts, numbers and history must be real and defensible; when inventing a product demo, keep numbers plausible. Never fabricate statistics for real-world topics — use well-known approximate figures.`;

/** Server-authoritative access gate: subscriber OR has purchased credits OR admin. */
async function allowed(userId: string): Promise<boolean> {
  const supabase = await getSupabaseServer();
  const [sub, bal] = await Promise.all([
    supabase.from("subscriptions").select("plan").eq("user_id", userId).maybeSingle(),
    supabase.from("credit_balances").select("purchased").eq("user_id", userId).maybeSingle(),
  ]);
  const plan = (sub.data?.plan as string) || "free";
  const purchased = (bal.data?.purchased as number) || 0;
  return plan === "pro" || plan === "max" || purchased > 0;
}

export async function POST(req: NextRequest) {
  let body: { request?: string; preflight?: boolean } = {};
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

  const admin = isAdmin(user);
  if (!admin && !(await allowed(user.id))) {
    // Pro/Max feature — free users unlock it by buying credits (no trial).
    return NextResponse.json({ error: "plan", feature: "graphics" }, { status: 402 });
  }

  // PRE-FLIGHT — read-only verify (no charge, no Opus) so the UI can stop early.
  if (body.preflight) {
    const avail = await creditsAvailable();
    if (avail !== null && avail < ACTION_COSTS.graphics_plan) {
      return NextResponse.json({ error: "credits", balance: avail }, { status: 402 });
    }
    return NextResponse.json({ ok: true });
  }

  const charge = await chargeCredits("graphics_plan", ACTION_COSTS.graphics_plan, { request: request.slice(0, 80) }, user);
  if (!charge.ok) return chargeError(charge);

  try {
    // NO temperature — Opus 4.8 rejects it (MODELS.max strips it as a safety net).
    const { object } = await generateObject({
      model: MODELS.max(),
      schema: motionSpecSchema,
      system: SYSTEM,
      prompt: request,
      maxRetries: 2,
      maxTokens: 16000,
    });

    const spec = object as MotionSpec;
    if (!spec.scenes?.length) throw new Error("empty spec");

    // Sanitize + resolve. Chart values must be non-negative (the engine normalizes by
    // max; a negative bar/point would draw upside-down garbage). Drop any imageUrl the
    // model invented — only the server may set it (stock photos resolved here, so the
    // Pexels key never reaches the client).
    for (const scene of spec.scenes) {
      for (const el of scene.elements || []) {
        if (el.chart) el.chart.values = el.chart.values.map((v) => Math.max(0, Number(v) || 0));
        el.imageUrl = undefined;
        if (el.type === "image" && el.imageQuery && hasPexels()) {
          try {
            const photos = await pexelsPhotos(el.imageQuery, 1);
            if (photos[0]) el.imageUrl = photos[0];
          } catch {
            /* image is optional — the engine draws a styled placeholder */
          }
        }
      }
    }

    return NextResponse.json({ spec });
  } catch (e) {
    console.error("[graphics] plan failed:", e);
    // Refund into the PURCHASED bucket: the charge may have drained purchased credits
    // (the very access gate), and refunding into the monthly balance would let them
    // evaporate at the next reset. Admins were never charged — never mint for them.
    if (!admin) {
      const adminDb = getSupabaseAdmin();
      if (adminDb) {
        try {
          await adminDb.rpc("refund_credits_purchased", { p_user: user.id, p_amount: ACTION_COSTS.graphics_plan, p_action: "graphics_plan" });
        } catch {
          /* best-effort */
        }
      }
    }
    return NextResponse.json({ error: true }, { status: 200 });
  }
}
