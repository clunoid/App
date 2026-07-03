import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { requireUser } from "@/lib/auth/requireUser";
import { chargeCredits, chargeError, isAdmin, creditsAvailable, refundSplit } from "@/lib/billing/meter";
import { INPUT_CAPS, graphicsPlanCost, GRAPHICS_MAX_SEC, GRAPHICS_LONGFORM_SEC } from "@/lib/billing/costs";
import { getSupabaseServer } from "@/lib/supabase/server";
import { sceneSchema, ICON_NAMES, type MotionSpec, type MotionScene, type MotionElement } from "@/lib/graphics/spec";
import { pexelsPhotos, pexelsClips, hasPexels } from "@/lib/data/pexels";
import { webSearch, hasSearch } from "@/lib/data/search";
import { resolveMentions } from "@/lib/graphics/mentions";

export const runtime = "nodejs";
export const maxDuration = 300; // research + outline + parallel chapter calls — our longest route

/**
 * MOTION GRAPHICS planner v2 — an AI production studio, not a slideshow maker:
 *   1. RESEARCH   — Tavily (advanced) digs up real facts, numbers, names, dates.
 *   2. SCRIPT     — for long videos Opus first writes the outline: chapters, beats,
 *                   narrative handoffs, per-chapter color mood.
 *   3. SCENES     — Opus writes each chapter's scenes IN PARALLEL (continuity comes
 *                   from the outline's handoff lines), or one call for shorts.
 *   4. MEDIA      — stock photos AND footage clips resolved server-side (Pexels),
 *                   deduped across scenes, capped per chapter.
 * ACCESS: Pro/Max subscribers, or users who bought credits — no free-tier trial.
 * COST: scales with requested duration (graphicsPlanCost); TTS billed per line on top.
 */

/* ── craft brief shared by every planning call ────────────────────────────── */
const CRAFT = `You are a SENIOR MOTION DESIGNER + documentary scriptwriter directing a professional animated explainer (modern SaaS / tech / studio style: kinetic typography, stroked vector icons, animated UI mockups, charts, stat capsules, process diagrams, stock footage b-roll, soft gradient backgrounds). You output a structured SCENE GRAPH the render engine animates — never code.

SCRIPT CRAFT (this is what makes people finish the video):
- narration is ONE continuous voiceover heard aloud — WRITE THE WHOLE SCRIPT IN YOUR HEAD FIRST, then split it across scenes. Each scene's line must pick up mid-flow from the previous line (connective tissue: "But here's the catch…", "And that's exactly why…", "So what happens next?"). No greetings mid-video, no "in this video", no repeated introductions.
- SOUND HUMAN: contractions (it's, don't, you're), varied sentence length (a punchy 4-word line after a long one), direct address ("you"), an occasional rhetorical question. READ IT ALOUD in your head — if a line sounds like a slide bullet or a press release ("Quantum mechanics. The science of the very small."), rewrite it as speech ("So what actually happens when you shrink down past the atom?").
- NEVER: robotic fragments, noun-stack openers, starting consecutive scenes with the same word, ending every line on a full stop cliff — let some lines lean forward into the next scene.
- Be CONCRETE: real numbers, names, dates, comparisons ("that's 40x more than…"). Every sentence must teach, surprise, or move the story — cut filler.
- Write in the SAME LANGUAGE as the user's prompt.
- headline: 2-6 punchy words COMPLEMENTING (not repeating) the narration. kicker: a tiny eyebrow ("THE PROBLEM", "STEP 2", "1969", "BY THE NUMBERS") on most scenes.

VISUAL DIRECTION:
- ONE strong focal element per scene. 0-2 elements; a headline-only scene is fine for a beat of emphasis.
- Match element to content: steps → timeline or flow · comparison → compare or chart · big stat → counter or statRow · product/app → uiCard (browser=web, phone=app; give rows/stat/cta) · concepts → icon or iconGrid · benefits → bullets · famous line → quote · REAL-WORLD subject (place, nature, machine, city, people, food, sport) → video (stock footage b-roll!) or image · process → flow · brand moment → logo.
- VARIETY IS LAW: never the same element type in two consecutive scenes; alternate text-led and visual-led scenes; mix at least 6 different element types across any 10 scenes; aim for a video/image b-roll scene roughly every 3rd-4th scene — real footage between graphics is what makes it feel produced.
- MENTION CUTAWAYS (the documentary rule — this hooks viewers): the viewer must SEE whatever the narration NAMES, at the moment it's spoken. For EVERY named person, place, organization, artifact, event or concrete thing in a scene's narration, add a mentions entry: term (display name), kind, query (what the photo should SHOW), anchor (the EXACT words copied verbatim from that scene's narration). Say "Julius Caesar" → show Caesar; say "the Colosseum" → show the Colosseum. 1-3 per scene whenever the narration names things; skip only what the scene's main visual already shows.
- icons: choose ONLY from: ${ICON_NAMES.join(", ")}.
- charts: 3-6 plausible real values, highlight the standout. statRow: 2-4 punchy figures.
- layout: vary (center for beats, split for explanation, grid for features, full for footage/images, stack otherwise). transition: vary — never the same twice in a row. bg: vary the flavor scene to scene.
- imageQuery/videoQuery: 2-4 CONCRETE visual words ("server room aisle", "rocket launch night", "chef plating dish") — describe what the CAMERA sees, not the abstract topic. Prefer BRIGHT, iconic, instantly recognizable subjects — never abstract darkness.

ACCURACY: facts, numbers and history must be real and defensible — prefer the RESEARCH provided over your training memory when they disagree. When inventing a product demo, keep numbers plausible. Never fabricate statistics for real-world topics.`;

const STYLE_GUIDE = `style: theme dark for tech/finance/startup/cinematic, light for health/education/lifestyle when it fits. hue by emotion (250 violet tech-AI, 210 trust-blue, 160 teal health/eco, 25 orange energy-food, 340 pink creative, 45 gold history/luxury). energy calm for serious, high for hype. music ambient for explainers, upbeat for launches/promos.
style.brand ONLY for a specific named product/company — then open with a logo scene and close the CTA with it.`;

/* ── the long-form outline the script pass emits ──────────────────────────── */
// NOTE: style fields are FLAT (theme/hue/… at the top level, assembled into
// spec.style server-side). Opus's tool-mode serializer occasionally derails on a
// small nested object mid-stream ("style":"<parameter…") — flat fields don't.
const outlineSchema = z.object({
  title: z.string().describe("Short video title."),
  theme: z.enum(["dark", "light"]),
  hue: z.number().min(0).max(360).describe("Brand accent hue 0-360, matched to the topic's emotion."),
  hue2: z.number().min(0).max(360).optional(),
  energy: z.enum(["calm", "medium", "high"]).optional(),
  music: z.enum(["ambient", "upbeat", "none"]).optional(),
  brand: z.string().optional().describe("ONLY for a specific named product/company."),
  chapters: z
    .array(
      z.object({
        title: z.string().describe("Chapter title, 2-5 words (shown on a chapter card)."),
        focus: z.string().describe("1-2 sentences: exactly what this chapter covers and why it matters to the story."),
        beats: z.array(z.string()).min(3).max(7).describe("Concrete story beats — each a specific point/fact/step to cover, WITH real numbers/names from the research where possible."),
        opener: z.string().describe("The chapter's first narration line — must flow FROM the previous chapter's handoff."),
        handoff: z.string().describe("The chapter's final narration line — a bridge INTO the next chapter (or the closing thought for the last one)."),
        hueShift: z.number().min(-60).max(60).describe("This chapter's accent-hue rotation (vary across chapters: e.g. 0, 18, -22, 35 — each act gets its own color mood)."),
        bg: z.enum(["gradient", "dots", "grid", "waves", "blobs", "beams", "rings", "diag"]).describe("This chapter's dominant background flavor (vary across chapters)."),
      })
    )
    .min(3)
    .max(10),
});

const chapterScenesSchema = z.object({ scenes: z.array(sceneSchema).min(3).max(18) });

// SHORT-path plan schema — like the outline, style fields are FLAT (assembled into
// spec.style server-side) because Opus's tool-mode serializer occasionally derails
// on a small nested object, junking an otherwise perfect 16k-token plan.
const shortPlanSchema = z.object({
  title: z.string().describe("Short video title (for the file + history)."),
  theme: z.enum(["dark", "light"]),
  hue: z.number().min(0).max(360).describe("Brand accent hue 0-360, matched to the topic's emotion."),
  hue2: z.number().min(0).max(360).optional(),
  energy: z.enum(["calm", "medium", "high"]).optional().catch(undefined),
  music: z.enum(["ambient", "upbeat", "none"]).optional().catch(undefined),
  brand: z.string().optional().describe("ONLY for a specific named product/company."),
  captions: z.boolean().optional(),
  scenes: z.array(sceneSchema).min(3).max(16).describe("The story, in order: hook → build → payoff → CTA."),
});

/* ── research ─────────────────────────────────────────────────────────────── */
async function researchTopic(request: string, long: boolean): Promise<string> {
  if (!hasSearch()) return "";
  try {
    const queries = long
      ? [`${request} — explained: key facts, how it works, history, notable examples`, `${request} — statistics, numbers, records, data`]
      : [`${request} — key facts, numbers, how it works`];
    const results = await Promise.all(queries.map((q) => webSearch(q, { depth: "advanced", maxResults: 6 })));
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const r of results) {
      if (!r) continue;
      if (r.answer) parts.push(`ANSWER: ${r.answer}`);
      for (const it of r.results) {
        if (seen.has(it.url)) continue;
        seen.add(it.url);
        parts.push(`[${it.title}] ${it.content}`);
      }
    }
    return parts.join("\n").slice(0, long ? 9000 : 5000);
  } catch {
    return "";
  }
}

/* ── server-authoritative access gate ─────────────────────────────────────── */
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

/* ── media resolution (photos + footage), deduped + parallel ──────────────── */
async function resolveMedia(spec: MotionSpec, longForm: boolean): Promise<void> {
  type Slot = { el: MotionElement; kind: "image" | "video"; query: string };
  const slots: Slot[] = [];
  let footage = 0;
  const footageCap = longForm ? Math.max(5, Math.ceil(spec.scenes.length / 6)) : 4;
  for (const scene of spec.scenes) {
    for (const el of scene.elements || []) {
      if (el.chart) el.chart.values = el.chart.values.map((v) => Math.max(0, Number(v) || 0));
      el.imageUrl = undefined; // only the server may set media URLs
      el.videoUrl = undefined;
      if (el.type === "video" && el.videoQuery) {
        if (footage < footageCap) {
          footage++;
          slots.push({ el, kind: "video", query: el.videoQuery });
        } else {
          el.type = "image"; // over budget → downgrade to a photo of the same subject
          el.imageQuery = el.imageQuery || el.videoQuery;
        }
      }
      if (el.type === "image" && el.imageQuery) slots.push({ el, kind: "image", query: el.imageQuery });
    }
  }
  if (!slots.length || !hasPexels()) return;

  // one fetch per unique query; hand the i-th result to the i-th occurrence so the
  // same query never repeats the exact same asset across scenes
  const byQuery = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = `${s.kind}:${s.query.toLowerCase().trim()}`;
    byQuery.set(k, [...(byQuery.get(k) || []), s]);
  }
  const jobs = [...byQuery.entries()].map(([key, group]) => async () => {
    try {
      if (group[0].kind === "video") {
        const clips = await pexelsClips(group[0].query, Math.min(3, group.length + 1));
        group.forEach((s, i) => {
          const clip = clips[i % Math.max(1, clips.length)];
          if (clip) {
            s.el.videoUrl = clip.url;
            s.el.imageUrl = clip.poster; // poster doubles as the graceful fallback
          } else {
            s.el.type = "image";
            s.el.imageQuery = s.el.imageQuery || s.el.videoQuery;
          }
        });
        // a failed footage query still deserves a photo
        const missing = group.filter((s) => s.el.type === "image" && !s.el.imageUrl && s.el.imageQuery);
        if (missing.length) {
          const photos = await pexelsPhotos(missing[0].el.imageQuery!, missing.length);
          missing.forEach((s, i) => (s.el.imageUrl = photos[i % Math.max(1, photos.length)]));
        }
      } else {
        const photos = await pexelsPhotos(group[0].query, Math.min(4, group.length));
        group.forEach((s, i) => {
          if (photos.length) s.el.imageUrl = photos[i % photos.length];
        });
      }
    } catch {
      /* media is decorative — the engine draws styled placeholders */
    }
    void key;
  });
  // gentle concurrency so one plan can't hammer Pexels
  const CONC = 5;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, worker));
}

/* ── variety guard: demote immediate element-type repeats the model slipped in ── */
function enforceVariety(scenes: MotionScene[]): void {
  let prevType = "";
  for (const s of scenes) {
    const lead = s.elements?.[0];
    const t = lead?.type || "";
    if (t && t === prevType && s.elements && s.elements.length) {
      // repeated lead visual: soften by dropping to a headline-only beat when the
      // scene carries a headline, else leave it (better repeated than empty)
      if (s.headline && t !== "video" && t !== "image" && t !== "uiCard" && t !== "chart") s.elements = [];
    }
    prevType = s.elements?.[0]?.type || t;
  }
}

export async function POST(req: NextRequest) {
  let body: { request?: string; durationSec?: number; preflight?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const request = (body.request || "").trim().slice(0, INPUT_CAPS.graphicsRequest);
  if (!request) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (!hasAnthropic()) return NextResponse.json({ error: true }, { status: 200 });

  // requested length: 0/undefined = auto (~1 min); else clamp to 1-15 min.
  // The long-form pipeline boundary is shared with the cost formula, so the
  // surcharge is only ever charged when the multi-call pipeline actually runs.
  const durationSec = Math.min(GRAPHICS_MAX_SEC, Math.max(0, Math.round(body.durationSec || 0)));
  const longForm = durationSec > GRAPHICS_LONGFORM_SEC;
  const cost = graphicsPlanCost(durationSec);

  const admin = isAdmin(user);
  if (!admin && !(await allowed(user.id))) {
    // Pro/Max feature — free users unlock it by buying credits (no trial).
    return NextResponse.json({ error: "plan", feature: "graphics" }, { status: 402 });
  }

  // PRE-FLIGHT — read-only verify (no charge, no Opus) so the UI can stop early.
  if (body.preflight) {
    const avail = await creditsAvailable();
    if (avail !== null && avail < cost) {
      return NextResponse.json({ error: "credits", balance: avail, cost }, { status: 402 });
    }
    return NextResponse.json({ ok: true, cost });
  }

  const charge = await chargeCredits("graphics_plan", cost, { request: request.slice(0, 80), sec: durationSec }, user);
  if (!charge.ok) return chargeError(charge);

  try {
    // 1 ── RESEARCH: ground the script in real facts before any writing happens.
    const research = await researchTopic(request, longForm);
    const researchBlock = research ? `\n\nRESEARCH (live web — trust these figures over memory):\n${research}` : "";

    let spec: MotionSpec;

    if (!longForm) {
      // 2a ── SHORT: one Opus call designs the whole piece (classic path, research-grounded).
      const targetScenes = durationSec ? Math.max(5, Math.min(14, Math.round(durationSec / 8))) : 7;
      const genShort = () =>
        generateObject({
          model: MODELS.max(),
          schema: shortPlanSchema,
          system: `${CRAFT}\n\n${STYLE_GUIDE}\n\nSTORY: build a real arc across ~${targetScenes} scenes: HOOK (grab in 1 line) → PROBLEM/CONTEXT → CORE IDEA → HOW IT WORKS → PROOF (numbers) → CTA. Adapt to the topic. narration 1-3 short sentences per scene. FINAL scene = a clear CTA under 12 narration words.`,
          prompt: `${request}${researchBlock}`,
          maxRetries: 1,
          maxTokens: 16000,
        });
      // manual retry — the SDK does NOT retry schema-validation misses
      const { object } = await genShort().catch(() => genShort());
      spec = {
        title: object.title,
        style: { theme: object.theme, hue: object.hue, hue2: object.hue2, energy: object.energy, music: object.music, brand: object.brand },
        captions: object.captions,
        scenes: object.scenes,
      };
    } else {
      // 2b ── LONG-FORM: outline first (the SCRIPT pass), then chapters in parallel.
      // ~10.5s per scene: ~24 narration words (2.3 words/s spoken) + 1s settle.
      const totalScenes = Math.max(12, Math.min(120, Math.round(durationSec / 10.5)));
      const chapterCount = Math.max(3, Math.min(9, Math.round(totalScenes / 11)));
      // ≤12 scenes per chapter keeps a dense chapter comfortably inside its token budget
      const perChapter = Math.max(4, Math.min(12, Math.round(totalScenes / chapterCount)));

      // manual retry: the SDK does NOT retry schema-validation misses, only API errors
      const genOutline = () =>
        generateObject({
          model: MODELS.max(),
          schema: outlineSchema,
          system: `${CRAFT}\n\n${STYLE_GUIDE}\n\nYou are writing the OUTLINE for a ${Math.round(durationSec / 60)}-minute documentary-style explainer (~${totalScenes} scenes total). Design EXACTLY ${chapterCount} chapters that together tell one complete, satisfying story: a hook-driven opening chapter, escalating middle chapters (history → how it works → deep dive → real examples → numbers/proof), and a closing chapter that pays off the hook and ends with a CTA. Beats must be CONCRETE (specific facts, numbers, names from the research). openers/handoffs are real narration lines that make chapters flow seamlessly — the viewer must never feel a seam.`,
          prompt: `${request}${researchBlock}`,
          maxRetries: 1,
          maxTokens: 6000,
          abortSignal: AbortSignal.timeout(100_000),
        });
      const { object: outline } = await genOutline().catch(() => genOutline());

      // 3 ── SCENES per chapter, parallel (continuity comes from openers/handoffs).
      const chapterList = outline.chapters.map((c, i) => `${i + 1}. ${c.title} — ${c.focus}`).join("\n");
      const writeChapter = async (i: number): Promise<MotionScene[]> => {
        const ch = outline.chapters[i];
        const prev = i > 0 ? outline.chapters[i - 1] : null;
        const next = i < outline.chapters.length - 1 ? outline.chapters[i + 1] : null;
        const { object } = await generateObject({
          model: MODELS.max(),
          schema: chapterScenesSchema,
          system: `${CRAFT}\n\nYou are writing chapter ${i + 1} of ${outline.chapters.length} of a long-form video — scenes ONLY for THIS chapter (~${perChapter} scenes). Rules:
- The chapter's FIRST narration line is (verbatim or near-verbatim): "${ch.opener}"
- The chapter's LAST narration line is (verbatim or near-verbatim): "${ch.handoff}"
- ${prev ? `The previous chapter ("${prev.title}") just ended with: "${prev.handoff}" — continue mid-flow, NO re-introductions.` : "This is the opening chapter — the first line is the video's hook; grab in one sentence."}
- ${next ? `Do NOT conclude the video — the next chapter is "${next.title}".` : "This is the FINAL chapter — land the story's payoff and end with a short CTA (under 12 words)."}
- Cover ALL these beats, in order, roughly one to two scenes per beat:\n${ch.beats.map((b) => `  • ${b}`).join("\n")}
- Set hueShift: ${ch.hueShift} on EVERY scene of this chapter, and prefer bg "${ch.bg}" (vary with 1-2 others).
- narration: 2-3 sentences per scene (~20-35 words) — long-form documentary pacing.
- VARIETY: rotate element types hard; at least one video/image b-roll scene in this chapter when the subject is physical/real-world.`,
          prompt: `Video: ${outline.title} — user request: ${request}\n\nFull chapter map (context — write ONLY chapter ${i + 1}):\n${chapterList}${researchBlock}`,
          maxRetries: 1,
          maxTokens: 16000, // a dense 12-scene chapter (charts/compare/ui payloads) must never truncate
          abortSignal: AbortSignal.timeout(120_000),
        });
        return (object as { scenes: MotionScene[] }).scenes;
      };

      // concurrency 4 with one retry per failed chapter
      const results: (MotionScene[] | null)[] = new Array(outline.chapters.length).fill(null);
      let nextIdx = 0;
      const worker = async () => {
        while (nextIdx < outline.chapters.length) {
          const i = nextIdx++;
          try {
            results[i] = await writeChapter(i);
          } catch {
            try {
              results[i] = await writeChapter(i);
            } catch {
              results[i] = null; // dropped — assembly tolerates a missing chapter
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, outline.chapters.length) }, worker));

      const kept = results.map((r, i) => ({ scenes: r, chapter: outline.chapters[i] })).filter((x): x is { scenes: MotionScene[]; chapter: (typeof outline.chapters)[number] } => !!x.scenes?.length);
      const gotScenes = kept.reduce((a, k) => a + k.scenes.length, 0);
      // Fail ONLY when chapters were actually LOST and the story is materially short.
      // If every chapter succeeded, a leaner-than-asked video is still a good video.
      const lostChapters = kept.length < outline.chapters.length;
      if (!kept.length || (lostChapters && gotScenes < totalScenes * 0.55)) throw new Error(`long-form salvage too small (${gotScenes}/${totalScenes}, chapters ${kept.length}/${outline.chapters.length})`);

      const scenes: MotionScene[] = [];
      const chapters: { title: string; at: number }[] = [];
      for (const k of kept) {
        chapters.push({ title: k.chapter.title, at: scenes.length });
        for (const s of k.scenes) {
          if (s.hueShift === undefined) s.hueShift = k.chapter.hueShift;
          scenes.push(s);
        }
      }
      spec = {
        title: outline.title,
        style: { theme: outline.theme, hue: outline.hue, hue2: outline.hue2, energy: outline.energy, music: outline.music, brand: outline.brand },
        captions: true,
        scenes: scenes.slice(0, 140),
        chapters,
      };
    }

    if (!spec.scenes?.length) throw new Error("empty spec");

    // 4 ── sanitize + variety guard + media (photos + footage + mention cutaways)
    enforceVariety(spec.scenes);
    await Promise.all([
      resolveMedia(spec, longForm),
      // word-synced documentary cutaways: cap scales with length (memory-bound)
      resolveMentions(spec.scenes, longForm ? Math.min(160, spec.scenes.length * 2) : 16),
    ]);

    return NextResponse.json({ spec });
  } catch (e) {
    console.error("[graphics] plan failed:", e);
    // Refund into the EXACT buckets the charge drained (monthly and/or purchased), so
    // a subscriber's monthly spend is never laundered into permanent purchased credits
    // and a purchased-funded charge is never lost to the expiring bucket. Admins spend
    // nothing (charge returns 0/0) → refundSplit no-ops.
    if (charge.ok) await refundSplit(user.id, charge.fromBalance, charge.fromPurchased, "graphics_plan");
    return NextResponse.json({ error: true }, { status: 200 });
  }
}
