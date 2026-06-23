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

const ID = {
  fast: process.env.CLUNOID_MODEL_FAST || "llama-3.1-8b-instant",
  smart: process.env.CLUNOID_MODEL_SMART || "claude-haiku-4-5-20251001",
  genius: process.env.CLUNOID_MODEL_GENIUS || "claude-sonnet-4-6",
} as const;

/** Model tiers — escalate only when a task truly needs it (cost discipline). */
export const MODELS = {
  /** Free, very fast: routing, chat, quick replies. */
  fast: () => groq(ID.fast),
  /** Cheap + accurate Claude: fact-grounding, structured explanations. */
  smart: () => anthropic(ID.smart),
  /** Strongest reasoning — reserved for tasks where the answer MUST be correct. */
  genius: () => anthropic(ID.genius),
} as const;

export const hasGroq = () => !!process.env.GROQ_API_KEY;
export const hasAnthropic = () => !!process.env.ANTHROPIC_API_KEY;
