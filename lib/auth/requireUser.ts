import { getSupabaseServer } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * The verified, signed-in user for the current request — or null. Reads the
 * session from the request cookies and validates it server-side via Supabase.
 * NEVER trusts a client-supplied identity. Use this to gate every route that
 * spends money: no valid session → return 401.
 */
export async function requireUser(): Promise<User | null> {
  try {
    const supabase = await getSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}
