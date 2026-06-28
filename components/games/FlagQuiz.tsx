"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Volume2, VolumeX, Mic, MicOff, Play, RotateCcw, Trophy, ArrowLeft, Sparkles, X, Globe, Check, Grid2x2, Keyboard, Film, Instagram, Youtube } from "lucide-react";
import { RaysBackground } from "./RaysBackground";
import { DocumentBackground } from "./DocumentBackground";
import { ShareModal } from "@/components/share/ShareModal";
import { TikTokIcon, XIcon } from "@/components/share/SocialIcons";
import type { ReelAspect, ReelSpec } from "@/lib/share/reel";
import { buildGame, buildAllCountries, PRESETS, type Round, type Difficulty } from "@/lib/games/generate";
import { isCorrect, pickCountry } from "@/lib/games/grade";
import { getAudio } from "@/lib/games/audio";
import { getHost } from "@/lib/games/host";
import { useListen } from "@/lib/games/useListen";
import { similarCodes } from "@/lib/games/similar";

const QUESTIONS = [
  "Which country is this?",
  "Do you know this flag?",
  "Whose flag is this?",
  "Can you recognize this one?",
  "Name this country.",
  "Quick — which country?",
];
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];
const HUES = [222, 145, 282, 200, 324, 168, 255, 30, 192, 305, 130, 244];
// distractors of last resort, if a game is too small to supply 3 others
const FALLBACK_NAMES = ["France", "Japan", "Brazil", "Germany", "Canada", "Italy", "Spain", "Egypt", "Kenya", "Norway", "Peru", "Greece"];

const REVEAL_MS = 2200;
const LOAD_CAP_MS = 6000;
const TITLE_SHADOW = "0 3px 0 rgba(0,0,0,0.22), 0 7px 16px rgba(0,0,0,0.38)";
const YELLOW = "#FFD400";
const INK = "#2c2823";
const SEAL = "#8a2433";
const STRIPES = "repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 13px, rgba(255,255,255,0) 13px 26px)";

type Phase = "menu" | "loading" | "answering" | "reveal" | "complete";
type SetMode = "set" | "all";
type AnswerMode = "choice" | "input";
// One per played round — the raw material for the shareable recap video.
type ReplayRound = { code: string; flag: string; name: string; said: string; correct: boolean; difficulty: Difficulty };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const barColor = (frac: number) => `hsl(${Math.max(0, frac * 125)}, 90%, 48%)`;
const pngFallback = (code: string) => `https://flagcdn.com/w2560/${code}.png`;

function shuffle<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
// keep the easy→medium→hard ramp, shuffle within each tier (Play again reshuffles)
function reshuffleWithin(rounds: Round[]): Round[] {
  const t: Record<Difficulty, Round[]> = { easy: [], medium: [], hard: [] };
  for (const r of rounds) t[r.difficulty].push(r);
  return [...shuffle(t.easy), ...shuffle(t.medium), ...shuffle(t.hard)];
}
// How many of the most-recently-shown flags to keep out of the wrong choices, so
// a player can't decide by "I just saw that one" instead of knowing the flag.
const RECENT_CAP = 9;

/**
 * Build the 4 choices for a round. The wrong ones are chosen to make it HARDER:
 *  1) prefer flags that LOOK LIKE the answer's flag (so you must know it, not just
 *     spot the odd one out), and
 *  2) avoid flags shown in the last few rounds (no easy elimination).
 * Freshness wins ties over similarity (a just-seen look-alike is easy to rule out).
 * Returns the shuffled choice names plus the codes used, so the caller can track
 * recency. Falls back to generic names only if the game is too small.
 */
function makeChoices(answer: Round, rounds: Round[], recent: Set<string>): { choices: string[]; codes: string[] } {
  const sim = new Set(similarCodes(answer.code));
  // unique candidate countries (by code), excluding the answer
  const seen = new Set<string>([answer.code]);
  const pool: Round[] = [];
  for (const r of rounds) {
    if (r.code === answer.code || r.name === answer.name || seen.has(r.code)) continue;
    seen.add(r.code);
    pool.push(r);
  }

  const isSim = (r: Round) => sim.has(r.code);
  const fresh = (r: Round) => !recent.has(r.code);
  // fresh look-alikes → fresh others → seen look-alikes → seen others
  const ordered = [
    ...shuffle(pool.filter((r) => isSim(r) && fresh(r))),
    ...shuffle(pool.filter((r) => !isSim(r) && fresh(r))),
    ...shuffle(pool.filter((r) => isSim(r) && !fresh(r))),
    ...shuffle(pool.filter((r) => !isSim(r) && !fresh(r))),
  ];

  const picked = ordered.slice(0, 3);
  const names = picked.map((r) => r.name);
  const codes = picked.map((r) => r.code);
  for (let i = 0; names.length < 3 && i < FALLBACK_NAMES.length; i++) {
    const f = FALLBACK_NAMES[i];
    if (f !== answer.name && !names.includes(f)) names.push(f);
  }
  return { choices: shuffle([answer.name, ...names]), codes };
}

export function FlagQuiz({ initialRequest }: { initialRequest?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("menu");
  const [setMode, setSetMode] = useState<SetMode>("set");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("choice");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [title, setTitle] = useState("Flags");
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);
  const [secs, setSecs] = useState(7);
  const [idx, setIdx] = useState(0);
  const [runId, setRunId] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [replay, setReplay] = useState<ReplayRound[]>([]); // per-round log for the share video
  const [shareOpen, setShareOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [interim, setInterim] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState<{ said: string; correct: boolean; answer: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(7000);
  const [muted, setMuted] = useState(false);
  const [building, setBuilding] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canAutoFocus, setCanAutoFocus] = useState(false);
  // Voice answering is OPT-IN: the mic stays muted until the user taps to talk,
  // then auto-re-arms each round. This keeps the mic off during Isaac's question
  // (no echo-cancellation ducking, no recognition churn). Typing always works.
  const [voiceOn, setVoiceOn] = useState(false);

  const round: Round | undefined = rounds[idx];
  const total = rounds.length;
  const hue = HUES[idx % HUES.length];
  const choiceMode = answerMode === "choice";

  const phaseRef = useRef<Phase>("menu");
  const typedRef = useRef("");
  const voiceRef = useRef("");
  const pickedRef = useRef("");
  const mutedRef = useRef(false);
  const voiceOnRef = useRef(false);
  const secsRef = useRef(7);
  const answerModeRef = useRef<AnswerMode>("choice");
  const lockedThisRound = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tickRef = useRef(-1);
  const flagRef = useRef<HTMLImageElement | null>(null);
  const preloadedRef = useRef<Set<string>>(new Set());
  const recentCodesRef = useRef<string[]>([]); // flags shown lately → kept out of wrong choices
  phaseRef.current = phase;
  typedRef.current = typed;
  mutedRef.current = muted;
  voiceOnRef.current = voiceOn;
  answerModeRef.current = answerMode;

  const audio = getAudio();
  const host = getHost();

  const resetListenRef = useRef<() => void>(() => {});
  const { supported, start: startListen, stop: stopListen, reset: resetListen } = useListen((t) => {
    if (phaseRef.current !== "answering" || answerModeRef.current !== "input") return;
    // While Isaac talks, ignore + wipe what the mic heard (no echo). After he's
    // done, your speech is captured clean.
    if (host.speaking) {
      resetListenRef.current();
      setInterim("");
      return;
    }
    voiceRef.current = t;
    setInterim(t);
  });
  const listenRef = useRef({ start: startListen, stop: stopListen });
  listenRef.current = { start: startListen, stop: stopListen };
  resetListenRef.current = resetListen;

  // ── Build a game, then play it ────────────────────────────────────────────
  const launch = useCallback(
    (g: { title: string; subtitle?: string; secondsPerRound: number; rounds: Round[] }, nextSet: SetMode, am: AnswerMode) => {
      preloadedRef.current = new Set();
      secsRef.current = g.secondsPerRound;
      answerModeRef.current = am;
      setSecs(g.secondsPerRound);
      setSetMode(nextSet);
      setAnswerMode(am);
      setTitle(g.title);
      setSubtitle(g.subtitle);
      setRounds(g.rounds);
      setScore(0);
      setResults([]);
      setReplay([]);
      setIdx(0);
      setRunId((n) => n + 1);
      setBuilding(false);
      setPhase("loading");
    },
    []
  );

  const startGame = useCallback(
    async (request: string, am: AnswerMode = "choice") => {
      setBuilding(true);
      setFailed(false);
      host.say("Let's play! Guess the country.");
      const g = await buildGame(request);
      if (!g.rounds.length) {
        setBuilding(false);
        setFailed(true);
        return;
      }
      launch(g, "set", am);
    },
    [host, launch]
  );

  // "Continue" → every country in the world, easiest → hardest (same answer mode).
  const continueAll = useCallback(async () => {
    setBuilding(true);
    const g = await buildAllCountries();
    if (!g.rounds.length) {
      setBuilding(false);
      return;
    }
    launch(g, "all", answerModeRef.current);
  }, [launch]);

  // "Play again" → the SAME flags, reshuffled (keep the difficulty ramp).
  const replaySame = useCallback(() => {
    if (!rounds.length) return;
    preloadedRef.current = new Set();
    setRounds(reshuffleWithin(rounds));
    setScore(0);
    setResults([]);
    setReplay([]);
    setIdx(0);
    setRunId((n) => n + 1);
    setPhase("loading");
  }, [rounds]);

  useEffect(() => {
    setCanAutoFocus(typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: fine)").matches);
  }, []);

  const startedInitial = useRef(false);
  useEffect(() => {
    if (initialRequest && !startedInitial.current) {
      startedInitial.current = true;
      void startGame(initialRequest, "choice");
    }
  }, [initialRequest, startGame]);

  useEffect(() => {
    if (rounds.length) QUESTIONS.forEach((q) => host.prefetch(q));
  }, [rounds, host]);

  // Preload upcoming flags so each round's image is cached + paints instantly.
  useEffect(() => {
    for (let i = idx; i < Math.min(idx + 6, rounds.length); i++) {
      const r = rounds[i];
      if (!r || preloadedRef.current.has(r.code)) continue;
      preloadedRef.current.add(r.code);
      const img = new Image();
      img.onerror = () => {
        const png = new Image();
        png.src = pngFallback(r.code);
      };
      img.src = r.flag;
    }
  }, [idx, rounds]);

  // ── Lock the round: grade, reveal, schedule next ──────────────────────────
  const lockRound = useCallback(() => {
    if (lockedThisRound.current || phaseRef.current !== "answering") return;
    const r = rounds[idx];
    if (!r) return;
    lockedThisRound.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    listenRef.current.stop();
    audio.stopMusic();

    const pickedVal = pickedRef.current.trim();
    const typedVal = typedRef.current.trim();
    const voiceVal = voiceRef.current.trim();
    const raw = pickedVal || typedVal || voiceVal;
    const correct = !!raw && isCorrect(raw, r.name, r.aliases);
    const said = pickedVal || typedVal || pickCountry(voiceVal, rounds.map((x) => x.name));
    setLocked({ said, correct, answer: r.name });
    setResults((prev) => [...prev, correct]);
    setReplay((prev) => [...prev, { code: r.code, flag: r.flag, name: r.name, said, correct, difficulty: r.difficulty }]);
    if (correct) setScore((s) => s + 1);

    setPhase("reveal");
    if (correct) audio.correct();
    else audio.wrong();
    void host.say(correct ? `Yes! ${r.name}.` : `It's ${r.name}.`);

    advanceRef.current = setTimeout(() => {
      if (idx + 1 >= total) {
        setPhase("complete");
        audio.complete();
      } else {
        audio.transition();
        setIdx((i) => i + 1);
      }
    }, REVEAL_MS);
  }, [rounds, idx, total, audio, host]);

  const lockRef = useRef(lockRound);
  lockRef.current = lockRound;

  function pickChoice(name: string) {
    if (phaseRef.current !== "answering" || lockedThisRound.current) return;
    setPicked(name);
    pickedRef.current = name;
    lockRound();
  }

  // ── Each round: reset, wait for the flag to paint, then run timer + voice ──
  useEffect(() => {
    if (phaseRef.current === "complete" || phaseRef.current === "menu") return;
    const r = rounds[idx];
    if (!r) return;

    lockedThisRound.current = false;
    setLocked(null);
    setTyped("");
    setInterim("");
    setPicked(null);
    pickedRef.current = "";
    voiceRef.current = "";
    if (idx === 0) recentCodesRef.current = []; // fresh run → clear recency
    const { choices: roundChoices, codes: usedCodes } = makeChoices(r, rounds, new Set(recentCodesRef.current));
    setChoices(roundChoices);
    // Remember this round's flags (answer + its decoys) so the next few rounds
    // don't reuse them as easy-to-eliminate options.
    recentCodesRef.current = [r.code, ...usedCodes, ...recentCodesRef.current].slice(0, RECENT_CAP);
    setTimeLeft(secsRef.current * 1000);
    setPhase("loading");

    let cancelled = false;
    let started = false;

    const begin = () => {
      if (cancelled || started) return;
      started = true;
      setPhase("answering");
      audio.unlock();
      audio.pop();
      if (!mutedRef.current) audio.startMusic();
      host.prefetch(`Yes! ${r.name}.`);
      host.prefetch(`It's ${r.name}.`);
      // Ask the question. The mic opens ONLY AFTER Isaac finishes (host.say
      // resolves on audio-end) and ONLY if the user armed voice — so the open mic
      // never ducks his TTS or churns on his echo. Re-checked every round, so once
      // armed it auto-re-arms; the guards stop a late-resolving say() (after a lock
      // or round change) from re-opening the mic.
      void host.say(QUESTIONS[idx % QUESTIONS.length]).then(() => {
        if (cancelled || lockedThisRound.current || phaseRef.current !== "answering") return;
        if (answerModeRef.current === "input" && voiceOnRef.current && supported) {
          resetListenRef.current();
          voiceRef.current = "";
          listenRef.current.start();
        }
      });

      tickRef.current = secsRef.current;
      const deadline = Date.now() + secsRef.current * 1000;
      const id = setInterval(() => {
        const left = Math.max(0, deadline - Date.now());
        setTimeLeft(left);
        const sLeft = Math.ceil(left / 1000);
        if (sLeft !== tickRef.current && sLeft <= 3 && sLeft > 0) {
          tickRef.current = sLeft;
          audio.tick(sLeft <= 2);
        }
        if (left <= 0) lockRef.current();
      }, 80);
      timerRef.current = id;
    };

    // Wait for the visible flag to DECODE before starting (never blank).
    let settled = false;
    const ready = () => {
      if (cancelled || settled) return;
      settled = true;
      begin();
    };
    const el = flagRef.current;
    if (el) {
      el.decode().then(ready).catch(() => {
        if (cancelled || settled) return;
        if (!el.dataset.fb) {
          el.dataset.fb = "1";
          el.src = pngFallback(r.code);
        }
        el.decode().then(ready).catch(ready);
      });
    } else {
      ready();
    }
    const capTimer = setTimeout(ready, LOAD_CAP_MS);

    return () => {
      cancelled = true;
      clearTimeout(capTimer);
      if (timerRef.current) clearInterval(timerRef.current);
      if (advanceRef.current) clearTimeout(advanceRef.current);
      listenRef.current.stop();
      audio.stopMusic();
      host.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, runId]);

  useEffect(
    () => () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      audio.stopMusic();
      host.cancel();
      listenRef.current.stop();
    },
    [audio, host]
  );

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    audio.setMuted(next);
    host.setMuted(next);
    if (next) {
      audio.stopMusic();
      host.cancel();
    } else if (phaseRef.current === "answering") {
      audio.startMusic();
    }
  }

  // Opt-in voice. Arming mid-round opens the mic now if we're answering and Isaac
  // is silent; if he's still talking, begin()'s say().then() opens it when he's
  // done. Muting stops it immediately. The preference persists across rounds.
  function toggleVoice() {
    const next = !voiceOnRef.current;
    voiceOnRef.current = next;
    setVoiceOn(next);
    if (next) {
      if (phaseRef.current === "answering" && !lockedThisRound.current && !host.speaking && supported) {
        resetListenRef.current();
        voiceRef.current = "";
        listenRef.current.start();
      }
    } else {
      listenRef.current.stop();
    }
  }

  const exitToMenu = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
    audio.stopMusic();
    host.cancel();
    listenRef.current.stop();
    startedInitial.current = true;
    setPhase("menu");
  }, [audio, host]);

  function submitNow(e: React.FormEvent) {
    e.preventDefault();
    if (phaseRef.current === "answering") lockRound();
  }

  // Map this game's replay into the GENERIC reel spec the share module renders.
  // (This is the only flag-specific mapping — it lives in the game, not the
  // reusable share folder, so future games supply their own builder.)
  const buildReelSpec = useCallback(
    (aspect: ReelAspect): ReelSpec => {
      const theme = choiceMode
        ? { mode: "document" as const, bg: "#c8c5bd", accent: "#8a2433", ink: "#2c2823" }
        : { mode: "rays" as const, bg: `hsl(${hue}, 80%, 56%)`, accent: "#FFD400", ink: "#fff", hue };
      // Keep the clip short + shareable: at most ~8 flags, sampled evenly (each now
      // plays as a full round — Isaac asks, the timer ticks, then the reveal).
      const MAX = 8;
      const picks = replay.length <= MAX ? replay : Array.from({ length: MAX }, (_, i) => replay[Math.floor((i * replay.length) / MAX)]);
      const category = subtitle ? subtitle.replace(/\s*flags?$/i, "") : "";
      return {
        aspect,
        theme,
        title: "Guess The Country",
        subtitle,
        brand: "clunoid.com",
        intro: {
          headline: "Guess The Country",
          sub: subtitle ? "Can you name them all?" : "Can you name these flags?",
          narration: category
            ? `Let's play Guess the Country — ${category}! Can you name them all?`
            : "Let's play Guess the Country! Can you name these flags?",
        },
        // Each scene plays like a round: the flag + question + a beat, then the reveal.
        scenes: picks.map((r, i) => ({
          imageUrl: r.flag,
          questionText: QUESTIONS[i % QUESTIONS.length],
          questionNarration: QUESTIONS[i % QUESTIONS.length], // Isaac asks, like the game
          bigText: r.name,
          userText: !r.correct && r.said ? r.said : undefined,
          correct: r.correct,
          badge: cap(r.difficulty),
          narration: r.correct ? `Yes! ${r.name}.` : `It's ${r.name}.`,
        })),
        // Outro = Isaac's call to action: come play at clunoid.com.
        outro: {
          headline: "Your turn!",
          scoreText: `I scored ${score}/${total}`,
          sub: "Free to play · Guess the Country & more",
          narration: `I scored ${score} out of ${total}. Think you can beat me? Come play Guess the Country — free — at clunoid dot com. Your turn!`,
        },
      };
    },
    [choiceMode, hue, subtitle, score, total, replay]
  );

  // ── Screens ──────────────────────────────────────────────────────────────
  if (phase === "menu") {
    return (
      <MenuScreen
        building={building}
        failed={failed}
        onPlay={startGame}
        onHome={() => router.push("/games")}
        muted={muted}
        onMute={toggleMute}
      />
    );
  }
  if (phase === "complete") {
    return (
      <>
        <CompleteScreen
          choiceMode={choiceMode}
          hue={hue}
          title={title}
          score={score}
          total={total}
          results={results}
          canContinue={setMode === "set"}
          building={building}
          canShare={replay.length > 0}
          onShare={() => setShareOpen(true)}
          onContinue={continueAll}
          onReplay={replaySame}
          onMenu={exitToMenu}
        />
        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} makeSpec={buildReelSpec} fileName="clunoid-flags" />
      </>
    );
  }
  if (!round) return null;

  const frac = timeLeft / (secs * 1000);
  const reveal = phase === "reveal";

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden select-none">
      {choiceMode ? <DocumentBackground /> : <RaysBackground hue={hue} />}

      {/* Right-edge brand mark */}
      <div
        className={`pointer-events-none absolute right-1 top-1/2 z-20 -translate-y-1/2 text-sm font-extrabold uppercase tracking-[0.3em] sm:right-3 sm:text-base ${
          choiceMode ? "text-[#2c2823]/35" : "text-white/70"
        }`}
        style={{ writingMode: "vertical-rl" }}
      >
        clunoid
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {/* Top: close · round badge · mute (title moved down to the flag area) */}
        <div className="relative flex items-start justify-between px-4 pt-4 sm:px-8 sm:pt-6">
          <div className="flex items-center gap-2">
            <button
              onClick={exitToMenu}
              aria-label="Close game"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full backdrop-blur transition sm:h-10 sm:w-10 ${
                choiceMode ? "bg-black/10 text-[#2c2823] hover:bg-black/20" : "bg-black/25 text-white hover:bg-black/40"
              }`}
            >
              <X size={18} />
            </button>
            <motion.div
              key={`badge-${idx}`}
              initial={{ scale: 0.5, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-[3px] font-extrabold shadow-lg sm:h-16 sm:w-16 ${
                total >= 100 ? "text-base sm:text-xl" : "text-xl sm:text-3xl"
              } ${choiceMode ? "border-[#2c2823] bg-[#f6f4ee] text-[#2c2823]" : "border-white bg-black text-white"}`}
            >
              {idx + 1}
            </motion.div>
          </div>

          <button
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className={`z-20 grid h-11 w-11 shrink-0 place-items-center rounded-full backdrop-blur transition ${
              choiceMode ? "bg-black/10 text-[#2c2823] hover:bg-black/20" : "bg-black/25 text-white hover:bg-black/40"
            }`}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>

        {/* Difficulty rail — tucked just under the header on phones (clears the top
            controls AND the flag), a larger left rail on desktop. Position lives in a
            scoped <style> so it never depends on Tailwind emitting a top-N utility. */}
        <style>{".cl-diffrail{top:3.5rem}@media(min-width:640px){.cl-diffrail{top:34%}}"}</style>
        <div className="cl-diffrail absolute left-2 z-20 flex flex-col gap-0.5 sm:left-8 sm:gap-1.5">
          {DIFFS.map((d) => {
            const on = round.difficulty === d;
            return (
              <motion.div
                key={d}
                animate={{ scale: on ? 1.06 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className={`select-none text-base font-extrabold italic sm:text-2xl ${
                  on
                    ? `rounded-full px-3 py-0 text-white shadow-lg sm:px-4 sm:py-0.5 ${choiceMode ? "bg-[#8a2433]" : "bg-[#C81E5B]"}`
                    : choiceMode
                    ? "px-1 text-[#2c2823]/70"
                    : "px-1 text-white/80"
                }`}
                style={on || choiceMode ? {} : { textShadow: "0 2px 3px rgba(0,0,0,0.35)" }}
              >
                {cap(d)}
              </motion.div>
            );
          })}
        </div>

        {/* Center: title + subtitle, then the flag + a reserved answer slot */}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-2 px-6">
          {/* Title sits just above the flag (clear of the top controls), fluid
              size so it fits every screen; category shows as a quoted subtitle. */}
          <div className="pointer-events-none flex flex-col items-center text-center">
            <h1
              className="font-extrabold leading-none tracking-tight"
              style={{ fontSize: "clamp(1.5rem, 6.4vw, 3.5rem)", textShadow: choiceMode ? "none" : TITLE_SHADOW }}
            >
              <span style={{ color: choiceMode ? INK : "#fff" }}>Guess The </span>
              <span style={{ color: choiceMode ? SEAL : YELLOW }}>Country</span>
            </h1>
            {subtitle && (
              <p
                className="mt-1 font-bold italic leading-tight"
                style={{
                  fontSize: "clamp(0.8rem, 3.2vw, 1.3rem)",
                  color: choiceMode ? SEAL : "rgba(255,255,255,0.92)",
                  textShadow: choiceMode ? "none" : "0 1px 4px rgba(0,0,0,0.45)",
                }}
              >
                “{subtitle}”
              </p>
            )}
          </div>

          <motion.div
            key={round.code}
            initial={{ scale: 0.7, opacity: 0, rotate: choiceMode ? 0 : -6 }}
            animate={{
              scale: phase === "loading" ? 0.85 : 1,
              opacity: phase === "loading" ? 0 : 1,
              rotate: choiceMode ? 0 : [-2.5, 2.5, -2.5],
            }}
            transition={{
              opacity: { duration: 0.25 },
              scale: { type: "spring", stiffness: 220, damping: 18 },
              ...(choiceMode ? {} : { rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" } }),
            }}
            className="rounded-[1.6rem] bg-white p-2.5 shadow-2xl sm:p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={flagRef}
              src={round.flag}
              alt="Flag"
              draggable={false}
              onError={(e) => {
                const t = e.currentTarget as HTMLImageElement;
                if (!t.dataset.fb) {
                  t.dataset.fb = "1";
                  t.src = pngFallback(round.code);
                }
              }}
              className="block max-h-[28vh] w-auto max-w-[80vw] rounded-xl object-contain sm:max-h-[38vh] sm:max-w-[56vw]"
            />
          </motion.div>

          {phase === "loading" && (
            <div className="absolute inset-0 grid place-items-center">
              <div className={`h-12 w-12 animate-spin rounded-full border-4 ${choiceMode ? "border-[#2c2823]/25 border-t-[#2c2823]" : "border-white/40 border-t-white"}`} />
            </div>
          )}

          {/* Reserved answer slot (keeps the flag from jumping) */}
          <div className="flex min-h-[3.4rem] items-center justify-center text-center sm:min-h-[4.5rem]">
            {reveal && (
              <motion.div initial={{ opacity: 0, y: 10, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16 }}>
                <div
                  className="text-4xl font-extrabold leading-none sm:text-6xl"
                  style={{ color: choiceMode ? INK : YELLOW, textShadow: choiceMode ? "none" : TITLE_SHADOW }}
                >
                  {locked?.answer ?? round.name}
                </div>
                {!choiceMode &&
                  (locked?.correct ? (
                    <div className="mt-1 text-base font-bold text-white/90 sm:text-lg">✓ Correct</div>
                  ) : locked?.said ? (
                    <div className="mt-1 text-base font-bold text-white/80 sm:text-lg">You said “{locked.said}”</div>
                  ) : null)}
              </motion.div>
            )}
          </div>
        </div>

        {/* Bottom: FIXED — timer bar + (4 choices | type/speak row). Always present. */}
        <div className="px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-1 sm:px-8">
          <div
            className={`mx-auto w-full max-w-2xl rounded-full p-1 ${
              choiceMode ? "bg-[#b3b0a8] shadow-[inset_0_2px_5px_rgba(0,0,0,0.25)]" : "bg-[#e9e9ec] shadow-[inset_0_2px_5px_rgba(0,0,0,0.25)]"
            }`}
          >
            <div
              className="h-5 rounded-full sm:h-7"
              style={{
                width: `${Math.max(2, frac * 100)}%`,
                backgroundColor: barColor(frac),
                backgroundImage: STRIPES,
                transition: "width 0.09s linear, background-color 0.3s linear",
              }}
            />
          </div>

          {choiceMode ? (
            <div className="mx-auto mt-3 w-full max-w-xl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
              {choices.map((name) => {
                const isAnswer = reveal && name === (locked?.answer ?? round.name);
                const isWrongPick = reveal && name === picked && name !== (locked?.answer ?? round.name);
                return (
                  <button
                    key={name}
                    onClick={() => pickChoice(name)}
                    disabled={reveal}
                    className={`flex min-h-[3.25rem] items-center justify-center rounded-2xl px-3 text-base font-extrabold shadow-md ring-1 transition active:scale-[0.98] sm:min-h-[3.75rem] sm:text-xl ${
                      isAnswer
                        ? "bg-[#1f7a4d] text-white ring-black/10"
                        : isWrongPick
                        ? "bg-[#a32333] text-white ring-black/10"
                        : "bg-[#f6f4ee] text-[#2c2823] ring-black/10 hover:bg-white disabled:opacity-70"
                    }`}
                  >
                    {isAnswer ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Check size={18} strokeWidth={3} /> {name}
                      </span>
                    ) : (
                      name
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <form onSubmit={submitNow} className="mx-auto mt-3 flex w-full max-w-md items-center gap-2">
              {supported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={voiceOn ? "Mute microphone" : "Unmute microphone to answer by voice"}
                  title={voiceOn ? "Voice on — tap to mute" : "Tap to answer by voice"}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 transition ${
                    voiceOn
                      ? `bg-white text-black ring-white/70 shadow ${phase === "answering" ? "animate-pulse" : ""}`
                      : "bg-white/15 text-white/70 ring-white/30 hover:bg-white/25 hover:text-white"
                  }`}
                >
                  {voiceOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
              )}
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={interim || (voiceOn ? "Listening… or type" : "Type the country…")}
                autoFocus={canAutoFocus}
                disabled={reveal}
                className="h-11 w-full rounded-full border-0 bg-white/20 px-5 font-bold text-white outline-none backdrop-blur placeholder:font-medium placeholder:text-white/70 focus:bg-white/30 disabled:opacity-70"
              />
              <button
                type="submit"
                disabled={reveal}
                className="h-11 shrink-0 rounded-full bg-white px-5 font-extrabold text-black transition hover:bg-white/90 disabled:opacity-70"
              >
                Lock
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Menu / start screen ─────────────────────────────────────────────────── */
function MenuScreen({
  building,
  failed,
  onPlay,
  onHome,
  muted,
  onMute,
}: {
  building: boolean;
  failed: boolean;
  onPlay: (request: string, am: AnswerMode) => void;
  onHome: () => void;
  muted: boolean;
  onMute: () => void;
}) {
  const [request, setRequest] = useState("");
  const [am, setAm] = useState<AnswerMode>("choice");

  if (building) {
    return (
      <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden px-6 select-none">
        {am === "choice" ? <DocumentBackground /> : <RaysBackground hue={222} />}
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className={`h-14 w-14 animate-spin rounded-full border-4 ${am === "choice" ? "border-[#2c2823]/25 border-t-[#2c2823]" : "border-white/40 border-t-white"}`} />
          <p className="mt-5 text-xl font-extrabold" style={{ color: am === "choice" ? INK : "#fff", textShadow: am === "choice" ? "none" : TITLE_SHADOW }}>
            Isaac is building your game…
          </p>
        </div>
      </div>
    );
  }

  const doc = am === "choice";
  return (
    <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden px-6 select-none">
      {doc ? <DocumentBackground /> : <RaysBackground hue={222} />}
      <button
        onClick={onHome}
        aria-label="Back to games"
        className={`absolute left-4 top-4 z-20 flex h-11 items-center gap-1.5 rounded-full px-4 backdrop-blur transition ${
          doc ? "bg-black/10 text-[#2c2823] hover:bg-black/20" : "bg-black/25 text-white hover:bg-black/40"
        }`}
      >
        <ArrowLeft size={18} /> <span className="text-sm font-extrabold">Games</span>
      </button>
      <button
        onClick={onMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className={`absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full backdrop-blur transition ${
          doc ? "bg-black/10 text-[#2c2823] hover:bg-black/20" : "bg-black/25 text-white hover:bg-black/40"
        }`}
      >
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        <motion.h1
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 16 }}
          className="text-5xl font-extrabold leading-none tracking-tight sm:text-7xl"
          style={{ textShadow: doc ? "none" : TITLE_SHADOW }}
        >
          <span style={{ color: doc ? INK : "#fff" }}>Guess The </span>
          <span style={{ color: doc ? SEAL : YELLOW }}>Country</span>
        </motion.h1>
        <p className="mt-3 text-lg font-bold" style={{ color: doc ? "#2c2823cc" : "#ffffffd9" }}>
          Ask Isaac for any flag challenge.
        </p>

        {/* Answer mode toggle */}
        <div className={`mt-6 inline-flex rounded-full p-1 ${doc ? "bg-black/10" : "bg-black/25"}`}>
          {([
            { v: "choice", label: "Multiple choice", Icon: Grid2x2 },
            { v: "input", label: "Type or speak", Icon: Keyboard },
          ] as const).map(({ v, label, Icon }) => (
            <button
              key={v}
              onClick={() => setAm(v)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-extrabold transition ${
                am === v ? (doc ? "bg-[#f6f4ee] text-[#2c2823] shadow" : "bg-white text-black shadow") : doc ? "text-[#2c2823]/70" : "text-white/80"
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onPlay(request.trim() || PRESETS[0].request, am);
          }}
          className="mt-5 flex w-full items-center gap-2"
        >
          <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-full px-4 backdrop-blur ${doc ? "bg-black/10" : "bg-black/20"}`}>
            <Sparkles size={18} className={`shrink-0 ${doc ? "text-[#2c2823]/60" : "text-white/70"}`} />
            <input
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="e.g. hard European flags, 15 rounds"
              className={`h-12 w-full bg-transparent font-bold outline-none ${doc ? "text-[#2c2823] placeholder:text-[#2c2823]/55" : "text-white placeholder:text-white/60"} placeholder:font-medium`}
            />
          </div>
          <button
            type="submit"
            aria-label="Play"
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-xl transition hover:scale-[1.05] ${doc ? "bg-[#2c2823] text-[#f6f4ee]" : "bg-white text-black"}`}
          >
            <Play size={20} fill="currentColor" />
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onPlay(p.request, am)}
              className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${
                doc ? "bg-black/10 text-[#2c2823] hover:bg-black/20" : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {failed && (
          <p className="mt-5 text-sm font-bold" style={{ color: doc ? INK : "#fff" }}>
            Isaac couldn&apos;t build that set — try a different region or difficulty.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Completion screen ─────────────────────────────────────────────────── */
function CompleteScreen({
  choiceMode,
  hue,
  title,
  score,
  total,
  results,
  canContinue,
  building,
  canShare,
  onShare,
  onContinue,
  onReplay,
  onMenu,
}: {
  choiceMode: boolean;
  hue: number;
  title: string;
  score: number;
  total: number;
  results: boolean[];
  canContinue: boolean;
  building: boolean;
  canShare: boolean;
  onShare: () => void;
  onContinue: () => void;
  onReplay: () => void;
  onMenu: () => void;
}) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  const verdict = pct >= 90 ? "Flag master!" : pct >= 70 ? "Impressive!" : pct >= 40 ? "Nicely done!" : "Keep practicing!";
  const fg = choiceMode ? INK : "#fff";
  return (
    <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden px-6 select-none">
      {choiceMode ? <DocumentBackground /> : <RaysBackground hue={hue} />}
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
      >
        <motion.div initial={{ rotate: -15, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12 }}>
          <Trophy size={72} style={{ color: choiceMode ? SEAL : "#fff", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))" }} />
        </motion.div>
        <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl" style={{ color: choiceMode ? SEAL : YELLOW, textShadow: choiceMode ? "none" : TITLE_SHADOW }}>
          {verdict}
        </h1>
        <p className="mt-1 text-base font-bold" style={{ color: fg, opacity: 0.85 }}>
          {title}
        </p>
        <div className="mt-3 flex items-baseline gap-2" style={{ color: fg, textShadow: choiceMode ? "none" : TITLE_SHADOW }}>
          <span className="text-7xl font-extrabold">{score}</span>
          <span className="text-3xl font-bold opacity-80">/ {total}</span>
        </div>
        <div className="mt-5 flex max-w-xs flex-wrap justify-center gap-1.5">
          {results.slice(0, 60).map((r, i) => (
            <span key={i} className={`h-3 w-3 rounded-full ${r ? (choiceMode ? "bg-[#1f7a4d]" : "bg-white") : choiceMode ? "bg-black/25" : "bg-black/30"}`} />
          ))}
        </div>

        {canShare && (
          <button
            onClick={onShare}
            className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-full px-5 py-4 text-lg font-extrabold text-white shadow-xl transition hover:scale-[1.03]"
            style={{ background: "linear-gradient(120deg, #7c3aed 0%, #ec4899 50%, #f97316 100%)" }}
          >
            <Film size={20} />
            Share your game
            <span className="ml-0.5 flex items-center gap-1.5 text-white/95">
              <TikTokIcon size={15} />
              <Instagram size={15} />
              <Youtube size={15} />
              <XIcon size={15} />
            </span>
          </button>
        )}

        {canContinue && (
          <button
            onClick={onContinue}
            disabled={building}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-lg font-extrabold shadow-xl transition hover:scale-[1.03] disabled:opacity-70 ${
              choiceMode ? "bg-[#2c2823] text-[#f6f4ee]" : "bg-white text-black"
            }`}
          >
            {building ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Globe size={20} />}
            Continue · all countries
          </button>
        )}

        <div className="mt-3 flex w-full gap-3">
          <button
            onClick={onReplay}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3.5 font-extrabold shadow-xl transition hover:scale-[1.03] ${
              choiceMode ? "bg-[#8a2433] text-white" : "bg-white/90 text-black"
            }`}
          >
            <RotateCcw size={18} /> Play again
          </button>
          <button
            onClick={onMenu}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3.5 font-extrabold backdrop-blur transition ${
              choiceMode ? "bg-black/10 text-[#2c2823] hover:bg-black/20" : "bg-black/25 text-white hover:bg-black/40"
            }`}
          >
            <ArrowLeft size={18} /> Menu
          </button>
        </div>
      </motion.div>
    </div>
  );
}
