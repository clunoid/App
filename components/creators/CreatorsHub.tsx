"use client";

/**
 * CREATOR PROGRAM — the page shell: the Clunoid Trading background and the
 * header, nothing else. Content gets added deliberately rather than assumed.
 */
import Link from "next/link";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { TC, DOT_GRID } from "@/lib/trading/theme";

export function CreatorsHub() {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 w-full px-5 py-5 sm:px-8 lg:px-12 xl:px-16">
        <header className="flex w-full flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          {/* No brand logo to show here, so the wordmark sits in the same chip
              the broker logos use, keeping the platform headers consistent. */}
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
            <Clapperboard size={14} style={{ color: "#a78bfa" }} />
            <span className="text-[12.5px] font-bold tracking-tight">Creator Program</span>
          </span>
        </header>
      </div>
    </main>
  );
}
