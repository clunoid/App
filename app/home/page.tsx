"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClunoid } from "@/lib/store/useClunoid";
import { IsaacOrb } from "@/components/stage/IsaacOrb";
import { ProfileMenu } from "@/components/auth/ProfileMenu";

/**
 * The authenticated app. Isaac's orb is an unbounded background; the UI renders
 * over it. Signed-out visitors are sent back to the welcome gate. The brain's
 * stage (left: animated media · right: info cards · continuable chat) mounts
 * into the empty area below the header next.
 */
export default function Home() {
  const router = useRouter();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);

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
        {/* Brain stage (media · info cards · chat) mounts here next. */}
      </div>
    </main>
  );
}
