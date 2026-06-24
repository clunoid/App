"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClunoid } from "@/lib/store/useClunoid";
import { IsaacOrb } from "@/components/stage/IsaacOrb";
import { AuthPrompt } from "@/components/auth/AuthPrompt";

/**
 * Welcome gate (public landing). Signed-out visitors meet Isaac and start
 * exploring; signed-in visitors are sent straight to /home.
 */
export default function Welcome() {
  const router = useRouter();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const openAuth = useClunoid((s) => s.openAuth);

  useEffect(() => {
    if (authChecked && isAuthed) router.replace("/home");
  }, [authChecked, isAuthed, router]);

  // Signed-in visitors are redirected to /home; show the orb during that brief
  // moment. Everyone else — including search engines and the first paint — gets
  // the full landing content below, so it's crawlable (not a thin/empty page).
  if (authChecked && isAuthed) {
    return (
      <main className="stage-bg grid min-h-[100dvh] place-items-center">
        <IsaacOrb size={120} />
      </main>
    );
  }

  return (
    <>
      <main className="stage-bg grid min-h-[100dvh] place-items-center px-6">
        <div className="flex max-w-md flex-col items-center text-center">
          <IsaacOrb size={170} />
          <h1 className="mt-8 font-serif text-5xl text-ink">Clunoid</h1>
          <p className="mt-3 text-ink-muted">
            Meet Isaac — a super-intelligent companion who can show you anything
            and figure out anything you&apos;re curious about.
          </p>
          <button
            onClick={() => openAuth("signup")}
            className="mt-8 rounded-full bg-clay px-8 py-4 text-lg font-medium text-[#1F1E1C] shadow-glow transition hover:bg-clay-soft"
          >
            Start exploring
          </button>
          <p className="mt-4 text-xs text-ink-faint">
            Ask Isaac anything — the harder the question, the better.
          </p>
        </div>
      </main>
      <AuthPrompt />
    </>
  );
}
