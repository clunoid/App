"use client";

/**
 * Game (Guess the Country) history, stored per-user in Supabase (RLS owner-only).
 * We persist a snapshot of each completed game — the flags played and the
 * per-round results — so it can be re-played or turned into the shareable recap
 * video later. Everything is gated by the user's session; deletes are permanent.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Round, Difficulty } from "@/lib/games/generate";

export type AnswerMode = "choice" | "input";
/** Per-round play log — the raw material for the recap video. */
export type ReplayRound = { code: string; flag: string; name: string; said: string; correct: boolean; difficulty: Difficulty };

/** Everything needed to revisit a played game (exact re-play + recap video). */
export type GameSnapshot = {
  title: string;
  subtitle?: string;
  score: number;
  total: number;
  answerMode: AnswerMode;
  hue: number;
  secs: number;
  rounds: Round[]; // the flags played, in order (for an exact re-play)
  replay: ReplayRound[]; // per-round play log (for the recap video)
};

export type SavedGame = { id: string; title: string; created_at: string; data: GameSnapshot };

/** Save a completed game. Returns its id (best-effort — never blocks the game). */
export async function saveGameResult(snap: GameSnapshot): Promise<string | null> {
  try {
    const sb = getSupabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return null;
    const title = (snap.title || "Guess the Country").slice(0, 200);
    const { data, error } = await sb
      .from("game_results")
      .insert({ user_id: u.user.id, title, data: snap })
      .select("id")
      .single();
    return error ? null : ((data as { id: string } | null)?.id ?? null);
  } catch {
    return null;
  }
}

/** The current user's saved games, newest first. */
export async function listGameResults(): Promise<SavedGame[]> {
  try {
    const sb = getSupabaseBrowser();
    const { data, error } = await sb
      .from("game_results")
      .select("id,title,created_at,data")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return data as unknown as SavedGame[];
  } catch {
    return [];
  }
}

/** Permanently delete a saved game from Supabase (RLS ensures it's the owner's). */
export async function deleteGameResult(id: string): Promise<boolean> {
  try {
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("game_results").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
