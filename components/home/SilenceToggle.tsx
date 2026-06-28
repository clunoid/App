"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useClunoid } from "@/lib/store/useClunoid";
import { cn } from "@/lib/utils";

/**
 * Floating toggle that silences Isaac — for quiet time, and to save credits
 * (silent mode never calls the voice API; lines still appear as text). Persists
 * across refreshes via the store.
 */
export function SilenceToggle() {
  const muted = useClunoid((s) => s.muted);
  const setMuted = useClunoid((s) => s.setMuted);
  return (
    <button
      onClick={() => setMuted(!muted)}
      aria-pressed={muted}
      aria-label={muted ? "Let Isaac speak" : "Silence Isaac"}
      title={muted ? "Isaac is silent — tap to let him speak" : "Silence Isaac — read instead & save credits"}
      className={cn(
        "fixed right-4 bottom-28 z-30 flex items-center gap-2 rounded-full border px-3.5 py-2.5 text-sm font-semibold shadow-soft backdrop-blur transition sm:bottom-32",
        muted
          ? "border-clay/50 bg-clay/15 text-clay-soft hover:bg-clay/20"
          : "border-border bg-surface/80 text-ink-muted hover:text-ink"
      )}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      <span className="hidden sm:inline">{muted ? "Silent" : "Isaac on"}</span>
    </button>
  );
}
