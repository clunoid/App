/**
 * Pricing knobs in ONE place. A "credit" is a unit of usage we sell at roughly
 * 3× cost-to-serve (covers payment fees + infra + margin). The $ comments are
 * approximate — verify against live Anthropic / ElevenLabs / Tavily pricing
 * before launch and tune here; nothing downstream hardcodes these numbers.
 */

/** Monthly credit allowance per plan. The webhook grants these on subscribe/renew. */
export const PLAN_GRANTS = { free: 150, pro: 2000, max: 6000 } as const;
export type PlanId = keyof typeof PLAN_GRANTS;

/** One-time credit top-ups (pay-what-you-want). 200 credits per US$ (the Max rate).
 *  ONE knob — tune the rate here; nothing else hardcodes it. */
export const CREDITS_PER_USD = 200;
/** Minimum top-up purchase, in cents (mirror this as the Polar product's PWYW min). */
export const MIN_TOPUP_CENTS = 500; // $5
/** Maximum top-up, in cents. Enforced at checkout AND used to bound the webhook
 *  credit grant, so a misconfigured Polar product price can't mint unbounded credits. */
export const MAX_TOPUP_CENTS = 1_000_000; // $10,000
/** Credits granted for a paid NET amount (cents, after discount, before tax). */
export function creditsForCents(netCents: number): number {
  if (!netCents || netCents < 0) return 0;
  return Math.round((netCents / 100) * CREDITS_PER_USD);
}

/** Fixed credit cost per chargeable action (TTS is variable — see ttsCost). */
export const ACTION_COSTS = {
  search: 10, // /api/brain        — Groq + Tavily + Haiku/Sonnet      (~$0.02–0.08)
  game: 8, // /api/games/flags      — Sonnet/Groq classify             (~$0.02)
  caption: 2, // /api/share-caption — Haiku                            (~$0.002)
  // Stat Battle is charged in two parts so catalogue (World Bank) topics — which
  // never touch Opus — stay cheap, while a custom AI battle pays for Opus:
  stats_plan: 40, //  base: Sonnet routing/plan + Tavily research (~$0.2). Always charged.
  stats_opus: 460, // added ONLY when the heavy Opus data series runs (~$2) → custom battle = 500.
  stats_edit: 500, // /api/stats/edit      — full-dataset rewrite on Opus
  stats_file: 600, // /api/stats/from-file — read a document + assemble on Opus (larger input)
  // Video Direct (Guess the Country): Opus plans the full round list from the prompt.
  // Charged once per generation; the per-line narration is billed separately via ttsCost
  // (feature "video") during the client-side render, so long videos naturally cost more.
  video_plan: 50, // /api/games/plan — Opus round-list planner (~$0.25)
  // Motion Graphics: Opus designs a full multi-scene motion-graphics spec (the most
  // expensive plan we run — long structured output). Narration TTS billed per line on top.
  graphics_plan: 500, // /api/graphics/plan — Opus scene-graph designer (~$2)
  // Edge — AI sports prediction & prediction videos (Pro/Max feature). Analysis runs
  // Opus + Tavily for a single deep read (ESPN-only + light for bulk slates); the video
  // planner runs several Opus calls; premium ElevenLabs narration is billed per line
  // (action "edge_tts", variable via ttsCost) during the client-side render.
  edge_analyze: 40, //  /api/edge/predict     — Opus interpret + Tavily research (~$0.2)
  edge_video_plan: 180, // /api/edge/video/plan — Opus matchup-extract + Opus dialogue + per-match predicts + Pexels (~$0.9)
  edge_daily: 60, //     /api/edge/daily       — a 10-match slate, light per match (ESPN data only, no Opus)
  // Career Desk — AI job-application platform (admin-only at launch; the charges are
  // wired now so opening it up later is just the access switch in lib/career/access.ts).
  career_parse: 15, //    /api/career/profile           — Haiku structured resume parse (~$0.03)
  career_analyze: 25, //  /api/career/applications POST — Haiku JD extraction + deterministic match (~$0.05)
  career_generate: 60, // /api/career/.../generate      — Sonnet docs; the tailored resume runs Opus (~$0.3)
} as const;
export type Chargeable = keyof typeof ACTION_COSTS;

/**
 * GENEROUS floor for a custom (Opus) Stat Battle. The list price is
 * stats_plan + stats_opus = 500, but to be generous a user holding at least HALF (250)
 * may still create one — it then drains ALL their remaining credits, capped at the list
 * price (so 250–499 → charged exactly what they have; ≥500 → 500). Below this they're
 * blocked (buy credits / subscribe). Enforced ATOMICALLY by consume_credits_capped, so a
 * user under the floor can never spend the expensive Opus call. */
export const STATS_OPUS_FLOOR = (ACTION_COSTS.stats_plan + ACTION_COSTS.stats_opus) / 2; // 250

/** Isaac's voice is billed by length: 1 credit per 100 characters (min 1). */
export function ttsCost(chars: number): number {
  return Math.max(1, Math.ceil((chars || 0) / 100));
}

/** Longest motion-graphics video a user may request (seconds). */
export const GRAPHICS_MAX_SEC = 900; // 15 minutes

/** Videos LONGER than this run the multi-call research → outline → chapters
 *  pipeline; at or below it, one classic Opus call plans the whole piece.
 *  The cost formula below scales from the SAME boundary, so a user is only
 *  charged the long-form surcharge when the long-form pipeline actually runs. */
export const GRAPHICS_LONGFORM_SEC = 150;

/**
 * Motion Graphics plan cost scales with the REQUESTED duration: longer videos run
 * research + a script outline + several parallel Opus chapter calls (real compute).
 * Base 500 covers the single-call plan (up to 2.5 min); each extra minute adds 300.
 * 15 min = 4250. Narration TTS is still billed per line on top.
 */
export function graphicsPlanCost(durationSec: number): number {
  const sec = Math.min(GRAPHICS_MAX_SEC, Math.max(0, durationSec || 0));
  if (sec <= GRAPHICS_LONGFORM_SEC) return ACTION_COSTS.graphics_plan;
  return ACTION_COSTS.graphics_plan + Math.ceil((sec - GRAPHICS_LONGFORM_SEC) / 60) * 300;
}

/**
 * Per-user burst caps: action → [maxRequests, windowSeconds]. Bounds how fast a
 * user can spend even within their credit budget (protects model concurrency and
 * gives the operator reaction time). Enforced by the rate_check DB function.
 */
export const RATE_LIMITS: Record<string, [number, number]> = {
  stats_plan: [8, 60],
  stats_opus: [8, 60], // the generous capped Opus sub-charge — same burst cap as the plan fee
  stats_edit: [10, 60],
  stats_file: [6, 60],
  search: [40, 60],
  game: [20, 60],
  video_plan: [6, 60], // Opus planner — a modest burst cap (heavy compute)
  graphics_plan: [3, 60], // Opus motion-graphics designer — the heaviest single call we run
  graphics_suggest: [30, 60], // free Groq idea button — generous, but bounds spam of the LLM call
  caption: [20, 60],
  // Voice fires per line; a generous cap that normal beat-by-beat playback never
  // hits, but which bounds a burst of tiny concurrent calls (vendor overhead).
  tts: [120, 60],
  // Edge (Pro/Max sports predictions + videos)
  edge_analyze: [20, 60],
  edge_video_plan: [6, 60], // Opus-heavy planner
  edge_tts: [120, 60], // premium ElevenLabs per line — matches the shared tts cap
  edge_daily: [6, 60], // the 10-match slate — fans out across many leagues
  // Career Desk
  career_parse: [6, 60],
  career_analyze: [10, 60],
  career_generate: [10, 60], // per-document generation (the resume one runs Opus)
};

/** Hard input caps so a single request can't be oversized. */
export const INPUT_CAPS = {
  brainText: 2000, // chars of a user message
  brainHistory: 40, // messages of context
  ttsChars: 1200, // a single Isaac line
  statsRequest: 600, // chars of a stat-battle prompt
  graphicsRequest: 4000, // chars of a motion-graphics brief (long-form briefs carry outlines/notes)
  editInstruction: 1000,
};
