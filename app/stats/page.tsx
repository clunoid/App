"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baloo_2 } from "next/font/google";
import { StatBattle } from "@/components/stats/StatBattle";
import { DocumentBackground } from "@/components/games/DocumentBackground";
import { useClunoid } from "@/lib/store/useClunoid";

// Same chunky display font as the games, scoped to this page.
const baloo = Baloo_2({ subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });

function Loader() {
  return (
    <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden">
      <DocumentBackground />
      <div className="relative z-10 h-12 w-12 animate-spin rounded-full border-4 border-[#2c2823]/25 border-t-[#2c2823]" />
    </div>
  );
}

function StatsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);

  useEffect(() => {
    if (authChecked && !isAuthed) router.replace("/");
  }, [authChecked, isAuthed, router]);

  // Silence the main /home Isaac orb on entry (same as the game pages).
  useEffect(() => {
    useClunoid.getState().interrupt();
  }, []);

  if (!authChecked || !isAuthed) return <Loader />;

  const q = params.get("q") || undefined;
  return <StatBattle initialRequest={q} />;
}

export default function StatsPage() {
  return (
    <main className={baloo.className}>
      <Suspense fallback={<Loader />}>
        <StatsInner />
      </Suspense>
    </main>
  );
}
