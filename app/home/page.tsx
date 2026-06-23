"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClunoid } from "@/lib/store/useClunoid";
import { formatName } from "@/lib/utils";
import { IsaacOrb } from "@/components/stage/IsaacOrb";
import { ProfileMenu } from "@/components/auth/ProfileMenu";

/**
 * The authenticated app. Isaac's orb is an unbounded background; the UI renders
 * over it. Signed-out visitors are sent back to the welcome gate.
 */
export default function Home() {
  const router = useRouter();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const name = useClunoid((s) => s.user.name);

  useEffect(() => {
    if (authChecked && !isAuthed) router.replace("/");
  }, [authChecked, isAuthed, router]);

  // Checking the session, or signed out (about to redirect) → just the orb.
  if (!authChecked || !isAuthed) {
    return (
      <main className="stage-bg grid min-h-[100dvh] place-items-center">
        <IsaacOrb size={120} />
      </main>
    );
  }

  return (
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
            {name ? `You're in, ${formatName(name)}.` : "You're in."}
          </h2>
          <p className="mt-3 max-w-md text-ink-muted">
            Your Clunoid account is ready. Isaac is warming up — soon you&apos;ll be
            able to ask him anything, out loud or typed, and watch it come to life.
          </p>
        </div>
      </div>
    </main>
  );
}
