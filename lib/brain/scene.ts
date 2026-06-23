import { z } from "zod";

/**
 * A Scene is the structured output of Isaac's brain. The frontend renders it.
 * The LLM never emits code — only this small, validated payload. That keeps
 * interactions fast, cheap, and safe. New features add an experience here +
 * register a renderer; nothing else in the pipeline changes.
 */

// ── Experiences (what can appear on the Stage) ─────────────────────────

/** A simple info card: a picture beside text + optional bullets. */
export const richCardSchema = z.object({
  type: z.literal("rich_card"),
  title: z.string().optional(),
  body: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
});

/**
 * A narrated explainer: an ordered list of "beats". Each beat is a spoken
 * segment, optionally illustrated by an entity (person / place / flag / thing)
 * whose image or clip pops onto the Stage as Isaac mentions it — a synced,
 * animated story. Past beats' visuals shrink into a timeline.
 */
export const explainerEntitySchema = z.object({
  name: z.string(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  poster: z.string().url().optional(),
  caption: z.string().optional(),
  kind: z.enum(["person", "place", "flag", "concept", "thing"]).optional(),
});
export const explainerBeatSchema = z.object({
  say: z.string(),
  entity: explainerEntitySchema.optional(),
});
/** One data point in the supplementary "at a glance" summary. */
export const explainerFactSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export const explainerSchema = z.object({
  type: z.literal("explainer"),
  title: z.string().optional(),
  beats: z.array(explainerBeatSchema).min(1),
  /** A full-width "data summary" shown BELOW the media + script — a clean, colored
   *  infobox of key established facts for the reader. Isaac does NOT narrate these. */
  facts: z.array(explainerFactSchema).optional(),
});

export const experienceSchema = z.discriminatedUnion("type", [richCardSchema, explainerSchema]);

export type Experience = z.infer<typeof experienceSchema>;
export type RichCardExperience = z.infer<typeof richCardSchema>;
export type ExplainerExperience = z.infer<typeof explainerSchema>;
export type ExplainerEntity = z.infer<typeof explainerEntitySchema>;
export type ExplainerFact = z.infer<typeof explainerFactSchema>;

// ── The Scene envelope ─────────────────────────────────────────────────

export const sceneSchema = z.object({
  /** What Isaac says out loud (and shows as a caption). */
  say: z.string(),
  /** Optional experience to mount on the Stage. */
  experience: experienceSchema.optional(),
  /** If true, clear the current experience (Isaac is just talking now). */
  clear: z.boolean().optional(),
  /** If true, keep the current experience on screen (a short interactive reply). */
  keep: z.boolean().optional(),
  /** If true, after this short reply, resume the current explainer where Isaac left off. */
  resume: z.boolean().optional(),
  /** What kind of input Isaac is now waiting for. */
  expectsInput: z.enum(["voice", "text", "choice", "none"]).default("voice"),
});

export type Scene = z.infer<typeof sceneSchema>;
