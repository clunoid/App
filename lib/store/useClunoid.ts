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

  // Session
  user: UserState;
  /** True once we've checked the saved Supabase session (so routes can guard). */
  authChecked: boolean;

  // Auth + profile UI
  authOpen: boolean;
  authMode: "signup" | "login";
  profileOpen: boolean;

  setUser: (u: UserState) => void;
  setAuthChecked: (v: boolean) => void;
  openAuth: (mode: "signup" | "login") => void;
  closeAuth: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  signOut: () => Promise<void>;
};

export const useClunoid = create<ClunoidStore>((set) => ({
  isaac: "idle",
  amplitude: 0,
  micLevel: 0,

  user: { isAuthed: false },
  authChecked: false,

  authOpen: false,
  authMode: "signup",
  profileOpen: false,

  setUser: (u) => set({ user: u }),
  setAuthChecked: (v) => set({ authChecked: v }),
  openAuth: (mode) => set({ authOpen: true, authMode: mode }),
  closeAuth: () => set({ authOpen: false }),
  openProfile: () => set({ profileOpen: true }),
  closeProfile: () => set({ profileOpen: false }),

  signOut: async () => {
    // Close the menu, clear the session, drop local user. Route guards send the
    // user back to the welcome gate once they're no longer authed.
    set({ profileOpen: false });
    try {
      await getSupabaseBrowser().auth.signOut();
    } catch {
      /* ignore — clear local state regardless */
    }
    set({ user: { isAuthed: false } });
  },
}));
