"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (singleton). Uses the public anon key and the
 * user's session cookie — all access is constrained by Row Level Security.
 */
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return cached;
}
