"use client";

/**
 * Stat Battle history, stored per-user in Supabase (RLS owner-only). We persist the
 * full RaceData so a saved battle can be re-opened, edited, re-rendered to video, or
 * its branded data sheet re-downloaded — the downloadable file is derived from the
 * data, so nothing extra is stored. Everything is gated by the user's session.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { RaceData } from "./types";

export type SavedBattle = { id: string; title: string; created_at: string; data: RaceData };

/** Insert a new saved battle (or UPDATE an existing one when `id` is given). Returns its id. */
export async function saveStatBattle(race: RaceData, id?: string | null): Promise<string | null> {
  try {
    const sb = getSupabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return null;
    const title = (race.title || "Stat Battle").slice(0, 200);
    if (id) {
      const { error } = await sb.from("stat_battles").update({ title, data: race }).eq("id", id);
      return error ? null : id;
    }
    const { data, error } = await sb
      .from("stat_battles")
      .insert({ user_id: u.user.id, title, data: race })
      .select("id")
      .single();
    return error ? null : ((data as { id: string } | null)?.id ?? null);
  } catch {
    return null; // saving is best-effort — never block the battle
  }
}

/** The current user's saved battles, newest first. */
export async function listStatBattles(): Promise<SavedBattle[]> {
  try {
    const sb = getSupabaseBrowser();
    const { data, error } = await sb
      .from("stat_battles")
      .select("id,title,created_at,data")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return data as unknown as SavedBattle[];
  } catch {
    return [];
  }
}

/** Permanently delete a saved battle from Supabase (RLS ensures it's the owner's). */
export async function deleteStatBattle(id: string): Promise<boolean> {
  try {
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("stat_battles").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
