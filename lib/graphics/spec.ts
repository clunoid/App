/**
 * MOTION GRAPHICS — the declarative scene graph. Opus emits THIS (validated JSON,
 * never code); the deterministic canvas engine renders it. Expressive enough for the
 * modern SaaS/tech explainer genre (kinetic type, icons, UI mockups, charts, timelines,
 * counters, shapes, captions) while staying sparse — every field the model can omit has
 * an engine default, so a lean spec still renders polished.
 *
 * Shared by the server planner (zod validation) and the client engine (types).
 */
import { z } from "zod";

/* ── elements ─────────────────────────────────────────────────────────────── */
export const elementSchema = z.object({
  type: z
    .enum(["title", "text", "bullets", "icon", "iconGrid", "chart", "counter", "uiCard", "timeline", "progress", "quote", "badge", "image", "logo"])
    .describe("What to draw. title=big kinetic headline; text=supporting line(s); bullets=staggered list; icon=one hero icon; iconGrid=3-6 icons with labels; chart=animated bar/line/donut; counter=big number counting up; uiCard=animated app/browser/phone mockup; timeline=steps left→right; progress=filling ring/bar; quote=large quotation; badge=small pill label; image=photo (engine Ken-Burns); logo=brand wordmark animation."),
  text: z.string().optional().describe("Main text (title/text/quote/badge/counter suffix label/logo wordmark)."),
  sub: z.string().optional().describe("Secondary smaller line under the main text."),
  items: z.array(z.string()).max(6).optional().describe("bullets/timeline steps/iconGrid labels (3-6 short items)."),
  icon: z.string().optional().describe("Icon name for icon/badge/bullets marker — pick from the icon library given in the brief."),
  icons: z.array(z.string()).max(6).optional().describe("iconGrid: one icon per item (same order)."),
  value: z.number().optional().describe("counter: the number to count up to. progress: 0-100."),
  prefix: z.string().optional().describe("counter prefix, e.g. '$'."),
  suffix: z.string().optional().describe("counter suffix, e.g. '%', 'M+', ' users'."),
  chart: z
    .object({
      kind: z.enum(["bar", "line", "donut", "area"]),
      labels: z.array(z.string()).max(8),
      values: z.array(z.number()).max(8),
      highlight: z.number().int().optional().describe("Index of the standout slice/bar to emphasise."),
    })
    .optional()
    .describe("chart data (required for type=chart)."),
  ui: z
    .object({
      frame: z.enum(["browser", "phone", "card"]).describe("The mockup chrome."),
      title: z.string().optional().describe("Window/app title text."),
      rows: z.array(z.string()).max(5).optional().describe("Row labels shown inside (e.g. features, list items, transactions)."),
      cta: z.string().optional().describe("A button label that gets 'clicked' (pulses)."),
      stat: z.string().optional().describe("A highlighted stat/balance shown large inside, e.g. '$12,480'."),
    })
    .optional()
    .describe("uiCard content (required for type=uiCard)."),
  imageQuery: z.string().optional().describe("image: a 2-4 word stock-photo search (the server resolves the actual photo)."),
  imageUrl: z.string().optional().describe("Filled by the server — never set this yourself."),
  anim: z.enum(["rise", "fade", "pop", "slide", "cascade", "draw"]).optional().describe("Entrance style. Default: engine picks per type (rise for text, pop for icons, draw for charts)."),
  emphasis: z.enum(["none", "pulse", "float", "glow"]).optional().describe("Subtle loop after entering. Default none."),
  accent: z.boolean().optional().describe("Tint this element with the accent color (use sparingly for the ONE key element of a scene)."),
});
export type MotionElement = z.infer<typeof elementSchema>;

/* ── scenes ───────────────────────────────────────────────────────────────── */
export const sceneSchema = z.object({
  narration: z.string().min(1).describe("What the voice says over this scene — 1-3 short conversational sentences (spoken style, no markdown). The scene lasts as long as this takes to say. Write in the USER'S language."),
  layout: z.enum(["center", "split", "stack", "grid", "full"]).optional().describe("center=one focal element; split=text left, visual right (flips on vertical); stack=headline above visual; grid=elements tiled; full=edge-to-edge visual with overlaid text. Default: engine picks."),
  headline: z.string().optional().describe("The scene's on-screen headline (2-6 punchy words) — kinetic type. Most scenes should have one."),
  kicker: z.string().optional().describe("Tiny uppercase eyebrow above the headline, e.g. 'STEP 1', 'THE PROBLEM'."),
  elements: z.array(elementSchema).max(4).describe("0-3 visual elements beside/below the headline. ONE strong visual beats three weak ones."),
  transition: z.enum(["fade", "slide", "wipe", "zoom"]).optional().describe("Into the NEXT scene. Default fade."),
  bg: z.enum(["gradient", "dots", "grid", "waves", "blobs", "beams"]).optional().describe("Animated background flavor for this scene. Default: follows the spec style."),
  tone: z.enum(["intro", "problem", "solution", "how", "proof", "cta", "neutral"]).optional().describe("The scene's storytelling role — nudges composition + color intensity."),
});
export type MotionScene = z.infer<typeof sceneSchema>;

/* ── the spec ─────────────────────────────────────────────────────────────── */
export const motionSpecSchema = z.object({
  title: z.string().describe("Short video title (for the file + history)."),
  style: z.object({
    theme: z.enum(["dark", "light"]).describe("dark = deep navy/ink canvas (most SaaS explainers); light = clean white."),
    hue: z.number().min(0).max(360).describe("Brand accent hue 0-360 (e.g. 250 violet, 210 blue, 160 teal, 25 orange). Pick to fit the topic's emotion."),
    hue2: z.number().min(0).max(360).optional().describe("Secondary accent hue for gradients — analogous or complementary to hue. Default: hue+40."),
    energy: z.enum(["calm", "medium", "high"]).optional().describe("Animation intensity + music feel. Default medium."),
    music: z.enum(["ambient", "upbeat", "none"]).optional().describe("Procedural background music bed. Default ambient."),
    brand: z.string().optional().describe("A brand/product name to feature in the logo intro/outro, ONLY if the prompt is about a specific product/company."),
  }),
  captions: z.boolean().optional().describe("Burn word-synced subtitles into the video (great for social). Default true."),
  scenes: z.array(sceneSchema).min(3).max(12).describe("The story, in order: hook → build → payoff → CTA. 5-8 scenes is the sweet spot."),
});
export type MotionSpec = z.infer<typeof motionSpecSchema>;

/* ── caption timing (client-side, derived from TTS timestamps) ────────────── */
export type CaptionWord = { text: string; start: number; end: number }; // seconds within the scene's narration
export type SceneAudio = { buf: AudioBuffer | null; words: CaptionWord[] };

/**
 * The icon vocabulary the planner may use (canvas-drawable lucide set — must stay in
 * sync with lib/graphics/icons.ts REGISTRY keys; the engine falls back gracefully on a
 * near-miss). Server-safe: plain strings, no client imports.
 */
export const ICON_NAMES = [
  "rocket","brain","cpu","zap","shield","shield-check","lock","globe","trending-up","trending-down","bar-chart","pie-chart","line-chart",
  "landmark","coins","wallet","credit-card","dollar-sign","bitcoin","piggy-bank","receipt","percent","scale","banknote","chart-candlestick",
  "hand-coins","badge-dollar","vault","arrow-left-right","circle-dollar",
  "atom","flask","microscope","telescope","dna","magnet","orbit","radiation",
  "heart-pulse","stethoscope","pill","syringe","activity","heart",
  "leaf","sun","moon","star","cloud","cloud-lightning","flame","droplets","wind","mountain","tree-pine","sprout","snowflake",
  "building","factory","home","store","briefcase","shopping-cart","package","truck","plane","car","train","ship","bike",
  "satellite","wifi","signal","smartphone","laptop","monitor","server","database","hard-drive","router","bluetooth","battery",
  "code","terminal","git-branch","bug","blocks","binary","qr-code","scan",
  "settings","wrench","hammer","cog","sliders","toggle",
  "users","user","user-plus","user-check","message-circle","messages","mail","send","bell","megaphone","share","thumbs-up",
  "calendar","clock","timer","hourglass","alarm","history",
  "search","eye","target","crosshair","compass","map-pin","map","navigation","route","milestone","signpost",
  "award","trophy","medal","crown","gem","gift","sparkles","wand","party",
  "lightbulb","book-open","graduation-cap","pencil","pen-tool","palette","brush","camera","video","film","clapperboard",
  "music","mic","headphones","radio","gamepad","dice","puzzle","dumbbell","bot",
  "key","key-round","fingerprint","eye-off","alert-triangle","badge-check","check-circle","x-circle","help","info",
  "arrow-right","arrow-up-right","refresh","repeat","layers","filter","link","infinity",
  "apple","utensils","coffee","pizza","chef-hat","salad","beef",
  "stamp","scroll","swords","castle","church","pyramid","anchor","skull","ghost",
] as const;
