/**
 * Maps a played Guess-the-Country game into the GENERIC reel spec the share
 * module renders. Single source of truth so the live game AND a saved game
 * (replayed from history) build the exact same recap video. Flag-specific — it
 * lives with the game, not in the reusable share folder.
 */
import type { ReelAspect, ReelSpec } from "@/lib/share/reel";
import type { GameSnapshot } from "./storage";

/** Isaac's question prompts — shared by the live round and the recap video. */
export const QUESTIONS = [
  "Which country is this?",
  "Do you know this flag?",
  "Whose flag is this?",
  "Can you recognize this one?",
  "Name this country.",
  "Quick — which country?",
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildGameReel(s: GameSnapshot, aspect: ReelAspect): ReelSpec {
  const choiceMode = s.answerMode === "choice";
  const theme = choiceMode
    ? { mode: "document" as const, bg: "#c8c5bd", accent: "#8a2433", ink: "#2c2823" }
    : { mode: "rays" as const, bg: `hsl(${s.hue}, 80%, 56%)`, accent: "#FFD400", ink: "#fff", hue: s.hue };
  // Keep the clip short + shareable: at most ~8 flags, sampled evenly.
  const MAX = 8;
  const replay = s.replay;
  const picks = replay.length <= MAX ? replay : Array.from({ length: MAX }, (_, i) => replay[Math.floor((i * replay.length) / MAX)]);
  const category = s.subtitle ? s.subtitle.replace(/\s*flags?$/i, "") : "";
  return {
    aspect,
    theme,
    title: "Guess The Country",
    subtitle: s.subtitle,
    brand: "clunoid.com",
    intro: {
      headline: "Guess The Country",
      sub: s.subtitle ? "Can you name them all?" : "Can you name these flags?",
      narration: category
        ? `Let's play Guess the Country — ${category}! Can you name them all?`
        : "Let's play Guess the Country! Can you name these flags?",
    },
    scenes: picks.map((r, i) => ({
      imageUrl: r.flag,
      questionText: QUESTIONS[i % QUESTIONS.length],
      questionNarration: QUESTIONS[i % QUESTIONS.length],
      bigText: r.name,
      userText: !r.correct && r.said ? r.said : undefined,
      correct: r.correct,
      badge: cap(r.difficulty),
      narration: r.correct ? `Yes! ${r.name}.` : `It's ${r.name}.`,
    })),
    outro: {
      headline: "Your turn!",
      scoreText: `I scored ${s.score}/${s.total}`,
      sub: "Play this game on clunoid.com",
      narration: `I scored ${s.score} out of ${s.total}. Think you can beat me? Play this game on clunoid dot com. Your turn!`,
    },
  };
}
