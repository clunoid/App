"use client";

/**
 * Motion Graphics history — per-user in Supabase (RLS owner-only), mirroring the
 * games / stat-battle pattern: the full spec is stored so a video can be re-opened
 * and re-rendered from history; rendered premium files are cached per-device in the
 * shared IndexedDB video store under this row's id.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { MotionSpec } from "./spec";

export type GraphicsSnapshot = { prompt: string; voice: string; spec: MotionSpec };
export type SavedGraphics = { id: string; title: string; created_at: string; data: GraphicsSnapshot };

export async function saveGraphicsVideo(snap: GraphicsSnapshot): Promise<string | null> {
  try {
    const sb = getSupabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return null;
    const title = (snap.spec.title || snap.prompt || "Motion graphics").slice(0, 200);
    const { data, error } = await sb
      .from("graphics_videos")
      .insert({ user_id: u.user.id, title, data: snap })
      .select("id")
      .single();
    return error ? null : ((data as { id: string } | null)?.id ?? null);
  } catch {
    return null;
  }
}

export async function listGraphicsVideos(): Promise<SavedGraphics[]> {
  try {
    const sb = getSupabaseBrowser();
    const { data, error } = await sb
      .from("graphics_videos")
      .select("id,title,created_at,data")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return data as unknown as SavedGraphics[];
  } catch {
    return [];
  }
}

export async function deleteGraphicsVideo(id: string): Promise<boolean> {
  try {
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("graphics_videos").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
