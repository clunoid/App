/**
 * VLAB — the DIRECTOR. Everything expensive (video generation) is downstream of
 * this file, so all the thinking happens here, where thinking is cheap:
 *
 *  1. screenplay()  — Opus develops the FULL STORY of any topic: a real-world
 *     opening with a recurring character, the mechanism told beat by beat as it
 *     happens in nature, and a real-world payoff — never a floating close-up
 *     reel. It writes a reusable CHARACTER SHEET + per-scene continuity so every
 *     keyframe shows the same person in the same world.
 *  2. critique()    — a second Opus pass adversarially checks the screenplay
 *     (story completeness, factual accuracy, visual continuity, narration
 *     pacing, one-motion-per-shot) and returns the CORRECTED screenplay.
 *
 * The keyframes themselves are then generated as an EDIT CHAIN (nano-banana):
 * character sheet first, then each frame is derived from [character sheet +
 * previous frame] — identity and world stay locked shot to shot. Kling animates
 * each frame (with the NEXT frame as end-frame when the camera should flow),
 * and narration timing is measured (ElevenLabs timestamps) so every clip is cut
 * to its exact spoken line. Users can't afford retries; the design goal is
 * first-try quality.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS } from "@/lib/models";

/** The channel look, appended to every image prompt. Premium 3D-animated-film
 *  realism (the Zack-style bar): physically-based, cinematic, consistent. */
export const STYLE_BLOCK =
  "premium 3D animated film still, semi-realistic stylized characters, physically based rendering, cinematic volumetric lighting, soft shadows, detailed skin and material textures, shallow depth of field, rich filmic color grade, vertical 9:16 composition, ultra high detail, no text, no watermark, no logo";

const shotSchema = z.object({
  line: z.string().describe("The narration spoken over THIS shot. Conversational, second-person where natural ('the moment you swallow…'). 8-24 words. The lines must flow as ONE continuous script when read back to back."),
  keyframePrompt: z.string().describe("Instruction for an image-EDIT model that receives the character sheet and the previous shot's frame as references. Describe exactly what THIS frame shows: subject, action frozen mid-moment, camera framing (extreme close-up / medium / wide), environment. Refer to continuity explicitly ('the same man from the reference images', 'the same marble bathroom'). When the shot is inside the body, describe a clean stylized educational cutaway. 25-60 words, no style words (appended automatically)."),
  motionPrompt: z.string().describe("The 3-10 seconds of motion: ONE clear primary movement (camera slowly pushes in / the gum slides downward / he raises the gum to his mouth). Video models fail on multi-action prompts."),
  sceneChange: z.boolean().describe("true when this shot jumps to a new location or scale (kitchen → inside the throat) — a clean hard cut. false when it continues the previous shot's space — the clip will then FLOW into the next frame (continuous camera feel)."),
  showsCharacter: z.boolean().describe("true when the recurring character (or the real-world scene) is visible in this frame; false for pure interior/mechanism cutaway shots. This controls image references: character shots are anchored to the character sheet, cutaway shots must NEVER show the person or the room."),
  seconds: z.number().describe("Planned shot length 3-10 (integer): roughly the narration line's spoken duration plus 1. Exact timing is measured later from the real voice-over."),
});

const planSchema = z.object({
  title: z.string().describe("Curiosity-gap title, like 'Why You Should Never Swallow Gum…'"),
  logline: z.string().describe("One sentence: the full story this video tells, beginning to end."),
  characterSheet: z.string().describe("The recurring protagonist, described ONCE for a text-to-image model: age range, build, skin tone, hair, exact clothing colors, one memorable feature. Specific enough that the same person is recognizable in every shot (e.g. 'a man in his late 20s, medium build, warm brown skin, short black fade haircut, mustard-yellow crew-neck t-shirt, silver watch on left wrist'). If the topic truly has no human protagonist, describe the recurring hero object/creature instead."),
  worldNote: z.string().describe("The recurring real-world setting + lighting continuity, stated once (e.g. 'a bright modern kitchen with white marble counters and warm morning window light; interiors of the body are lit with a soft clinical teal-pink glow'). Every keyframe must feel like the same world."),
  shots: z.array(shotSchema).describe("6-9 shots telling the COMPLETE story: (1) real-world HOOK — the character and the arresting setup, (2) the triggering action seen clearly, (3-…) the mechanism inside/behind it, beat by beat as it truly happens in nature, (4) the real-world PAYOFF/resolution that closes the loop (often the same character, later). Never open inside the mechanism; never end without returning the viewer to the world."),
});

export type VlabShot = z.infer<typeof shotSchema>;
export type VlabPlan = z.infer<typeof planSchema>;

const DIRECTOR_SYSTEM =
  "You are the head writer-director of a top short-form 3D-animated channel (the Zack D Films format: 30-60s vertical videos answering visceral curiosity questions). Viewers pay real money per video and get ONE take — the screenplay must be complete, correct and shootable first try.\n" +
  "NON-NEGOTIABLES learned from what works:\n" +
  "- FULL STORY, not a close-up reel: open in the real world with the recurring character and the arresting setup; SHOW the triggering action; then travel inside the mechanism beat by beat exactly as it happens in nature; then RETURN to the real world for the payoff. The viewer must be able to retell the whole story afterward.\n" +
  "- FACTUAL: the mechanism beats must be true to nature/science. Never invent steps. Simplify, don't distort.\n" +
  "- CONSISTENCY IS SACRED: one character sheet, used everywhere; one world note; every keyframePrompt explicitly anchors to 'the same man/woman' and 'the same <place>'. Wardrobe, lighting and palette never drift.\n" +
  "- ONE motion per shot. Camera language stays simple and smooth: push in, pull back, glide, follow.\n" +
  "- NARRATION: written to be READ ALOUD as one flowing script — no headers, no numbers; each line belongs to its shot and roughly fills it. Hook line first ('You've been told…', 'The second you…'). End with the satisfying resolution line.\n" +
  "- Interiors of the body/machines are clean stylized educational cutaways — vivid, not gory. Mark them showsCharacter:false; the person and the room must NOT appear in those frames. Real-world shots (showsCharacter:true) show the character normally from the outside — never with an x-ray/cutaway overlay.\n" +
  "- Vertical 9:16 framing: compose for a phone screen (centered subjects, close framing).";

export async function screenplay(topic: string): Promise<VlabPlan> {
  const { object } = await generateObject({
    model: MODELS.max(),
    schema: planSchema,
    system: DIRECTOR_SYSTEM,
    prompt: `Topic: ${topic.slice(0, 500)}\n\nFirst think through the complete story (real-world open → true mechanism → real-world payoff), then write the full production screenplay.`,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(120_000),
  });
  return object;
}

/** Adversarial second pass — a fresh Opus context tries to find what would make
 *  the paid video disappoint (missing story beats, factual errors, continuity
 *  drift, unshootable prompts, narration that won't fit) and returns the
 *  CORRECTED screenplay. Costs tokens; saves generation dollars. */
export async function critique(topic: string, draft: VlabPlan): Promise<VlabPlan> {
  const { object } = await generateObject({
    model: MODELS.max(),
    schema: planSchema,
    system:
      DIRECTOR_SYSTEM +
      "\nYou are now the RUTHLESS REVIEWER of another director's screenplay. The video costs real money and gets one take. Hunt for: a missing real-world opening or payoff; mechanism beats that skip or distort how it really happens in nature; keyframes that don't anchor to the character sheet or world note (continuity drift); multi-action motion prompts; narration lines that read like captions instead of one flowing spoken script, or that can't fit their shot length; anything an image model would misdraw. Rewrite whatever fails. Return the FULL corrected screenplay — every field, not a diff. If the draft is already excellent, return it with only surgical improvements.",
    prompt: `Topic: ${topic.slice(0, 500)}\n\nDraft screenplay to review and correct:\n${JSON.stringify(draft)}`,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(120_000),
  });
  return object;
}
