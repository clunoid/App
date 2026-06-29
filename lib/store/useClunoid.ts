"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SpeechPlayer } from "@/lib/voice/speech";
import { grantIsaac } from "@/lib/isaac/grant";
import { getVoicePref, isClunoidVoice } from "@/lib/voice/preference";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { reportBillingStatus, refreshCredits } from "@/lib/billing/bus";
import type { Scene, Experience, ExplainerExperience } from "@/lib/brain/scene";
import type { BrainRequest, Turn } from "@/lib/brain/types";

export type IsaacState = "idle" | "thinking" | "speaking";

export type UserState = {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  createdAt?: string;
  isAuthed: boolean;
};

/** A saved past request — its title + the full experience, so it can be reopened
 *  exactly as it appeared (cards, media). */
export type HistoryEntry = { id: string; title: string; experience: Experience; createdAt: string };

function clientCtx() {
  try {
    return {
      now: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    };
  } catch {
    return { now: new Date().toISOString() };
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

/** Everything Isaac is currently or recently saying (caption + explainer script + recent turns). */
function isaacCorpus(s: { caption: string; experience: Experience | null; history: Turn[] }): string {
  const parts = [s.caption];
  if (s.experience?.type === "explainer") parts.push(...s.experience.beats.map((b) => b.say));
  parts.push(...s.history.filter((h) => h.role === "isaac").slice(-4).map((h) => h.content));
  return norm(parts.join(" "));
}

/** Is this transcript just Isaac's own voice echoing back? */
function textIsEcho(text: string, corpus: string): boolean {
  const t = norm(text);
  if (!t || !corpus) return false;
  const wc = t.split(" ").length;
  return corpus.includes(t) && (wc >= 2 || t.length >= 10);
}

type ClunoidStore = {
  // Presence (drives the orb)
  isaac: IsaacState;
  caption: string;
  spokenChars: number;
  explainerIndex: number;
  amplitude: number;
  micLevel: number;

  // Stage + conversation
  experience: Experience | null;
  expectsInput: Scene["expectsInput"];
  history: Turn[];

  // History (past results, persisted per device)
  historyLog: HistoryEntry[];
  historyOpen: boolean;

  // Session
  user: UserState;
  authChecked: boolean;

  // Auth + profile UI
  authOpen: boolean;
  authMode: "signup" | "login";
  profileOpen: boolean;

  // Silent mode — Isaac shows text but doesn't speak (saves TTS credits).
  muted: boolean;
  setMuted: (v: boolean) => void;

  // Free tier: false once the user's one-time Isaac search trial is used up (then
  // search runs as paced text + a subscribe nudge). Subscribers stay true.
  isaacSearchOn: boolean;

  setUser: (u: UserState) => void;
  setAuthChecked: (v: boolean) => void;
  setMicLevel: (v: number) => void;
  openAuth: (mode: "signup" | "login") => void;
  closeAuth: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  signOut: () => Promise<void>;

  openHistory: () => void;
  closeHistory: () => void;
  restoreHistory: (id: string) => void;
  deleteHistory: (id: string) => void;

  send: (text: string) => Promise<void>;
  interrupt: () => void;
  isEcho: (text: string) => boolean;
};

let player: SpeechPlayer | null = null;
let playSeq = 0; // bumps to cancel any in-flight playback (explainer beats / speech)
function getPlayer(set: (p: Partial<ClunoidStore>) => void): SpeechPlayer {
  if (!player) player = new SpeechPlayer((amp) => set({ amplitude: amp }));
  return player;
}

async function postBrain(req: BrainRequest): Promise<Scene> {
  const res = await fetch("/api/brain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    reportBillingStatus(res.status);
    throw new Error("brain failed");
  }
  return (await res.json()) as Scene;
}

export const useClunoid = create<ClunoidStore>()(
  persist(
    (set, get) => {
      function stopPlayback() {
        playSeq++; // invalidate any in-flight explainer/speech loop
        getPlayer(set).stop();
      }

      // Narrate an explainer beat-by-beat from `start` (visuals sync to each beat).
      async function playExplainerFrom(exp: ExplainerExperience, start: number, seq: number) {
        const p = getPlayer(set);
        for (let i = Math.max(0, start); i < exp.beats.length; i++) {
          if (seq !== playSeq) return; // superseded / interrupted
          set({ caption: exp.beats[i].say, spokenChars: 0, explainerIndex: i, isaac: "speaking" });
          if (i + 1 < exp.beats.length) p.prefetch(exp.beats[i + 1].say); // pipeline → no gap between beats
          await p.play(exp.beats[i].say, (c) => set({ spokenChars: c }));
        }
      }

      async function applyScene(scene: Scene) {
        getPlayer(set).setMuted(get().muted); // honor silent mode (also after rehydrate)
        const seq = ++playSeq;
        const exp = scene.experience ?? null;
        const newExplainer = !scene.keep && exp?.type === "explainer" ? exp : null;
        set((s) => ({
          caption: newExplainer ? newExplainer.beats[0]?.say ?? scene.say : scene.say,
          spokenChars: 0,
          explainerIndex: scene.keep ? s.explainerIndex : 0,
          // Replace the Stage with the new experience, UNLESS it's a short interactive
          // reply (keep) — then leave the current content on screen.
          experience: scene.keep ? s.experience : scene.clear ? null : exp,
          expectsInput: scene.expectsInput,
          history: [...s.history, { role: "isaac" as const, content: scene.say }].slice(-14),
          isaac: "speaking",
        }));

        // Save substantive results to history so they can be reopened later exactly
        // as they appeared (immediate-duplicate suppression; capped at 60).
        if (!scene.keep && (exp?.type === "explainer" || exp?.type === "rich_card")) {
          const title = ((exp as { title?: string }).title || scene.say || "Untitled").trim();
          set((s) => {
            if (s.historyLog[0]?.title === title) return s;
            const entry: HistoryEntry = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              title,
              experience: exp,
              createdAt: new Date().toISOString(),
            };
            return { historyLog: [entry, ...s.historyLog].slice(0, 60) };
          });
        }

        if (newExplainer) {
          await playExplainerFrom(newExplainer, 0, seq);
        } else {
          // A card or short reply — speak/caption the line.
          await getPlayer(set).play(scene.say, (chars) => set({ spokenChars: chars }));
          // Then resume the current explainer where Isaac left off (continue / react).
          if (scene.resume && seq === playSeq) {
            const cur = get().experience;
            if (cur?.type === "explainer") await playExplainerFrom(cur, get().explainerIndex, seq);
          }
        }
        if (seq === playSeq) set({ isaac: "idle" });
      }

      async function run(req: BrainRequest, userTurn?: string) {
        stopPlayback(); // barge-in: stop any current speech / explainer
        set((s) => ({
          isaac: "thinking",
          amplitude: 0,
          history: userTurn ? [...s.history, { role: "user" as const, content: userTurn }].slice(-14) : s.history,
        }));
        // Free tier: Isaac (premium voice) hosts the FIRST search only; afterwards
        // he's off (paced text) and we nudge them to subscribe. Server-authoritative.
        // A Clunoid Voice isn't Isaac — it's free + ungated, so skip the trial spend
        // and the nudge; the chosen voice narrates every search.
        let isaacOn = true;
        if (isClunoidVoice(getVoicePref())) {
          getPlayer(set).setEleven(true);
        } else {
          isaacOn = await grantIsaac("search");
          getPlayer(set).setEleven(isaacOn);
        }
        set({ isaacSearchOn: isaacOn });
        try {
          const scene = await postBrain({
            ...req,
            history: get().history,
            experience: get().experience ?? null,
            user: get().user,
            client: clientCtx(),
          });
          await applyScene(scene);
          refreshCredits();
        } catch {
          await applyScene({ say: "Say that once more for me?", expectsInput: "voice" });
        }
      }

      return {
        isaac: "idle",
        caption: "",
        spokenChars: 0,
        explainerIndex: 0,
        amplitude: 0,
        micLevel: 0,

        experience: null,
        expectsInput: "none",
        history: [],

        historyLog: [],
        historyOpen: false,

        user: { isAuthed: false },
        authChecked: false,

        authOpen: false,
        authMode: "signup",
        profileOpen: false,

        muted: false,
        isaacSearchOn: true,
        setMuted: (v) => {
          set({ muted: v });
          getPlayer(set).setMuted(v);
          if (v) {
            stopPlayback(); // immediate silence
            set({ isaac: "idle", amplitude: 0 });
          }
        },

        setUser: (u) => set({ user: u }),
        setAuthChecked: (v) => set({ authChecked: v }),
        setMicLevel: (v) => set({ micLevel: v }),
        openAuth: (mode) => set({ authOpen: true, authMode: mode }),
        closeAuth: () => set({ authOpen: false }),
        openProfile: () => set({ profileOpen: true }),
        closeProfile: () => set({ profileOpen: false }),

        signOut: async () => {
          set({ profileOpen: false });
          stopPlayback();
          try {
            await getSupabaseBrowser().auth.signOut();
          } catch {
            /* ignore — clear local state regardless */
          }
          // Fresh slate; the /home route guard sends them back to the welcome gate.
          // (History stays on the device, like the old app.)
          set({ user: { isAuthed: false }, experience: null, history: [], caption: "", isaac: "idle", amplitude: 0 });
        },

        openHistory: () => set({ historyOpen: true }),
        closeHistory: () => set({ historyOpen: false }),
        restoreHistory: (id) => {
          const entry = get().historyLog.find((h) => h.id === id);
          if (!entry) return;
          stopPlayback();
          const exp = entry.experience;
          // Reopen fully revealed (all beats shown) — no re-voicing needed.
          const idx = exp.type === "explainer" ? exp.beats.length - 1 : 0;
          set({
            experience: exp,
            explainerIndex: idx,
            isaac: "idle",
            amplitude: 0,
            historyOpen: false,
            caption: "",
          });
        },
        deleteHistory: (id) => set((s) => ({ historyLog: s.historyLog.filter((h) => h.id !== id) })),

        send: async (text) => {
          const t = text.trim();
          if (!t) return;
          if (get().isaac === "thinking") return; // don't pile up requests mid-thought
          await run({ kind: "utterance", text: t }, t);
        },

        interrupt: () => {
          stopPlayback();
          set({ isaac: "idle", amplitude: 0 });
        },

        isEcho: (text) => textIsEcho(text, isaacCorpus(get())),
      };
    },
    {
      // Remember the current result + history so a refresh resumes where you were
      // (transient playback state — isaac/amplitude/mic — is NOT persisted). The
      // page calls rehydrate() once, deterministically, on mount.
      name: "clunoid-session",
      version: 1,
      skipHydration: true,
      partialize: (s) => ({
        experience: s.experience,
        explainerIndex: s.explainerIndex,
        history: s.history,
        expectsInput: s.expectsInput,
        caption: s.caption,
        spokenChars: s.spokenChars,
        historyLog: s.historyLog,
        muted: s.muted,
      }),
    }
  )
);
