/**
 * Pricing knobs in ONE place. A "credit" is a unit of usage we sell at roughly
 * 3× cost-to-serve (covers payment fees + infra + margin). The $ comments are
 * approximate — verify against live Anthropic / ElevenLabs / Tavily pricing
 * before launch and tune here; nothing downstream hardcodes these numbers.
 */

/** Monthly credit allowance per plan. The webhook grants these on subscribe/renew. */
export const PLAN_GRANTS = { free: 150, pro: 2000, max: 6000 } as const;
export type PlanId = keyof typeof PLAN_GRANTS;

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
} as const;
export type Chargeable = keyof typeof ACTION_COSTS;

/** Isaac's voice is billed by length: 1 credit per 100 characters (min 1). */
export function ttsCost(chars: number): number {
  return Math.max(1, Math.ceil((chars || 0) / 100));
}

/**
 * Per-user burst caps: action → [maxRequests, windowSeconds]. Bounds how fast a
 * user can spend even within their credit budget (protects model concurrency and
 * gives the operator reaction time). Enforced by the rate_check DB function.
 */
export const RATE_LIMITS: Record<string, [number, number]> = {
  stats_plan: [8, 60],
  stats_edit: [10, 60],
  stats_file: [6, 60],
  search: [40, 60],
  game: [20, 60],
  caption: [20, 60],
  // Voice fires per line; a generous cap that normal beat-by-beat playback never
  // hits, but which bounds a burst of tiny concurrent calls (vendor overhead).
  tts: [120, 60],
};

/** Hard input caps so a single request can't be oversized. */
export const INPUT_CAPS = {
  brainText: 2000, // chars of a user message
  brainHistory: 40, // messages of context
  ttsChars: 1200, // a single Isaac line
  statsRequest: 600, // chars of a stat-battle prompt
  editInstruction: 1000,
};
