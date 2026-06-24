"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baloo_2 } from "next/font/google";
import { FlagQuiz } from "@/components/games/FlagQuiz";
import { RaysBackground } from "@/components/games/RaysBackground";
import { useClunoid } from "@/lib/store/useClunoid";

// Playful rounded display font for the game (scoped — applied only here).
const baloo = Baloo_2({ subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });

function Loader() {
  return (
    <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden">
      <RaysBackground hue={222} />
      <div className="relative z-10 h-12 w-12 animate-spin rounded-full border-4 border-white/40 border-t-white" />
    </div>
  );
}

function GamesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);

  // Same guard as /home — signed-out visitors return to the welcome gate.
  useEffect(() => {
    if (authChecked && !isAuthed) router.replace("/");
  }, [authChecked, isAuthed, router]);

  if (!authChecked || !isAuthed) return <Loader />;

  const q = params.get("q") || undefined;
  return <FlagQuiz initialRequest={q} />;
}

export default function GamesPage() {
  return (
    <main className={baloo.className}>
      <Suspense fallback={<Loader />}>
        <GamesInner />
      </Suspense>
    </main>
  );
}
