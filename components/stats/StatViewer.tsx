"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Gauge, Monitor, RotateCcw, Smartphone, X } from "lucide-react";
import { drawRaceStyle, newRaceState, RACE_STYLES } from "@/lib/stats/render";
import type { RaceStyle } from "@/lib/stats/render";
import type { RaceData } from "@/lib/stats/types";
import { LEN_MIN, LEN_MAX, sliderColor } from "@/lib/share/reel";

const fmtDur = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s) % 60)).padStart(2, "0")}`;

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
  speed,
  onSpeed,
  onPrev,
  onNext,
  onClose,
  initialMode = "landscape",
}: {
  race: RaceData;
  style: RaceStyle;
  speed: number;
  onSpeed: (v: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [replay, setReplay] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const label = RACE_STYLES.find((s) => s.id === style)?.label ?? style;

  // Animation loop — restarts on design change or replay (NOT on orientation
  // toggle, so flipping landscape/portrait doesn't restart the race).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const state = newRaceState();
    // Pace over (durationSec / speed) wall-seconds; reads speedRef so dragging the
    // speed slider re-paces live without restarting the race.
    let prog = 0;
    let last = performance.now();
    let holdAt = 0;
    let raf = 0;
    drawRaceStyle(ctx, canvas.width, canvas.height, race, state, 0, style);
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (prog < 1) {
        const playSec = race.durationSec / Math.max(0.05, speedRef.current);
        prog = Math.min(1, prog + (playSec > 0 ? dt / playSec : 1));
        if (prog >= 1) holdAt = now;
      }
      drawRaceStyle(ctx, canvas.width, canvas.height, race, state, prog * race.durationSec, style);
      if (prog < 1 || now - holdAt < 2200) raf = requestAnimationFrame(loop);
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

      {/* bottom controls — speed slider, then design nav (wrap so nothing overflows) */}
      <div className="flex flex-col items-center gap-2.5 px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {(() => {
          const play = Math.min(LEN_MAX, Math.max(LEN_MIN, Math.round(race.durationSec / speed)));
          return (
            <div className="flex w-full max-w-md items-center gap-2.5 rounded-full bg-white/10 px-4 py-2">
              <Gauge size={16} className="shrink-0" />
              <span className="shrink-0 text-xs font-extrabold">Speed</span>
              <span className="hidden shrink-0 text-[10px] font-bold text-white/40 sm:inline">Faster</span>
              <input
                type="range"
                min={LEN_MIN}
                max={LEN_MAX}
                step={5}
                value={play}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v > 0) onSpeed(race.durationSec / v);
                }}
                aria-label="Playback length"
                style={{ accentColor: sliderColor((play - LEN_MIN) / (LEN_MAX - LEN_MIN)) }}
                className="h-1.5 flex-1 cursor-pointer"
              />
              <span className="hidden shrink-0 text-[10px] font-bold text-white/40 sm:inline">Slower</span>
              <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-white/70">{fmtDur(play)}</span>
            </div>
          );
        })()}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
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
    </div>
  );
}
