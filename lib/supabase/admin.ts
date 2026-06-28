import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client — SERVER ONLY. It bypasses RLS, so it must NEVER
 * be imported into client ("use client") code or shipped to the browser. Used
 * only by the billing webhook (apply a subscription/grant) and best-effort
 * refunds. Returns null when SUPABASE_SERVICE_ROLE_KEY isn't configured yet, so
 * callers degrade gracefully (no crash — the privileged action is simply skipped).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (typeof window !== "undefined") throw new Error("getSupabaseAdmin is server-only");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
