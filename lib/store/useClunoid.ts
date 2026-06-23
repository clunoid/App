"use client";

import { create } from "zustand";
import { SpeechPlayer } from "@/lib/voice/speech";
import { getSupabaseBrowser } from "@/lib/supabase/client";
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

  // Session
  user: UserState;
  authChecked: boolean;

  // Auth + profile UI
  authOpen: boolean;
  authMode: "signup" | "login";
  profileOpen: boolean;

  setUser: (u: UserState) => void;
  setAuthChecked: (v: boolean) => void;
  setMicLevel: (v: number) => void;
  openAuth: (mode: "signup" | "login") => void;
  closeAuth: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  signOut: () => Promise<void>;

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
  if (!res.ok) throw new Error("brain failed");
  return (await res.json()) as Scene;
}

export const useClunoid = create<ClunoidStore>((set, get) => {
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
    try {
      const scene = await postBrain({
        ...req,
        history: get().history,
        experience: get().experience ?? null,
        user: get().user,
        client: clientCtx(),
      });
      await applyScene(scene);
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

    user: { isAuthed: false },
    authChecked: false,

    authOpen: false,
    authMode: "signup",
    profileOpen: false,

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
      set({ user: { isAuthed: false }, experience: null, history: [], caption: "", isaac: "idle", amplitude: 0 });
    },

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
});
