"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export type IsaacStatus = { subscriber: boolean; available: boolean };

/**
 * READ-ONLY check of whether Isaac's premium voice is available to this user for
 * a feature, WITHOUT consuming the one-time free trial (grant_isaac spends it).
 * Drives the host pickers' "Isaac enabled" vs "Subscribe to unlock" state.
 * Fail-closed (treat as unavailable) on any error so we never over-promise Isaac.
 */
export async function isaacStatus(feature: "game" | "search"): Promise<IsaacStatus> {
  try {
    const { data } = await getSupabaseBrowser().rpc("isaac_status", { p_feature: feature });
    if (data && typeof data === "object") {
      const d = data as { subscriber?: boolean; available?: boolean };
      return { subscriber: !!d.subscriber, available: !!d.available };
    }
  } catch {
    /* network / not signed in → unavailable */
  }
  return { subscriber: false, available: false };
}
