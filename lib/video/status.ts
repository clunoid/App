"use client";

/**
 * Read-only Video Direct quota for the UI ("X of 2 free premium videos left this
 * month" / "Unlimited"). Does NOT consume anything — the authoritative claim happens
 * server-side in /api/games/plan. Fails OPEN (available:true, remaining unknown) so a
 * transient RPC error never wrongly blocks the Generate button; the server still gates.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";

export type VideoDirectStatus = {
  subscriber: boolean;
  used: number;
  limit: number;
  remaining: number | null; // null = unlimited (subscriber) or unknown (error)
  available: boolean;
};

const OPEN: VideoDirectStatus = { subscriber: false, used: 0, limit: 2, remaining: null, available: true };

export async function videoDirectStatus(): Promise<VideoDirectStatus> {
  try {
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase.rpc("video_direct_status");
    if (error || !data) return OPEN;
    return data as VideoDirectStatus;
  } catch {
    return OPEN;
  }
}
