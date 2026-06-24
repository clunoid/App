"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mic, MicOff, Send, Loader2, Search, History } from "lucide-react";
import { useClunoid } from "@/lib/store/useClunoid";
import { useSpeechInput } from "@/lib/voice/useSpeechInput";
import { useMicLevel } from "@/lib/voice/useMicLevel";
import { IsaacOrb } from "@/components/stage/IsaacOrb";
import { SceneRenderer } from "@/components/stage/SceneRenderer";
import { Caption } from "@/components/stage/Caption";
import { HistoryPanel } from "@/components/stage/HistoryPanel";
import { ProfileMenu } from "@/components/auth/ProfileMenu";
import { cn } from "@/lib/utils";

/** Per-feature badge shown top-left while content is on the Stage. As we add
 *  features (calculations, etc.) each gets its own entry — fully dynamic. */
const BADGES: Record<string, { label: string }> = {
  explainer: { label: "Search" },
  rich_card: { label: "Search" },
};

/**
 * The authenticated app — Clunoid's full-screen Stage. Type (or speak) anything;
 * the brain researches and answers with synced media (left) + an info card
 * (right), and you can keep the conversation going with follow-ups.
 */
export default function Home() {
  const router = useRouter();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const isaac = useClunoid((s) => s.isaac);
  const experience = useClunoid((s) => s.experience);
  const { send, setMicLevel } = useClunoid.getState();

  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [micOn, setMicOn] = useState(false);
  const bufferRef = useRef("");
  const silenceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Route guard: signed-out visitors go back to the welcome gate.
  useEffect(() => {
    if (authChecked && !isAuthed) router.replace("/");
  }, [authChecked, isAuthed, router]);

  // Restore the saved session (current result + history) once on mount.
  useEffect(() => {
    void useClunoid.persist.rehydrate();
  }, []);

  function handleInput(text: string) {
    setInterim("");
    send(text);
  }

  const { supported, enable, disable } = useSpeechInput({
    // Accumulate the user's FULL utterance and submit after a brief pause. Isaac's
    // own words are kept out (ignored while he's busy, and echo-filtered).
    onFinal: (t) => {
      const st = useClunoid.getState();
      if (st.isaac !== "idle" || st.isEcho(t)) return;
      bufferRef.current = (bufferRef.current + " " + t).trim();
      setInterim(bufferRef.current);
      resetSilence();
    },
    onInterim: (t) => {
      const st = useClunoid.getState();
      if (st.isaac !== "idle" || st.isEcho(t)) return;
      setInterim((bufferRef.current + " " + t).trim());
      resetSilence();
    },
  });

  const handleLevel = useCallback((v: number) => setMicLevel(v), [setMicLevel]);
  useMicLevel(micOn, handleLevel);

  // Mute the mic WHILE Isaac speaks/thinks; re-arm shortly after he's idle.
  useEffect(() => {
    if (!supported || !micOn) {
      disable();
      return;
    }
    if (isaac === "idle") {
      const t = setTimeout(() => enable(), 450);
      return () => clearTimeout(t);
    }
    disable();
  }, [supported, micOn, isaac, enable, disable]);

  function resetSilence() {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = setTimeout(finishUtterance, 1700);
  }
  function finishUtterance() {
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = undefined;
    }
    const text = bufferRef.current.trim();
    bufferRef.current = "";
    setInterim("");
    disable();
    setMicOn(false); // auto-mute once they're done
    setMicLevel(0);
    if (text) handleInput(text);
  }

  function toggleMic() {
    if (micOn) {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      bufferRef.current = "";
      setInterim("");
      disable();
      setMicOn(false);
      setMicLevel(0);
    } else {
      const st = useClunoid.getState();
      if (st.isaac !== "idle") st.interrupt();
      bufferRef.current = "";
      setMicOn(true);
      enable();
    }
  }

  function submitTyped(e?: React.FormEvent) {
    e?.preventDefault();
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    handleInput(t);
  }

  // Grow the input to fit multi-line text, up to a cap.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [typed]);

  // Checking the session, or signed out (about to redirect) → just the orb.
  if (!authChecked || !isAuthed) {
    return (
      <main className="stage-bg grid min-h-[100dvh] place-items-center">
        <IsaacOrb size={120} />
      </main>
    );
  }

  const badge = experience ? BADGES[experience.type] : undefined;

  return (
    <main className="stage-bg relative h-[100dvh] w-screen overflow-hidden">
      {/* Isaac's orb — a background that rises to the foreground while thinking. */}
      <motion.div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        style={{ zIndex: isaac === "thinking" ? 40 : 0 }}
        animate={{ scale: isaac === "thinking" ? 1.5 : 1 }}
        transition={{ type: "spring", stiffness: 110, damping: 18 }}
      >
        <IsaacOrb size={240} />
      </motion.div>

      {/* Foreground column, edge to edge */}
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
          <span className="font-serif text-lg text-ink/80">clunoid</span>
          {isaac === "thinking" ? (
            <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1 backdrop-blur">
              <Loader2 size={14} className="animate-spin text-clay" />
              <span className="text-xs font-medium text-ink-muted">Thinking…</span>
            </div>
          ) : badge ? (
            <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-clay to-spark px-2.5 py-1 text-[#1F1E1C] shadow-glow sm:gap-2 sm:px-3">
              <Search size={14} className="shrink-0" />
              <span className="text-xs font-semibold sm:text-sm">{badge.label}</span>
            </div>
          ) : null}
          <ProfileMenu />
        </div>

        {/* Content — full width, scrolls if tall, over the orb */}
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-3 py-6 sm:px-6">
          {experience ? (
            <SceneRenderer />
          ) : isaac === "idle" ? (
            <div className="mt-[12vh] flex max-w-md flex-col items-center text-center">
              <p className="font-serif text-2xl text-ink/90 sm:text-3xl">Ask Isaac anything</p>
              <p className="mt-3 text-ink-muted">
                A word, a person, a place, today&apos;s news — type it below and Clunoid
                will think it through and show you.
              </p>
            </div>
          ) : null}
        </div>

        {/* Bottom bar: mic far-left · input stretches · send far-right */}
        <form
          onSubmit={submitTyped}
          className="flex shrink-0 items-end gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 sm:gap-4 sm:px-6"
        >
          {(() => {
            const listening = micOn && isaac === "idle";
            const paused = micOn && isaac !== "idle";
            return (
              <button
                type="button"
                onClick={toggleMic}
                disabled={!supported}
                className={cn(
                  "grid h-12 w-12 shrink-0 place-items-center rounded-full transition sm:h-14 sm:w-14",
                  listening && "bg-clay/20 text-clay ring-1 ring-clay/50",
                  paused && "bg-surface text-ink-faint opacity-60 ring-1 ring-border",
                  !micOn && "bg-surface text-ink hover:bg-surface-2",
                  !supported && "cursor-not-allowed opacity-40"
                )}
                aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
                title={
                  !supported
                    ? "Voice not supported — type instead"
                    : paused
                    ? "Mic muted while Isaac is working"
                    : listening
                    ? "Listening — just talk"
                    : "Microphone off — tap to talk"
                }
              >
                {listening ? <Mic size={22} /> : <MicOff size={22} />}
              </button>
            );
          })()}

          <div className="relative flex min-w-0 flex-1 items-end">
            {/* History — opens the full-screen list of past results */}
            <button
              type="button"
              onClick={() => useClunoid.getState().openHistory()}
              title="History"
              aria-label="History"
              className="absolute bottom-[0.6rem] left-2 z-10 flex h-8 items-center gap-1 rounded-full px-2 text-ink-faint transition hover:bg-surface-2 hover:text-clay sm:bottom-3"
            >
              <History size={17} />
              <span className="hidden text-xs font-medium sm:inline">History</span>
            </button>
            <textarea
              ref={taRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitTyped();
                }
              }}
              rows={1}
              placeholder="Ask Isaac anything"
              className="max-h-[40vh] min-h-[3rem] w-full resize-none rounded-3xl border border-border bg-surface/80 py-[0.8rem] pl-12 pr-5 text-ink outline-none backdrop-blur placeholder:text-ink-faint focus:border-clay sm:min-h-[3.5rem] sm:py-[0.95rem] sm:pl-28"
            />
          </div>

          <button
            type="submit"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-ink transition hover:bg-surface-2 sm:h-14 sm:w-14"
            aria-label="Send"
          >
            <Send size={20} />
          </button>
        </form>
      </div>

      {/* Captions float as an overlay so cards get the full screen */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
        <Caption interim={interim} />
      </div>

      <HistoryPanel />
    </main>
  );
}
