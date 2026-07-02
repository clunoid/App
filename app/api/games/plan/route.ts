import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import { requireUser } from "@/lib/auth/requireUser";
import { chargeCredits, chargeError, refund, isAdmin, creditsAvailable } from "@/lib/billing/meter";
import { ACTION_COSTS, INPUT_CAPS } from "@/lib/billing/costs";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_SPREAD, loadFlagNames, shuffle, buildAllCountries, worldSpread, roundsFromCodes } from "@/lib/games/flagcodes";

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

const SYSTEM = `You are planning a "guess the country by its flag" recap VIDEO. Read the user's request, decide the MODE, and return the flags. ACCURACY IS THE #1 PRIORITY — every country you include MUST genuinely, verifiably match the request, and every code MUST be the correct ISO 3166-1 alpha-2 code for that country.

MODE:
- "category": the request names a SPECIFIC set — a region/continent, a theme, a PROPERTY of the flag (stars, crescents, colors, stripes, symbols), a pasted LIST of countries, "X's neighbours", etc. List EVERY real country/territory that TRULY matches — complete and exhaustive, none missing, NONE that don't belong. Do NOT cap or sample. The ONLY exception: if the user explicitly asks for a NUMBER (e.g. "20 african countries", "15 hard flags"), return EXACTLY that many. Set a brief 2-4 word "subtitle" naming the category as the user framed it.
- "general": a vague worldwide / random / mixed request with NO specific category ("random", "a mix", "world flags", "surprise me"). Return a FEW samples — the server expands into a full worldwide spread. OMIT the subtitle.
- "all": every country / all the flags in the world. Return a few samples — the server expands to the full world list. OMIT the subtitle.

ACCURACY RULES (this is where results go wrong — be rigorous):
- INCLUDE a country ONLY IF YOU ARE CERTAIN it matches. If you are not sure, LEAVE IT OUT. A shorter, 100% correct list is ALWAYS better than a longer one with a single wrong flag.
- Verify each candidate against the ACTUAL flag before including it. Common mistakes to AVOID:
  • "stars": include flags that REALLY have star(s) — e.g. us, cn, vn, cl, cu, br (many stars), tr & tn & pk (star+crescent), au & nz (Southern Cross), sy, do. EXCLUDE flags with NO star — e.g. Indonesia (id, plain red-white), Poland (pl), Japan (jp, a red DISC, not a star), Monaco (mc), France (fr), Germany (de), Ukraine (ua).
  • "crescent": tr, pk, tn, dz, ly, mv, mr, az, tm, cc, km, uz(no) — include only true crescents.
  • Property/color prompts: judge by the flag's real design, not by name association.
- PASTED LIST: if the user pasted or listed specific countries (comma/line/"and" separated, e.g. "France, Germany, Japan and Brazil"), use EXACTLY those — every one they named and NONE they didn't. Map each name to its correct ISO code; silently drop only an entry that isn't a real country.
- Use correct lowercase ISO 3166-1 alpha-2 codes; include dependent territories only when they genuinely fit.
- For each round return ONLY the lowercase code + a difficulty ('easy' = globally famous like us/fr/jp/br; 'medium' = moderately known; 'hard' = obscure). The server fills in official names.
- No duplicate countries. Honor an explicit count EXACTLY.`;

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
  let body: { request?: string; voice?: string; preflight?: boolean } = {};
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

  // PRE-FLIGHT — verify (READ-ONLY: no charge, no Opus) that the user is authed, can
  // afford the plan, and has premium quota BEFORE the expensive Opus call runs. Mirrors
  // the stat-battle preflight; stops misuse/waste (the atomic charge below is still the
  // binding gate, so this can't be bypassed).
  if (body.preflight) {
    const avail = await creditsAvailable();
    if (avail !== null && avail < ACTION_COSTS.video_plan) {
      return NextResponse.json({ error: "credits", balance: avail }, { status: 402 });
    }
    if (premium && !admin) {
      const supabase = await getSupabaseServer();
      const { data } = await supabase.rpc("video_direct_status");
      const st = data as { subscriber?: boolean; available?: boolean } | null;
      if (st && !st.subscriber && st.available === false) {
        return NextResponse.json({ error: "video_limit", feature: "video" }, { status: 402 });
      }
    }
    return NextResponse.json({ ok: true });
  }

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

  // 4) DISPATCH by mode. Order is fully SHUFFLED (not the easy→hard ramp) so the same
  //    prompt makes a differently-ordered video every time; each flag keeps its
  //    difficulty (shown as its badge), so difficulty is preserved, only the order varies.
  if (object?.mode === "all") {
    return NextResponse.json({ title: object.title || "All Countries", secondsPerRound: object.secondsPerRound ?? 8, rounds: shuffle(buildAllCountries(names)), premium });
  }
  if (object?.mode === "general") {
    return NextResponse.json({ title: object.title || "World Flags", secondsPerRound: object.secondsPerRound ?? 7, rounds: shuffle(worldSpread(names, DEFAULT_SPREAD)), premium });
  }

  // "category" → Opus's COMPLETE list, validated against flagcdn (drops fake/dupe codes).
  let rounds = shuffle(roundsFromCodes(object?.rounds || [], names));
  // Honor an explicit count in the prompt as a safety cap (Opus should already obey it).
  const askedN = Number((request.match(/\b(\d{1,3})\b/) || [])[1]);
  if (askedN >= 1 && askedN < rounds.length) rounds = rounds.slice(0, askedN);

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
    rounds,
    premium,
  });
}
