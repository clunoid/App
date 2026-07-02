"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraphicsStudio } from "@/components/graphics/GraphicsStudio";
import { useClunoid } from "@/lib/store/useClunoid";

function Loader() {
  return (
    <div className="grid h-[100dvh] w-screen place-items-center bg-[#0c0b13]">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
    </div>
  );
}

function GraphicsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);

  // Same guard as the other feature pages — signed-out visitors go to the welcome gate.
  useEffect(() => {
    if (authChecked && !isAuthed) router.replace("/");
  }, [authChecked, isAuthed, router]);

  // Silence the /home Isaac orb so it can never talk over a render preview.
  useEffect(() => {
    useClunoid.getState().interrupt();
  }, []);

  if (!authChecked || !isAuthed) return <Loader />;
  const q = params.get("q") || undefined;
  return <GraphicsStudio initialRequest={q} />;
}

export default function GraphicsPage() {
  return (
    <main>
      <Suspense fallback={<Loader />}>
        <GraphicsInner />
      </Suspense>
    </main>
  );
}
