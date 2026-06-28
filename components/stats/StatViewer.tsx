"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Monitor, RotateCcw, Smartphone, X } from "lucide-react";
import { drawRaceStyle, newRaceState, RACE_STYLES } from "@/lib/stats/render";
import type { RaceStyle } from "@/lib/stats/render";
import type { RaceData } from "@/lib/stats/types";

type Mode = "landscape" | "portrait";
type OrientationExt = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

function getOrientation(): OrientationExt | undefined {
  return typeof screen !== "undefined" ? (screen.orientation as OrientationExt | undefined) : undefined;
}

/** Best-effort immersive landscape: fullscreen + orientation lock. Call from a
 *  user gesture (click). Safe everywhere — unsupported browsers just no-op. */
export async function requestLandscape(): Promise<void> {
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
    await getOrientation()?.lock?.("landscape");
  } catch {
    /* iOS Safari etc. — the CSS overlay + the device's own auto-rotate still work */
  }
}

/** Leave immersive mode (unlock orientation + exit fullscreen). Never throws. */
export async function exitImmersive(): Promise<void> {
  try {
    getOrientation()?.unlock?.();
  } catch {
    /* ignore */
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

/**
 * Immersive fullscreen viewer for a stat battle. Fills the screen so the race
 * reads big on a phone; "landscape" mode also asks the device to go fullscreen
 * and rotate (where supported — elsewhere you just turn the phone), "portrait"
 * keeps it upright and fits to width. Arrow keys / on-screen arrows flip
 * between designs; Esc closes.
 */
export function StatViewer({
  race,
  style,
  onPrev,
  onNext,
  onClose,
  initialMode = "landscape",
}: {
  race: RaceData;
  style: RaceStyle;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [replay, setReplay] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const label = RACE_STYLES.find((s) => s.id === style)?.label ?? style;

  // Animation loop — restarts on design change or replay (NOT on orientation
  // toggle, so flipping landscape/portrait doesn't restart the race).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const state = newRaceState();
    const total = race.durationSec + 2.2;
    const t0 = performance.now();
    let raf = 0;
    drawRaceStyle(ctx, canvas.width, canvas.height, race, state, 0, style);
    const loop = () => {
      const el = (performance.now() - t0) / 1000;
      drawRaceStyle(ctx, canvas.width, canvas.height, race, state, Math.min(el, race.durationSec), style);
      if (el < total) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [race, style, replay]);

  // Keyboard: Esc closes, ←/→ flip designs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  // Always leave immersive mode when the viewer closes.
  useEffect(() => {
    return () => {
      void exitImmersive();
    };
  }, []);

  // Toggle orientation from a real user gesture (so fullscreen is allowed).
  const toggleMode = () => {
    const next: Mode = mode === "landscape" ? "portrait" : "landscape";
    setMode(next);
    if (next === "landscape") void requestLandscape();
    else void exitImmersive();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white select-none">
      {/* top bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <span className="min-w-0 truncate text-sm font-bold text-white/90">{race.title}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={toggleMode} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold transition hover:bg-white/20">
            {mode === "landscape" ? <Smartphone size={15} /> : <Monitor size={15} />}
            <span className="hidden sm:inline">{mode === "landscape" ? "Portrait" : "Landscape"}</span>
          </button>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* canvas + edge arrows */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <button
          onClick={onPrev}
          aria-label="Previous design"
          className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition hover:bg-white/25"
        >
          <ChevronLeft size={24} />
        </button>
        <canvas ref={canvasRef} width={1280} height={720} className="max-h-full max-w-full rounded-lg" style={{ background: "#c8c5bd" }} />
        <button
          onClick={onNext}
          aria-label="Next design"
          className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition hover:bg-white/25"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* bottom controls — wrap so they never overflow on tiny screens */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:gap-3">
        <button onClick={onPrev} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="min-w-[4rem] shrink-0 text-center text-sm font-extrabold">{label}</span>
        <button onClick={onNext} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
          Next <ChevronRight size={16} />
        </button>
        <button onClick={() => setReplay((n) => n + 1)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
          <RotateCcw size={16} /> Replay
        </button>
      </div>
    </div>
  );
}
