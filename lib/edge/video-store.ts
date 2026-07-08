"use client";

/**
 * Edge video history — the plan (re-renderable) in Supabase (owner-RLS
 * edge_videos), and the heavy rendered MP4s cached per-device in the shared
 * IndexedDB video store under the row id (same pattern as games / motion
 * graphics). Kept entirely separate from graphics_videos.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { saveGameVideo, loadGameVideo, deleteGameVideo } from "@/lib/games/videoStore";
import type { EdgeVideoSnapshot } from "./video-types";

export type SavedEdgeVideo = { id: string; title: string; created_at: string; data: EdgeVideoSnapshot };

export async function saveEdgeVideo(snap: EdgeVideoSnapshot, blobs: { portrait: Blob; landscape: Blob }): Promise<string | null> {
  try {
    const sb = getSupabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return null;
    const title = (snap.plan.title || snap.prompt || "Prediction video").slice(0, 200);
    const { data, error } = await sb.from("edge_videos").insert({ user_id: u.user.id, title, data: snap }).select("id").single();
    const id = error ? null : ((data as { id: string } | null)?.id ?? null);
    if (id) {
      // cache both formats locally so History can replay without re-rendering
      await saveGameVideo({
        gameId: id,
        voice: "edge-dual",
        branded: true,
        items: [
          { aspect: "9:16", ext: "mp4", mime: "video/mp4", blob: blobs.portrait },
          { aspect: "16:9", ext: "mp4", mime: "video/mp4", blob: blobs.landscape },
        ],
        createdAt: Date.now(),
      }).catch(() => {});
    }
    return id;
  } catch {
    return null;
  }
}

export async function listEdgeVideos(): Promise<SavedEdgeVideo[]> {
  try {
    const sb = getSupabaseBrowser();
    const { data, error } = await sb.from("edge_videos").select("id,title,created_at,data").order("created_at", { ascending: false }).limit(60);
    if (error || !data) return [];
    return data as unknown as SavedEdgeVideo[];
  } catch {
    return [];
  }
}

export async function loadEdgeVideoBlobs(id: string): Promise<{ portrait?: Blob; landscape?: Blob } | null> {
  const v = await loadGameVideo(id).catch(() => null);
  if (!v) return null;
  return { portrait: v.items.find((i) => i.aspect === "9:16")?.blob, landscape: v.items.find((i) => i.aspect === "16:9")?.blob };
}

export async function deleteEdgeVideo(id: string): Promise<boolean> {
  try {
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("edge_videos").delete().eq("id", id);
    await deleteGameVideo(id).catch(() => {});
    return !error;
  } catch {
    return false;
  }
}
