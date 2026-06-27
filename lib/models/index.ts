import { createGroq } from "@ai-sdk/groq";
import { createAnthropic } from "@ai-sdk/anthropic";

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
  smart: () => anthropic(ID.smart),
  /** Strongest reasoning — reserved for tasks where the answer MUST be correct. */
  genius: () => anthropic(ID.genius),
  /** Maximum accuracy/recall — for hard factual data assembly (cost/latency aware). */
  max: () => anthropicMax(ID.max),
} as const;

export const hasGroq = () => !!process.env.GROQ_API_KEY;
export const hasAnthropic = () => !!process.env.ANTHROPIC_API_KEY;
