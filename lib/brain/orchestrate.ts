import { generateObject, generateText, type CoreMessage } from "ai";
import { z } from "zod";
import { MODELS, hasGroq, hasAnthropic } from "@/lib/models";
import { ISAAC_PERSONA, contextPreamble, dateLine } from "./prompts";
import type { BrainContext, BrainRequest, Turn } from "./types";
import type { Scene } from "./scene";
import { findCountryByName, flagUrl } from "@/lib/data/countries";
import { fetchWiki } from "@/lib/data/wikipedia";
import { currentLeader } from "@/lib/data/wikidata";
import { webSearch, imageSearch, hasSearch } from "@/lib/data/search";
import { pexelsPhotos, pexelsVideos, hasPexels } from "@/lib/data/pexels";
import { commonsImage } from "@/lib/data/commons";

// ── Helpers ────────────────────────────────────────────────────────────

function toMessages(history: Turn[] = [], current?: string): CoreMessage[] {
  const msgs: CoreMessage[] = history.slice(-10).map((t) => ({
    role: t.role === "isaac" ? "assistant" : "user",
    content: t.content,
  }));
  if (current) msgs.push({ role: "user", content: current });
  return msgs;
}

function trim(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, s.lastIndexOf(" ", max)) + "…";
}

function titleCase(s: string): string {
  return (s || "").trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60) || "Here's what I found";
}

async function isaacLine(system: string, messages: CoreMessage[], fallback: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: MODELS.fast(),
      system,
      messages,
      temperature: 0.85,
      maxTokens: 220,
      maxRetries: 1,
    });
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Gather verified facts, then have Claude ground ONE answer. Isaac speaks it AND
 * the card shows it — single source of truth, so they can never disagree, and
 * nothing unverified (raw snippets, headlines, predictions) reaches the screen.
 */
async function groundedSay(question: string, facts: string, ctx: BrainContext): Promise<string> {
  const system = `${ISAAC_PERSONA}${dateLine(
    ctx
  )}\nAnswer the user using ONLY the verified facts below — they are current and correct, even if they differ from what you remember. State them confidently in 1-3 spoken sentences. Report ONLY established facts — never present predictions, rumours, or opinions as if they are settled facts. NEVER contradict the facts, and NEVER mention training data, knowledge cutoffs, or being an AI. Never refuse or say you can't show something that is public and legal — share what the facts give you. If the facts don't clearly cover it, say plainly that you're not certain rather than guessing.\nVerified facts: ${facts}`;
  try {
    const { text } = await generateText({
      model: hasAnthropic() ? MODELS.smart() : MODELS.fast(),
      system,
      messages: [{ role: "user", content: question }],
      temperature: 0.3,
      maxTokens: 220,
      maxRetries: 1,
    });
    return text.trim() || trim(facts, 180);
  } catch {
    return trim(facts, 180);
  }
}

// ── Routing regexes ──────────────────────────────────────────────────────

const OFFICEHOLDER =
  /\b(president|prime minister|pm|premier|chancellor|king|queen|monarch|emperor|pope|head of (state|government)|chief minister|first minister|governor|mayor|secretary[- ]general|ceo|chairman|leader)\b/i;
const CURRENTISH = /\b(who|current|currently|now|today|right now|these days|latest)\b/i;

const FACTUAL_LEAD =
  /^(tell me (more )?about|tell me|what is|what are|what's|whats|who is|who's|whos|who are|who was|who were|explain|describe|where is|where are|when was|when is|when did|how (tall|big|old|far|deep|long|high|heavy) is|give me (some )?(info|information|facts) (on|about)|show me|show|find me|find|i want to see|let me see|can you show( me)?|get me|define|meaning of|what does)\b/i;

// Anything time-sensitive / newsy → needs live web search, not static sources.
const CURRENTISH_Q =
  /\b(news|latest|today|tonight|yesterday|recent|recently|currently|now|right now|this (week|month|year|morning|evening)|happening|breaking|update|score|won|winning|result|price|stock|weather|election|released|launch|2024|2025|2026|2027)\b/i;

// Pure "what's the date / day / time" questions — answer from the client clock.
const DATE_Q =
  /\btoday'?s date\b|\bwhat day is it\b|\bwhat time is it\b|\bwhen is today\b|^what'?s?(\s+is)?\s+(the\s+)?(date|time|day)\b/i;

function isNewsy(text: string): boolean {
  return (
    /\b(news|headlines?|breaking|current events|what'?s happening|what is happening|trending)\b/i.test(text) ||
    CURRENTISH_Q.test(text)
  );
}

// A pure greeting / acknowledgement (no real subject to research) → brief reply.
function isSmallTalk(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.split(/\s+/).length > 5) return false;
  return /^(hi+|hey+|hello+|yo|hiya|howdy|sup|wass?up|what'?s up|whats up|greetings|thanks?|thank you|thanx|thx|ty|cheers|cool|nice|wow|ok(ay)?|kk|great|awesome|amazing|perfect|lovely|haha+|lol|lmao|good (job|one|stuff|morning|afternoon|evening|night)|well done|nice one|bye+|goodbye|see ya|see you|later|how are you|how'?s it going|how are things|you (there|good|ok))[!.\s?]*$/i.test(
    t
  );
}

function extractTopic(text: string): string {
  const t = text.trim().replace(/[?.!]+$/, "");
  const m = t.match(FACTUAL_LEAD);
  let topic = (m ? t.slice(m[0].length) : t).replace(/^\s+/, "");
  topic = topic.replace(/^(a |an |the |some )?(photo|picture|image|video|clip|pic|footage)s?\s+of\s+/i, "");
  return topic || t;
}

// ── Fact answer, grounded in current data (+ related image) ────────────

/**
 * Order of evidence: current leader (Wikidata, authoritative) → live web search
 * → Wikipedia. One grounded answer is spoken AND shown.
 */
async function factScene(query: string, question: string, ctx: BrainContext): Promise<Scene> {
  // 1) Current national leader → Wikidata is AUTHORITATIVE (skip web search here:
  //    stale articles naming a former leader would otherwise confuse it).
  if (OFFICEHOLDER.test(question) && CURRENTISH.test(question)) {
    const role = /\b(prime minister|pm|head of government|chancellor|premier|first minister)\b/i.test(question)
      ? "gov"
      : "state";
    const name = (await currentLeader(question, role)) || (await currentLeader(query, role));
    if (name) {
      const bio = await fetchWiki(name);
      const facts = `DEFINITIVE current fact (verified, up to date): the current ${
        role === "gov" ? "head of government" : "head of state"
      } in question is ${name}. This is correct as of now — do not name anyone else.${
        bio ? ` Background: ${bio.extract}` : ""
      }`;
      const say = await groundedSay(question, facts, ctx);
      return {
        say,
        expectsInput: "voice",
        experience: { type: "rich_card", title: bio?.title || name, body: say, imageUrl: bio?.imageUrl },
      };
    }
  }

  // 2) Live web search (freshest) + a picture.
  const [search, wiki] = await Promise.all([
    hasSearch() ? webSearch(question) : Promise.resolve(null),
    fetchWiki(query || question),
  ]);
  let facts = "";
  if (search && (search.answer || search.results.length)) {
    facts =
      (search.answer ? `Summary: ${search.answer}\n` : "") +
      search.results.slice(0, 5).map((r) => `- ${trim(r.content, 320)}`).join("\n");
  } else if (wiki) {
    facts = `${wiki.title}: ${wiki.extract}`;
  }
  if (!facts) return chatReply(question, ctx, []);

  const say = await groundedSay(question, facts, ctx);
  return {
    say,
    expectsInput: "voice",
    experience: {
      type: "rich_card",
      title: wiki?.title || titleCase(query || question),
      body: say,
      imageUrl: wiki?.imageUrl,
    },
  };
}

// ── Explainer: a synced visual narration (entity images appear as Isaac talks) ──

/** Resolve a named entity to an image: flag for countries, else Wikipedia photo. */
async function resolveEntityImage(
  name: string
): Promise<{ imageUrl?: string; caption?: string; kind?: "person" | "place" | "flag" | "concept" | "thing" }> {
  const country = findCountryByName(name);
  if (country) return { imageUrl: flagUrl(country.code), caption: country.name, kind: "flag" };

  const wiki = await fetchWiki(name);
  if (wiki?.imageUrl) return { imageUrl: wiki.imageUrl, caption: wiki.title, kind: "thing" };

  if (hasPexels()) {
    const p = (await pexelsPhotos(name, 1))[0];
    if (p) return { imageUrl: p, caption: wiki?.title ?? name, kind: "thing" };
  }
  const c = await commonsImage(name);
  if (c) return { imageUrl: c, caption: wiki?.title ?? name, kind: "thing" };
  if (hasSearch()) {
    const img = await imageSearch(name);
    if (img) return { imageUrl: img, caption: wiki?.title ?? name, kind: "thing" };
  }
  return { caption: wiki?.title ?? name, kind: "thing" };
}

/** Resolve a beat's media to the MOST RELEVANT real video/image — never a placeholder. */
async function resolveBeatMedia(media: {
  query: string;
  type: "entity" | "photo" | "clip";
}): Promise<{ imageUrl?: string; videoUrl?: string; poster?: string }> {
  const q = media.query;

  if (media.type === "entity") {
    const e = await resolveEntityImage(q);
    if (e.imageUrl) return { imageUrl: e.imageUrl };
  }

  if (media.type === "photo" || media.type === "entity") {
    if (hasSearch()) {
      const t = await imageSearch(q);
      if (t) return { imageUrl: t };
    }
    const c = await commonsImage(q);
    if (c) return { imageUrl: c };
    const w = await fetchWiki(q);
    if (w?.imageUrl) return { imageUrl: w.imageUrl };
    if (hasPexels()) {
      const p = (await pexelsPhotos(q, 1))[0];
      if (p) return { imageUrl: p };
    }
    return {};
  }

  // type === "clip": generic atmosphere → stock video, with image fallbacks.
  if (hasPexels()) {
    const v = (await pexelsVideos(q, 1))[0];
    if (v) return { videoUrl: v.url, poster: v.poster };
    const p = (await pexelsPhotos(q, 1))[0];
    if (p) return { imageUrl: p };
  }
  if (hasSearch()) {
    const t = await imageSearch(q);
    if (t) return { imageUrl: t };
  }
  const c = await commonsImage(q);
  if (c) return { imageUrl: c };
  return {};
}

const explainerGenSchema = z.object({
  title: z.string().describe("A short title for the explanation."),
  beats: z
    .array(
      z.object({
        say: z.string().describe("One spoken segment — one to three natural, substantive sentences."),
        media: z
          .object({
            query: z
              .string()
              .describe(
                "The PRECISE thing to show for this beat — match the exact objects/action/people you are describing right now, not a vague theme."
              ),
            label: z.string().describe("A short 2-4 word caption."),
            type: z
              .enum(["entity", "photo", "clip"])
              .describe(
                "entity = ONE specific named real thing (person, company, country, landmark) → its official image/logo/flag (query = the proper name). photo = a SPECIFIC real scene, event, group of people, or object shown as a REAL PHOTOGRAPH of exactly that → real photo search. clip = ONLY a generic action/atmosphere where stock video fits (e.g. 'stormy sea', 'crowd cheering') → stock video. Prefer 'entity' or 'photo' for anything specific; use 'clip' sparingly."
              ),
          })
          .optional()
          .describe("Include for EVERY beat — the visuals must track exactly what you're saying."),
      })
    )
    .min(3)
    .max(14),
  summary: z
    .array(
      z.object({
        heading: z
          .string()
          .describe("A short section heading, e.g. 'Overview', 'Personal details', 'Career', 'Physical characteristics', 'Key dates', 'Geography'."),
        items: z
          .array(
            z.object({
              label: z.string().describe("A short data label, e.g. 'Born', 'Office', 'Population', 'Diameter', 'Founded'."),
              value: z.string().describe("The concise CURRENT value, e.g. '14 June 1946', '47th President (since 2025)', '8.4 million'."),
            })
          )
          .min(1),
      })
    )
    .max(6)
    .default([])
    .describe(
      "A rich, sectioned 'data summary' (a modern Wikipedia-style infobox) of the subject's IMPORTANT facts: 2-5 sections, each with a clear heading and several data rows. Include all the important details a reader would want — but ONLY well-established facts grounded in the verified facts above or stable common knowledge, kept CURRENT and never outdated (for anything that changes — current office/role/status, age, latest work — use the present value). NEVER guess or invent. Shown to the reader but NOT spoken."
    ),
  suggestions: z
    .array(z.string())
    .max(5)
    .default([])
    .describe(
      "3-5 SHORT related follow-up prompts (3-6 words each) the user might tap next to keep exploring — closely related to the subject and phrased as natural search queries (e.g. 'Mars rovers', 'Could humans live on Mars?', 'Phobos and Deimos')."
    ),
});

async function buildExplainer(query: string, question: string, ctx: BrainContext): Promise<Scene> {
  // Gather rich verified evidence: live search (current) + Wikipedia (depth + image).
  const [search, wiki] = await Promise.all([
    hasSearch() ? webSearch(question) : Promise.resolve(null),
    fetchWiki(query || question),
  ]);
  let facts = "";
  if (search && (search.answer || search.results.length))
    facts +=
      (search.answer ? `Latest summary: ${search.answer}\n` : "") +
      search.results.slice(0, 6).map((r) => `- ${trim(r.content, 500)}`).join("\n");
  if (wiki) facts += `\n${wiki.title}: ${wiki.extract}`;
  if (!facts.trim()) return chatReply(question, ctx, []);

  let object: z.infer<typeof explainerGenSchema>;
  try {
    ({ object } = await generateObject({
      model: hasAnthropic() ? MODELS.smart() : MODELS.fast(),
      schema: explainerGenSchema,
      system: `${ISAAC_PERSONA}${dateLine(
        ctx
      )}\nBuild a thorough, engaging spoken explainer that fully answers the user, using the verified facts below where they apply (for well-known topics you may also use common knowledge, but never invent specifics). Scale the LENGTH to the request: use only a few beats (3-5) for a simple or narrow question (a word's meaning, a quick "who is…"), and many (up to a dozen) for a rich subject — a full history, a deep "tell me everything", or a news roundup. Cover the essentials AND, where relevant, history, key facts, notable figures, and the LATEST developments. Never pad a simple ask, and never cut important detail from a big one.

For EACH beat, give one to three natural spoken sentences AND a "media" visual that depicts EXACTLY what you are saying in that beat — the specific objects, action, or people, not a vague theme. Include media on EVERY beat. Plan the visuals to fit the timeline: for a history of a person/place/country, move the media from the OLDEST relevant imagery to the LATEST as the story progresses. Make each beat's media DIFFERENT (no repetition) unless the same visual genuinely fits best.
End the FINAL beat by warmly inviting the user to ask about anything specific they'd like to go deeper on.
Also produce a rich, sectioned "summary" — a modern Wikipedia-style data infobox with 2-5 headed sections and several data rows each, covering the IMPORTANT details a reader would want. Keep every value accurate and CURRENT (never outdated — use present office/status/age/latest), drawn ONLY from the verified facts above or stable common knowledge, never invented. Plus 3-5 short "suggestions": related follow-up search prompts the user might tap next. The summary and suggestions are shown to the reader but you do NOT speak them.

State only established facts — never predictions, rumours, or opinions as fact. Never say you can't show or discuss something that's public and legal.\nVerified facts:\n${facts}`,
      prompt: question,
      temperature: 0.45,
      maxRetries: 1,
    }));
  } catch {
    // Fall back to a single grounded card if the structured build fails.
    const say = await groundedSay(question, facts, ctx);
    return {
      say,
      expectsInput: "voice",
      experience: {
        type: "rich_card",
        title: wiki?.title || titleCase(query || question),
        body: say,
        imageUrl: wiki?.imageUrl,
      },
    };
  }

  // Resolve each beat's media in parallel — a real video or image from the best
  // available source. Only attach an entity if media actually resolved.
  const topicFallback = wiki?.imageUrl; // last-resort image so no beat is blank
  const beats = await Promise.all(
    object.beats.map(async (b) => {
      if (!b.media) return { say: b.say };
      const m = await resolveBeatMedia(b.media);
      const imageUrl = m.videoUrl ? undefined : m.imageUrl ?? topicFallback;
      if (!imageUrl && !m.videoUrl) return { say: b.say };
      return {
        say: b.say,
        entity: {
          name: b.media.label,
          caption: b.media.label,
          imageUrl,
          videoUrl: m.videoUrl,
          poster: m.poster,
        },
      };
    })
  );

  return {
    say: object.title,
    expectsInput: "voice",
    experience: { type: "explainer", title: object.title, beats, summary: object.summary, suggestions: object.suggestions },
  };
}

// ── Chat / greeting / date ───────────────────────────────────────────────

async function chatReply(text: string, ctx: BrainContext, history: Turn[]): Promise<Scene> {
  const say = await isaacLine(
    ISAAC_PERSONA + dateLine(ctx) + contextPreamble(ctx),
    toMessages(history, text),
    "I'm here — what would you like to explore?"
  );
  return { say, expectsInput: "voice" };
}

function needsKeysScene(): Scene {
  return { say: "I'm Isaac. I'm almost ready — I just need my brain connected.", expectsInput: "none" };
}

async function dateScene(q: string, ctx: BrainContext): Promise<Scene> {
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const fmt = (opts: Intl.DateTimeFormatOptions) => {
    try {
      return now.toLocaleString(ctx.locale || "en-US", { timeZone: ctx.timezone, ...opts });
    } catch {
      return now.toISOString();
    }
  };
  if (/\btime\b/i.test(q) && !/\b(date|day)\b/i.test(q)) {
    return { say: `It's ${fmt({ hour: "numeric", minute: "2-digit" })}.`, expectsInput: "voice" };
  }
  const full = fmt({ weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const monthDay = fmt({ month: "long", day: "numeric" });
  try {
    if (hasSearch()) {
      const search = await webSearch(`${monthDay}: holidays, observances and notable historical events`);
      const facts =
        search?.answer ||
        (search?.results?.length ? search.results.slice(0, 3).map((r) => trim(r.content, 320)).join("\n") : "");
      if (facts) {
        const say = await groundedSay(
          `Today is ${full}. In 1-2 warm sentences, tell them today's date and the single most notable thing about ${monthDay} — a holiday or a famous event. Keep it short.`,
          facts,
          ctx
        );
        const media = await resolveBeatMedia({ query: `${monthDay} holiday celebration`, type: "photo" });
        return {
          say,
          expectsInput: "voice",
          experience: { type: "rich_card", title: full, body: say, imageUrl: media.imageUrl },
        };
      }
    }
  } catch {
    /* fall back to the plain date below */
  }
  return { say: `It's ${full}.`, expectsInput: "voice" };
}

// ── Context-aware planner (used when something is already on the Stage) ──
// Decides switch vs follow-up vs reaction so Isaac never gets confused or blends
// topics. Isaac only ever speaks content after a full rebuild.

type Plan = { intent: "explain" | "continue" | "react" | "chat"; topic?: string; say?: string };

function currentTopicLabel(req: BrainRequest): string {
  const e = req.experience;
  if (e?.type === "explainer" || e?.type === "rich_card") return String(e.title ?? "the current topic");
  return "the current topic";
}

function parsePlan(text: string): Plan | null {
  try {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a === -1 || b === -1) return null;
    const obj = JSON.parse(text.slice(a, b + 1));
    return typeof obj.intent === "string" ? (obj as Plan) : null;
  } catch {
    return null;
  }
}

async function planWithContext(req: BrainRequest, ctx: BrainContext): Promise<Plan | null> {
  const topic = currentTopicLabel(req);
  const system = `${ISAAC_PERSONA}${dateLine(
    ctx
  )}\nThere is content on the Stage right now about: "${topic}". Treat the user's latest message as a COMMAND to act on — NEVER ask whether they want to switch, just do it. Respond with ONLY a single-line JSON object:
{"intent":"explain|continue|react|chat","topic":"...","say":"..."}
Rules:
- ANY new subject — a full question OR even a single bare word that names a different thing (e.g. just "Trump", "Mars", "news") → "explain" with "topic" = that subject. Switch immediately; do NOT ask, do NOT confirm.
- A follow-up that goes DEEPER on "${topic}" → "explain" with "topic" = the specific follow-up (we rebuild fresh — no blending).
- "continue" / "carry on" / "keep going" / "where were you" → "continue" with "say" = a 2-4 word lead-in like "Sure, picking it up.". The explainer resumes automatically afterwards — do NOT re-explain anything.
- A pure reaction with no subject (e.g. "I love this", "thanks", "nice") → "react"; "say" = a VERY brief warm acknowledgement (one short sentence).
- Only truly empty small talk with no subject and no reaction → "chat" with a short "say".
IMPORTANT: continue / react / chat replies must be SHORT acknowledgements only — NEVER give facts or explanations in them. Anything with a subject MUST be "explain" so it gets a fresh card and media. When unsure, prefer "explain".`;
  try {
    const { text } = await generateText({
      model: MODELS.fast(),
      system,
      messages: toMessages(req.history, req.text),
      temperature: 0.3,
      maxTokens: 300,
      maxRetries: 1,
    });
    return parsePlan(text);
  } catch {
    return null;
  }
}

// ── Entry point ──────────────────────────────────────────────────────────

export async function orchestrate(req: BrainRequest, ctx: BrainContext): Promise<Scene> {
  if (!hasGroq()) return needsKeysScene();

  if (req.kind === "greeting") {
    const say = await isaacLine(
      ISAAC_PERSONA + dateLine(ctx) + contextPreamble(ctx),
      [
        {
          role: "user",
          content: `Greet ${
            ctx.user?.name || "them"
          } in ONE short, warm, fresh sentence and invite them to ask about anything — a word, a person, a place, today's news, anything.`,
        },
      ],
      `Hey${ctx.user?.name ? `, ${ctx.user.name}` : ""} — ask me anything. A word, a person, today's news… I'll find it.`
    );
    return { say, expectsInput: "voice" };
  }

  const q = req.text ?? "";

  // Date/time → the real client clock (accurate, deterministic).
  if (DATE_Q.test(q.trim())) return dateScene(q, ctx);

  // If content is already on the Stage, plan with context (switch vs follow-up
  // vs reaction) so Isaac never blends topics. Short replies keep the screen.
  const onScreen = req.experience?.type;
  if (onScreen === "explainer" || onScreen === "rich_card") {
    const plan = await planWithContext(req, ctx);
    if (plan) {
      switch (plan.intent) {
        case "explain":
          return buildExplainer(plan.topic || q, plan.topic || q, ctx);
        // continue / react / chat → brief reply, KEEP content, then RESUME.
        default:
          return { say: plan.say || "Got it.", keep: true, resume: true, expectsInput: "voice" };
      }
    }
    // planner failed → fall through to default routing.
  }

  // Pure greeting / acknowledgement (no subject to research) → a brief reply.
  if (isSmallTalk(q)) return chatReply(q, ctx, req.history ?? []);

  // "Who currently leads X?" → quick authoritative card (Wikidata).
  if (OFFICEHOLDER.test(q) && CURRENTISH.test(q)) return factScene(extractTopic(q), q, ctx);

  // DEFAULT — research ANY topic and build a synced visual explainer. News/current
  // events get a freshness-boosted query so the very latest is covered.
  const question = isNewsy(q)
    ? `Latest news and developments, most important first${ctx.location ? `, near ${ctx.location}` : ""}: ${q}`
    : q;
  return buildExplainer(extractTopic(q), question, ctx);
}
