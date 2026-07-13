/**
 * VLAB — the PILOT for prompt → Zack-D-Films-style 3D-animated short.
 *
 * SCOPE HONESTY (agreed with the owner before building): this is a quality
 * pilot, not the full feature. The research verdict is on record — real Zack D
 * Films videos are made by human Blender artists ($1,000/short, 2-8 days), and
 * no 2026 AI pipeline can guarantee that bar. This pilot produces the closest
 * honestly-achievable version (stylized-3D AI shorts, hard cuts between shots)
 * so the owner can judge the real ceiling on ~$5 of API spend per attempt.
 *
 * This module: Opus turns ANY topic into a Zack-style production plan — hook
 * narration + a shot list where each shot carries a style-locked image prompt
 * (the keyframe) and a motion prompt (image-to-video direction). Nothing is
 * hardcoded per topic; the plan IS the creative work.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS } from "@/lib/models";

/** One consistent look across every shot of every video — the "channel style".
 *  Baked into every keyframe prompt so shots cut together coherently. */
export const STYLE_BLOCK =
  "stylized semi-realistic 3D render in the style of a premium educational animation, Blender Cycles look, soft cinematic studio lighting, shallow depth of field, clean saturated colors, smooth rounded character features, vertical 9:16 composition, high detail, no text, no watermark";

const shotSchema = z.object({
  line: z.string().describe("The exact narration sentence(s) spoken over THIS shot. Punchy, first-person-narrator curiosity tone ('When you swallow gum, it slides down your throat…'). 8-22 words."),
  imagePrompt: z.string().describe("The keyframe: a single vivid frame described for an image model — subject, framing (close-up/wide), what's happening, environment. Concrete and visual, no style words (style is appended automatically), no text in image. 15-40 words."),
  motionPrompt: z.string().describe("How this frame moves for 5-8 seconds: ONE simple motion (camera slowly pushes in / liquid flows down / hands tighten). Image-to-video models fail on complex multi-action prompts — keep it to one clear motion."),
  seconds: z.number().describe("Shot length in seconds: 5, 6, 7 or 8. Match roughly how long the narration line takes to say."),
});

const planSchema = z.object({
  title: z.string().describe("A curiosity-gap title for the short, like 'Why You Should Never Swallow Gum…'"),
  characterNote: z.string().describe("If the video features a recurring person, ONE reusable description used verbatim in every shot's imagePrompt that shows them (e.g. 'a young man with short brown hair in a plain grey t-shirt'). Empty string if no recurring character."),
  shots: z.array(shotSchema).describe("6-8 shots. Shot 1 is the HOOK (the most arresting image + the hook line). The sequence must tell one clear mini-story with a beginning, escalation and payoff/resolution."),
});

export type VlabShot = z.infer<typeof shotSchema>;
export type VlabPlan = z.infer<typeof planSchema>;

export async function planShort(topic: string): Promise<VlabPlan> {
  const { object } = await generateObject({
    model: MODELS.max(),
    schema: planSchema,
    system:
      "You are the head writer and director of a hugely popular short-form 3D-animated educational channel (30-60s vertical videos answering visceral curiosity questions about the body, survival, machines, history — the Zack D Films format). Your job: turn ANY topic into a production plan an AI image+video pipeline can execute. Rules learned from what actually works: open on the single most arresting visual; one simple motion per shot (the video model can't handle more); escalate stakes shot by shot; end on the payoff or twist; narration is conversational second-person where possible ('your throat', 'you'd feel'); keep facts accurate — this is education, never invent mechanisms. If the topic involves anatomy, describe visuals as clean stylized cutaways (educational, not gory). Use the characterNote VERBATIM in every imagePrompt featuring the recurring character so they look identical across shots.",
    prompt: `Topic: ${topic.slice(0, 500)}\n\nWrite the production plan.`,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(90_000),
  });
  return object;
}
