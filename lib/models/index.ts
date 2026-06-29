import { createGroq } from "@ai-sdk/groq";
import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel, type LanguageModelV1Middleware } from "ai";

/**
 * Provider clients (direct keys). Groq is free + extremely fast (routing, chat,
 * light tasks). Anthropic Claude handles demanding reasoning (grounding,
 * careful explanations).
 *
 * Model IDs are read from env with proven defaults, so we can upgrade a tier —
 * or later route the whole layer through an AI gateway — by changing config/this
 * one file, never the brain. Keep Clunoid's brain DYNAMIC: nothing is hardcoded
 * deeper than here.
 */
export const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
export const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * AI SDK v4 ALWAYS sends `temperature` (defaulting to 0 — see its
 * `temperature != null ? temperature : 0`), but the newest Anthropic models
 * (Opus 4.8) reject it ("`temperature` is deprecated for this model"). This
 * client strips `temperature`/`top_p` from the request body so the top-tier
 * model works; it's used ONLY by MODELS.max, so nothing else is affected.
 */
const anthropicMax = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetch: async (input, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        delete body.temperature;
        delete body.top_p;
        init = { ...init, body: JSON.stringify(body) };
      } catch {
        /* leave body untouched if it isn't JSON */
      }
    }
    return fetch(input as string | URL | Request, init);
  },
});

/**
 * GLOBAL Anthropic prompt caching — applied to EVERY Anthropic call (current and
 * future) from this one place, so no feature ever has to opt in.
 *
 * What it does: tags the SYSTEM prompt block with Anthropic `cache_control:
 * ephemeral`. Anthropic then caches that prefix (tools + system) for ~5 minutes.
 * The cache is ORG-scoped and keyed on the EXACT prefix bytes, so every user who
 * hits the same feature shares one entry — after the first request the prefix is
 * served at ~10% of input price and skipped on the model (also lower latency).
 *
 * Why system-only, never messages:
 *  - The system prompt is the part that actually repeats (identical across users
 *    and across one-shot requests) — that's where cache reads come from.
 *  - It contains NO user data, so nothing private is ever written to the cache.
 *    User/assistant messages vary per request (no reuse) and may carry private
 *    data, so we deliberately never tag them.
 *
 * Why it's safe to leave on for everything: marking a prefix BELOW a model's
 * minimum cacheable size (Sonnet 2048, Opus/Haiku 4096 tokens) is a silent no-op
 * on Anthropic's side — no cache write, no extra charge. Today every Clunoid
 * system prompt is below that size, so this is free now and starts saving money
 * automatically once a prompt grows past the threshold.
 *
 * CONVENTION for future features (this is what makes the cache pay off): keep the
 * `system` string BYTE-STABLE across requests — no timestamps, request IDs, or
 * per-user text baked into it — and put per-request data in `messages`. A large
 * but ever-changing system prompt would never read the cache and only pay the
 * 1.25x write, so keep the volatile bits out of `system`.
 */
const cacheSystemPrompt: LanguageModelV1Middleware = {
  transformParams: async ({ params }) => {
    const prompt = params.prompt;
    if (!Array.isArray(prompt)) return params;
    const next = prompt.map((msg) =>
      msg.role === "system" && typeof msg.content === "string" && msg.content.length > 0
        ? {
            ...msg,
            providerMetadata: {
              ...msg.providerMetadata,
              anthropic: { ...msg.providerMetadata?.anthropic, cacheControl: { type: "ephemeral" } },
            },
          }
        : msg
    );
    return { ...params, prompt: next };
  },
};

/** Wrap an Anthropic model so its system prompt is cached. Groq is left untouched
 *  (no Anthropic cache there, and it's already free + fast). */
const cached = (model: ReturnType<typeof anthropic>) =>
  wrapLanguageModel({ model, middleware: cacheSystemPrompt });

const ID = {
  fast: process.env.CLUNOID_MODEL_FAST || "llama-3.1-8b-instant",
  smart: process.env.CLUNOID_MODEL_SMART || "claude-haiku-4-5-20251001",
  genius: process.env.CLUNOID_MODEL_GENIUS || "claude-sonnet-4-6",
  // Top-tier Anthropic model for the few tasks where factual recall must be as
  // strong as possible (e.g. assembling accurate historical ranking data). Kept
  // separate so escalating it never changes the rest of the app's `genius` tier.
  max: process.env.CLUNOID_MODEL_MAX || "claude-opus-4-8",
} as const;

/** Model tiers — escalate only when a task truly needs it (cost discipline). */
export const MODELS = {
  /** Free, very fast: routing, chat, quick replies. */
  fast: () => groq(ID.fast),
  /** Cheap + accurate Claude: fact-grounding, structured explanations. */
  smart: () => cached(anthropic(ID.smart)),
  /** Strongest reasoning — reserved for tasks where the answer MUST be correct. */
  genius: () => cached(anthropic(ID.genius)),
  /** Maximum accuracy/recall — for hard factual data assembly (cost/latency aware). */
  max: () => cached(anthropicMax(ID.max)),
} as const;

export const hasGroq = () => !!process.env.GROQ_API_KEY;
export const hasAnthropic = () => !!process.env.ANTHROPIC_API_KEY;
