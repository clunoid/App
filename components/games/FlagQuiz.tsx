"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX, Mic, Play, RotateCcw, Trophy, ArrowLeft, Sparkles } from "lucide-react";
import { RaysBackground } from "./RaysBackground";
import { buildGame, PRESETS, type Round, type Difficulty } from "@/lib/games/generate";
import { isCorrect } from "@/lib/games/grade";
import { getAudio } from "@/lib/games/audio";
import { getHost } from "@/lib/games/host";
import { useListen } from "@/lib/games/useListen";

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

const REVEAL_MS = 2200;
const LOAD_CAP_MS = 4000;
const TITLE_SHADOW = "0 3px 0 rgba(0,0,0,0.22), 0 7px 16px rgba(0,0,0,0.38)";
const YELLOW = "#FFD400";
const STRIPES = "repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 13px, rgba(255,255,255,0) 13px 26px)";

type Phase = "menu" | "loading" | "answering" | "reveal" | "complete";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const barColor = (frac: number) => `hsl(${Math.max(0, frac * 125)}, 90%, 48%)`;
const pngFallback = (code: string) => `https://flagcdn.com/w2560/${code}.png`;

export function FlagQuiz({ initialRequest }: { initialRequest?: string }) {
  const [phase, setPhase] = useState<Phase>("menu");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [title, setTitle] = useState("Flags");
  const [secs, setSecs] = useState(7);
  const [idx, setIdx] = useState(0);
  const [runId, setRunId] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [typed, setTyped] = useState("");
  const [interim, setInterim] = useState("");
  const [locked, setLocked] = useState<{ said: string; correct: boolean; answer: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(7000);
  const [muted, setMuted] = useState(false);
  const [building, setBuilding] = useState(false);
  const [failed, setFailed] = useState(false);

  const round: Round | undefined = rounds[idx];
  const total = rounds.length;
  const hue = HUES[idx % HUES.length];

  const phaseRef = useRef<Phase>("menu");
  const typedRef = useRef("");
  const voiceRef = useRef("");
  const mutedRef = useRef(false);
  const secsRef = useRef(7);
  const lockedThisRound = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tickRef = useRef(-1);
  const flagRef = useRef<HTMLImageElement | null>(null);
  const onReadyRef = useRef<(code: string) => void>(() => {});
  phaseRef.current = phase;
  typedRef.current = typed;
  mutedRef.current = muted;

  const audio = getAudio();
  const host = getHost();

  const { supported, start: startListen, stop: stopListen } = useListen((t) => {
    if (phaseRef.current !== "answering") return;
    voiceRef.current = t;
    setInterim(t);
  });
  const listenRef = useRef({ start: startListen, stop: stopListen });
  listenRef.current = { start: startListen, stop: stopListen };

  // ── Build a game through Isaac's brain, then play it ──────────────────────
  const startGame = useCallback(
    async (request: string) => {
      setBuilding(true);
      setFailed(false);
      host.say("Let's play! Guess the country.");
      const g = await buildGame(request);
      if (!g.rounds.length) {
        setBuilding(false);
        setFailed(true);
        return;
      }
      secsRef.current = g.secondsPerRound;
      setSecs(g.secondsPerRound);
      setTitle(g.title);
      setRounds(g.rounds);
      setScore(0);
      setResults([]);
      setIdx(0);
      setRunId((n) => n + 1);
      setBuilding(false);
      setPhase("loading");
    },
    [host]
  );

  // Launched from /home (or a deep link) with a request → build immediately.
  const startedInitial = useRef(false);
  useEffect(() => {
    if (initialRequest && !startedInitial.current) {
      startedInitial.current = true;
      void startGame(initialRequest);
    }
  }, [initialRequest, startGame]);

  // ── Lock the round (timer expiry or submit): grade, reveal, schedule next ──
  const lockRound = useCallback(() => {
    if (lockedThisRound.current || phaseRef.current !== "answering") return;
    const r = rounds[idx];
    if (!r) return;
    lockedThisRound.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    listenRef.current.stop();
    audio.stopMusic();

    const said = typedRef.current.trim() || voiceRef.current.trim();
    const correct = !!said && isCorrect(said, r.name, r.aliases);
    setLocked({ said, correct, answer: r.name });
    setResults((prev) => [...prev, correct]);
    if (correct) setScore((s) => s + 1);

    setPhase("reveal");
    if (correct) audio.correct();
    else audio.wrong();
    host.say(correct ? `Yes! ${r.name}.` : `It's ${r.name}.`);

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

  // ── Each round: reset, wait for the flag to paint, then run timer + voice ──
  useEffect(() => {
    if (phaseRef.current === "complete" || phaseRef.current === "menu") return;
    const r = rounds[idx];
    if (!r) return;

    lockedThisRound.current = false;
    setLocked(null);
    setTyped("");
    setInterim("");
    voiceRef.current = "";
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
      host.say(QUESTIONS[idx % QUESTIONS.length]);
      host.prefetch(`Yes! ${r.name}.`); // ready the instant we reveal
      host.prefetch(`It's ${r.name}.`);
      if (supported) listenRef.current.start();

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

    onReadyRef.current = (code: string) => {
      if (!cancelled && code === r.code) begin();
    };
    const el = flagRef.current;
    if (el && el.complete && el.naturalWidth > 0) begin();
    const capTimer = setTimeout(() => begin(), LOAD_CAP_MS);

    return () => {
      cancelled = true;
      onReadyRef.current = () => {};
      clearTimeout(capTimer);
      if (timerRef.current) clearInterval(timerRef.current);
      if (advanceRef.current) clearTimeout(advanceRef.current);
      listenRef.current.stop();
      audio.stopMusic();
      host.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, runId]);

  // Hard stop on unmount.
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

  function submitNow(e: React.FormEvent) {
    e.preventDefault();
    if (phaseRef.current === "answering") lockRound();
  }

  // ── Screens ──────────────────────────────────────────────────────────────
  if (phase === "menu") {
    return <MenuScreen building={building} failed={failed} onPlay={startGame} muted={muted} onMute={toggleMute} />;
  }
  if (phase === "complete") {
    return (
      <CompleteScreen
        hue={hue}
        title={title}
        score={score}
        total={total}
        results={results}
        onReplay={() => startGame(`Another ${total}-flag game like "${title}".`)}
        onMenu={() => {
          startedInitial.current = true; // don't re-trigger the initial request
          setPhase("menu");
        }}
      />
    );
  }
  if (!round) return null;

  const frac = timeLeft / (secs * 1000);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden select-none">
      <RaysBackground hue={hue} />

      {/* Right-edge brand mark */}
      <div
        className="pointer-events-none absolute right-1 top-1/2 z-20 -translate-y-1/2 text-sm font-extrabold uppercase tracking-[0.3em] text-white/70 sm:right-3 sm:text-base"
        style={{ writingMode: "vertical-rl" }}
      >
        clunoid
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {/* Top: round badge · title · mute */}
        <div className="relative flex items-start justify-between px-4 pt-4 sm:px-8 sm:pt-6">
          <motion.div
            key={`badge-${idx}`}
            initial={{ scale: 0.5, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 16 }}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-[3px] border-white bg-black text-2xl font-extrabold text-white shadow-lg sm:h-16 sm:w-16 sm:text-3xl"
          >
            {idx + 1}
          </motion.div>

          <h1
            className="pointer-events-none absolute inset-x-0 top-4 mx-auto text-center text-4xl font-extrabold leading-none tracking-tight sm:top-6 sm:text-6xl"
            style={{ textShadow: TITLE_SHADOW }}
          >
            <span className="text-white">Guess The </span>
            <span style={{ color: YELLOW }}>Country</span>
          </h1>

          <button
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="z-20 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/25 text-white backdrop-blur transition hover:bg-black/40"
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>

        {/* Difficulty rail */}
        <div className="absolute left-3 top-[32%] z-20 flex flex-col gap-1.5 sm:left-8">
          {DIFFS.map((d) => {
            const on = round.difficulty === d;
            return (
              <motion.div
                key={d}
                animate={{ scale: on ? 1.06 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className={`select-none text-xl font-extrabold italic sm:text-2xl ${
                  on ? "rounded-full bg-[#C81E5B] px-4 py-0.5 text-white shadow-lg" : "px-1 text-white/80"
                }`}
                style={on ? {} : { textShadow: "0 2px 3px rgba(0,0,0,0.35)" }}
              >
                {cap(d)}
              </motion.div>
            );
          })}
        </div>

        {/* Center: flag (slightly reduced — never cropped) */}
        <div className="relative flex flex-1 items-center justify-center px-6">
          <motion.div
            key={round.code}
            initial={{ scale: 0.7, opacity: 0, rotate: -6 }}
            animate={{
              scale: phase === "loading" ? 0.85 : 1,
              opacity: phase === "loading" ? 0 : 1,
              rotate: [-2.5, 2.5, -2.5],
            }}
            transition={{
              opacity: { duration: 0.25 },
              scale: { type: "spring", stiffness: 220, damping: 18 },
              rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" },
            }}
            className="rounded-[1.6rem] bg-white p-2.5 shadow-2xl sm:p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={flagRef}
              src={round.flag}
              alt="Flag"
              draggable={false}
              onLoad={() => onReadyRef.current(round.code)}
              onError={(e) => {
                const t = e.currentTarget as HTMLImageElement;
                if (!t.dataset.fb) {
                  t.dataset.fb = "1";
                  t.src = pngFallback(round.code);
                }
              }}
              className="block max-h-[30vh] w-auto max-w-[72vw] rounded-xl object-contain sm:max-h-[40vh] sm:max-w-[50vw]"
            />
          </motion.div>

          {phase === "loading" && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/40 border-t-white" />
            </div>
          )}
        </div>

        {/* Bottom: timer (answering) or answer reveal */}
        <div className="px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2 sm:px-8">
          <AnimatePresence mode="wait">
            {phase === "answering" ? (
              <motion.div key="bar" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mx-auto w-full max-w-2xl rounded-full bg-[#e9e9ec] p-1 shadow-[inset_0_2px_5px_rgba(0,0,0,0.25)]">
                  <div
                    className="h-6 rounded-full sm:h-8"
                    style={{
                      width: `${Math.max(2, frac * 100)}%`,
                      backgroundColor: barColor(frac),
                      backgroundImage: STRIPES,
                      transition: "width 0.09s linear, background-color 0.3s linear",
                    }}
                  />
                </div>
                <form onSubmit={submitNow} className="mx-auto mt-3 flex w-full max-w-md items-center gap-2">
                  {supported && (
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/40"
                      title="Listening"
                    >
                      <Mic size={18} />
                    </span>
                  )}
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={interim || "Type the country…"}
                    autoFocus
                    className="h-11 w-full rounded-full border-0 bg-white/20 px-5 font-bold text-white outline-none backdrop-blur placeholder:font-medium placeholder:text-white/70 focus:bg-white/30"
                  />
                  <button
                    type="submit"
                    className="h-11 shrink-0 rounded-full bg-white px-5 font-extrabold text-black transition hover:bg-white/90"
                  >
                    Lock
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="reveal"
                initial={{ opacity: 0, scale: 0.6, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 16 }}
                className="text-center"
              >
                <div
                  className="text-5xl font-extrabold leading-none sm:text-7xl"
                  style={{ color: YELLOW, textShadow: TITLE_SHADOW }}
                >
                  {locked?.answer ?? round.name}
                </div>
                <div className="mt-2 text-lg font-bold text-white/90 sm:text-xl">
                  {locked?.correct ? "✓ Correct" : locked?.said ? `✗ You said “${locked.said}”` : "✗ Time's up"}
                  <span className="mx-2 text-white/50">·</span>
                  Score {score}/{idx + 1}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ── Menu / start screen — every game is generated by Isaac's brain ───────── */
function MenuScreen({
  building,
  failed,
  onPlay,
  muted,
  onMute,
}: {
  building: boolean;
  failed: boolean;
  onPlay: (request: string) => void;
  muted: boolean;
  onMute: () => void;
}) {
  const [request, setRequest] = useState("");

  if (building) {
    return (
      <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden px-6 select-none">
        <RaysBackground hue={222} />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/40 border-t-white" />
          <p className="mt-5 text-xl font-extrabold text-white" style={{ textShadow: TITLE_SHADOW }}>
            Isaac is building your game…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden px-6 select-none">
      <RaysBackground hue={222} />
      <button
        onClick={onMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full bg-black/25 text-white backdrop-blur transition hover:bg-black/40"
      >
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        <motion.h1
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 16 }}
          className="text-5xl font-extrabold leading-none tracking-tight sm:text-7xl"
          style={{ textShadow: TITLE_SHADOW }}
        >
          <span className="text-white">Guess The </span>
          <span style={{ color: YELLOW }}>Country</span>
        </motion.h1>
        <p className="mt-3 text-lg font-bold text-white/85">Ask Isaac for any flag challenge.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onPlay(request.trim() || PRESETS[0].request);
          }}
          className="mt-7 flex w-full items-center gap-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-black/20 px-4 backdrop-blur">
            <Sparkles size={18} className="shrink-0 text-white/70" />
            <input
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="e.g. hard European flags, 15 rounds"
              className="h-12 w-full bg-transparent font-bold text-white outline-none placeholder:font-medium placeholder:text-white/60"
            />
          </div>
          <button
            type="submit"
            aria-label="Play"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black shadow-xl transition hover:scale-[1.05]"
          >
            <Play size={20} fill="currentColor" />
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onPlay(p.request)}
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-white/25"
            >
              {p.label}
            </button>
          ))}
        </div>

        {failed && (
          <p className="mt-5 text-sm font-bold text-white/90">
            Isaac couldn&apos;t build that set — try a different region or difficulty.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Completion screen ─────────────────────────────────────────────────── */
function CompleteScreen({
  hue,
  title,
  score,
  total,
  results,
  onReplay,
  onMenu,
}: {
  hue: number;
  title: string;
  score: number;
  total: number;
  results: boolean[];
  onReplay: () => void;
  onMenu: () => void;
}) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  const verdict = pct >= 90 ? "Flag master!" : pct >= 70 ? "Impressive!" : pct >= 40 ? "Nicely done!" : "Keep practicing!";
  return (
    <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden px-6 select-none">
      <RaysBackground hue={hue} />
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
      >
        <motion.div
          initial={{ rotate: -15, scale: 0.6 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 12 }}
        >
          <Trophy size={72} className="text-white" style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))" }} />
        </motion.div>
        <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl" style={{ color: YELLOW, textShadow: TITLE_SHADOW }}>
          {verdict}
        </h1>
        <p className="mt-1 text-base font-bold text-white/85">{title}</p>
        <div className="mt-3 flex items-baseline gap-2 text-white" style={{ textShadow: TITLE_SHADOW }}>
          <span className="text-7xl font-extrabold">{score}</span>
          <span className="text-3xl font-bold text-white/80">/ {total}</span>
        </div>
        <div className="mt-5 flex max-w-xs flex-wrap justify-center gap-1.5">
          {results.map((r, i) => (
            <span key={i} className={`h-3 w-3 rounded-full ${r ? "bg-white" : "bg-black/30"}`} />
          ))}
        </div>
        <div className="mt-8 flex w-full gap-3">
          <button
            onClick={onReplay}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 font-extrabold text-black shadow-xl transition hover:scale-[1.03]"
          >
            <RotateCcw size={18} /> Play again
          </button>
          <button
            onClick={onMenu}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-black/25 px-5 py-3.5 font-extrabold text-white backdrop-blur transition hover:bg-black/40"
          >
            <ArrowLeft size={18} /> Menu
          </button>
        </div>
      </motion.div>
    </div>
  );
}
