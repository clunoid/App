"use client";

import { useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useClunoid } from "@/lib/store/useClunoid";
import { formatName } from "@/lib/utils";

/**
 * Restores the Supabase session once, app-wide, and keeps it in sync (handles
 * OAuth return, sign-out, token refresh). Mounted in the root layout so every
 * route shares one subscription; pages read `user`/`authChecked` from the store
 * and guard their own access. Returning users are signed in automatically.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const setUser = useClunoid((s) => s.setUser);
  const setAuthChecked = useClunoid((s) => s.setAuthChecked);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    // onAuthStateChange fires several times; remember whose profile we've pulled
    // so we don't re-hit the DB on every event.
    let enrichedFor: string | null = null;

    function hydrate(
      authUser:
        | { id: string; email?: string; created_at?: string; user_metadata?: Record<string, unknown> }
        | null
    ) {
      if (!authUser) {
        setUser({ isAuthed: false });
        enrichedFor = null;
        return;
      }
      const metaName =
        (authUser.user_metadata?.name as string) ||
        (authUser.user_metadata?.full_name as string) ||
        undefined;
      const avatarUrl =
        (authUser.user_metadata?.avatar_url as string) ||
        (authUser.user_metadata?.picture as string) ||
        undefined;
      const base = {
        id: authUser.id,
        email: authUser.email,
        avatarUrl,
        createdAt: authUser.created_at,
        isAuthed: true as const,
      };
      // Sign in IMMEDIATELY from the local session — never block on the DB read.
      setUser({ ...base, name: metaName ? formatName(metaName) : undefined });
      // Best-effort: upgrade the display name from their profile, once per user.
      if (enrichedFor === authUser.id) return;
      enrichedFor = authUser.id;
      void (async () => {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", authUser.id)
            .maybeSingle();
          const dn = profile?.display_name as string | undefined;
          if (dn && useClunoid.getState().user.isAuthed) setUser({ ...base, name: formatName(dn) });
        } catch {
          enrichedFor = null; // allow a retry on a later event
        }
      })();
    }

    // getSession() reads the locally-stored session (fast, no network).
    supabase.auth
      .getSession()
      .then(({ data }) => hydrate(data.session?.user ?? null))
      .finally(() => setAuthChecked(true));
    // Safety net: never leave routes stuck on the loading screen.
    const t = setTimeout(() => setAuthChecked(true), 2000);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => hydrate(session?.user ?? null));
    return () => {
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, [setUser, setAuthChecked]);

  return <>{children}</>;
}
