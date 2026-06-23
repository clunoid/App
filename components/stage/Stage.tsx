"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useClunoid } from "@/lib/store/useClunoid";
import { IsaacOrb } from "./IsaacOrb";
import { AuthPrompt } from "@/components/auth/AuthPrompt";
import { ProfileMenu } from "@/components/auth/ProfileMenu";

/**
 * The Clunoid shell.
 *  - while we check the saved session → the orb (no flash of the gate)
 *  - brand-new / signed-out visitors → the welcome gate ("Start exploring")
 *  - signed-in visitors → the live app (Isaac's orb + their profile)
 *
 * Auth is restored automatically from the Supabase session (cookies/local
 * storage), so returning users are signed straight back in — no re-login.
 */
export function Stage() {
  const started = useClunoid((s) => s.started);
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const name = useClunoid((s) => s.user.name);
  const { setUser, startExploring } = useClunoid.getState();

  const [authChecked, setAuthChecked] = useState(false);

  // Restore the Supabase session on load and keep it in sync (handles OAuth
  // return, sign-out, token refresh). Supabase persists the session in the
  // browser, so the user is signed in automatically across refreshes.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    // onAuthStateChange fires several times (initial, signed-in, token refresh);
    // remember whose profile we've pulled so we don't re-hit the DB each event.
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
      // Sign in IMMEDIATELY from the local session — never block on the DB read
      // (a slow/unreachable fetch must not strand the user on the welcome gate).
      setUser({ ...base, name: metaName });
      // Best-effort: upgrade the display name from their profile in the
      // background, once per user. If it hangs or fails, they stay signed in.
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
          if (dn && useClunoid.getState().user.isAuthed) setUser({ ...base, name: dn });
        } catch {
          enrichedFor = null; // allow a retry on a later event
        }
      })();
    }

    // getSession() reads the locally-stored session (fast, no network), so the
    // UI is never blocked on a slow/unreachable auth server.
    supabase.auth
      .getSession()
      .then(({ data }) => hydrate(data.session?.user ?? null))
      .finally(() => setAuthChecked(true));
    // Safety net: never leave the app stuck on the loading screen.
    const t = setTimeout(() => setAuthChecked(true), 2000);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => hydrate(session?.user ?? null));
    return () => {
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, [setUser]);

  // A signed-in visitor (including the returning Google OAuth redirect) skips the
  // welcome gate and lands straight in the live app.
  useEffect(() => {
    if (authChecked && isAuthed && !started) useClunoid.setState({ started: true });
  }, [authChecked, isAuthed, started]);

  // Brief loading while we check the saved session (avoids a flash of the gate).
  if (!authChecked) {
    return (
      <main className="stage-bg grid min-h-[100dvh] place-items-center">
        <IsaacOrb size={120} />
      </main>
    );
  }

  // Welcome gate vs. live app. A SINGLE AuthPrompt is mounted below both so it
  // survives the gate → live transition (otherwise a remount loses the close
  // state and the modal lingers over the live stage after sign-up).
  const showGate = !started && !isAuthed;

  return (
    <>
      {showGate ? (
        <main className="stage-bg grid min-h-[100dvh] place-items-center px-6">
          <div className="flex max-w-md flex-col items-center text-center">
            <IsaacOrb size={170} />
            <h1 className="mt-8 font-serif text-5xl text-ink">Clunoid</h1>
            <p className="mt-3 text-ink-muted">
              Meet Isaac — a super-intelligent companion who can show you anything
              and figure out anything you&apos;re curious about.
            </p>
            <button
              onClick={startExploring}
              className="mt-8 rounded-full bg-clay px-8 py-4 text-lg font-medium text-[#1F1E1C] shadow-glow transition hover:bg-clay-soft"
            >
              Start exploring
            </button>
            <p className="mt-4 text-xs text-ink-faint">
              Sign in or create your free account to make Clunoid yours.
            </p>
          </div>
        </main>
      ) : (
        <main className="stage-bg relative h-[100dvh] w-screen overflow-hidden">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <IsaacOrb size={240} />
          </div>

          <div className="relative z-10 flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
              <span className="font-serif text-lg text-ink/80">clunoid</span>
              <ProfileMenu />
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
              <h2 className="font-serif text-3xl text-ink sm:text-4xl">
                {name ? `You're in, ${name}.` : "You're in."}
              </h2>
              <p className="mt-3 max-w-md text-ink-muted">
                Your Clunoid account is ready. Isaac is warming up — soon you&apos;ll be
                able to ask him anything, out loud or typed, and watch it come to life.
              </p>
            </div>
          </div>
        </main>
      )}

      <AuthPrompt />
    </>
  );
}
