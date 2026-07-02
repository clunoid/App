"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baloo_2 } from "next/font/google";
import { VideoDirect } from "@/components/games/VideoDirect";
import { useClunoid } from "@/lib/store/useClunoid";

const baloo = Baloo_2({ subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });

function Loader() {
  return (
    <div className="grid h-[100dvh] w-screen place-items-center bg-[#141018]">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
    </div>
  );
}

function VideoInner() {
  const router = useRouter();
  const params = useSearchParams();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);

  // Same guard as the game — signed-out visitors return to the welcome gate.
  useEffect(() => {
    if (authChecked && !isAuthed) router.replace("/");
  }, [authChecked, isAuthed, router]);

  // Silence the /home Isaac orb so it can never talk over a preview.
  useEffect(() => {
    useClunoid.getState().interrupt();
  }, []);

  if (!authChecked || !isAuthed) return <Loader />;
  const q = params.get("q") || undefined;
  return <VideoDirect initialRequest={q} />;
}

export default function VideoDirectPage() {
  return (
    <main className={baloo.className}>
      <Suspense fallback={<Loader />}>
        <VideoInner />
      </Suspense>
    </main>
  );
}
