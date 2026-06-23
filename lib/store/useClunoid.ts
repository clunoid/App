"use client";

import { create } from "zustand";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** Isaac's presence — drives the orb. Reserved for when he gains a voice; for
 *  now he simply rests at idle. */
export type IsaacState = "idle" | "thinking" | "speaking";

export type UserState = {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  createdAt?: string;
  isAuthed: boolean;
};

type ClunoidStore = {
  // Presence (read by the orb)
  isaac: IsaacState;
  amplitude: number;
  micLevel: number;

  // Session / flow
  user: UserState;
  started: boolean; // has the visitor entered the live app?

  // Auth + profile UI
  authOpen: boolean;
  authMode: "signup" | "login";
  profileOpen: boolean;

  setUser: (u: UserState) => void;
  startExploring: () => void;
  openAuth: (mode: "signup" | "login") => void;
  closeAuth: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  signOut: () => Promise<void>;
  /** Account state just changed — drop into the live app (or, on sign-out, back
   *  to the welcome gate), and never leave the profile menu lingering. */
  announceAuth: (event: "signed_up" | "signed_in" | "signed_out") => void;
};

export const useClunoid = create<ClunoidStore>((set) => ({
  isaac: "idle",
  amplitude: 0,
  micLevel: 0,

  user: { isAuthed: false },
  started: false,

  authOpen: false,
  authMode: "signup",
  profileOpen: false,

  setUser: (u) => set({ user: u }),
  // Entry from the welcome gate — open sign-up (new users) with a toggle to sign
  // in for returning ones.
  startExploring: () => set({ authOpen: true, authMode: "signup" }),
  openAuth: (mode) => set({ authOpen: true, authMode: mode }),
  closeAuth: () => set({ authOpen: false }),
  openProfile: () => set({ profileOpen: true }),
  closeProfile: () => set({ profileOpen: false }),

  announceAuth: (event) => {
    if (event === "signed_out") set({ started: false, profileOpen: false });
    else set({ started: true, profileOpen: false });
  },

  signOut: async () => {
    set({ profileOpen: false });
    try {
      await getSupabaseBrowser().auth.signOut();
    } catch {
      /* ignore — clear local state regardless */
    }
    set({ user: { isAuthed: false }, started: false });
  },
}));
