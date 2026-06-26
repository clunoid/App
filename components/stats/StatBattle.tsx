"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Play, RotateCcw, Film, Loader2, BarChart3 } from "lucide-react";
import { DocumentBackground } from "@/components/games/DocumentBackground";
import { ShareModal } from "@/components/share/ShareModal";
import { buildRace, gdpFallbackRace, PRESETS } from "@/lib/stats/generate";
import { drawRaceFrame, newRaceState, preloadRaceImages, renderRaceVideo } from "@/lib/stats/render";
import type { RaceData } from "@/lib/stats/types";
import type { ReelAspect } from "@/lib/share/reel";

const INK = "#2c2823";
const SEAL = "#8a2433";

type Phase = "menu" | "building" | "playing";

export function StatBattle({ initialRequest }: { initialRequest?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("menu");
  const [request, setRequest] = useState("");
  const [race, setRace] = useState<RaceData | null>(null);
  const [failed, setFailed] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const start = useCallback(async (req: string) => {
    const r = (req || "").trim();
    const isDefault = !r || r === PRESETS[0].request;
    setFailed(false);
    setPhase("building");
    try {
      const data = await buildRace(r || PRESETS[0].request);
      await preloadRaceImages(data).catch(() => {}); // flags ready before the race plays
      setRace(data);
      setReplayKey((n) => n + 1);
      setPhase("playing");
    } catch {
      // The GDP default always works (offline fallback); other topics that fail
      // (usually a transient model hiccup) ask the user to try again.
      if (isDefault) {
        const fb = gdpFallbackRace();
        await preloadRaceImages(fb).catch(() => {});
        setRace(fb);
        setReplayKey((n) => n + 1);
        setPhase("playing");
      } else {
        setFailed(true);
        setPhase("menu");
      }
    }
  }, []);

  const startedInitial = useRef(false);
  useEffect(() => {
    if (initialRequest && !startedInitial.current) {
      startedInitial.current = true;
      void start(initialRequest);
    }
  }, [initialRequest, start]);

  // Live preview loop (visual only; the export adds sound).
  useEffect(() => {
    if (phase !== "playing" || !race) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const state = newRaceState();
    const total = race.durationSec + 2.2;
    const t0 = performance.now();
    let raf = 0;
    const loop = () => {
      const el = (performance.now() - t0) / 1000;
      drawRaceFrame(ctx, canvas.width, canvas.height, race, state, Math.min(el, race.durationSec));
      if (el < total) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, race, replayKey]);

  // ── Menu ────────────────────────────────────────────────────────────────
  if (phase !== "playing") {
    const building = phase === "building";
    return (
      <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden px-6 select-none">
        <DocumentBackground />
        <button
          onClick={() => router.push("/home")}
          aria-label="Back"
          className="z-20 flex h-11 items-center gap-1.5 rounded-full px-4 text-[#2c2823] backdrop-blur transition hover:opacity-80"
          style={{ position: "absolute", left: 16, top: 16, background: "rgba(0,0,0,0.1)" }}
        >
          <ArrowLeft size={18} /> <span className="text-sm font-extrabold">Home</span>
        </button>

        <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
          {building ? (
            <>
              <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#2c2823]/25 border-t-[#2c2823]" />
              <p className="mt-5 text-xl font-extrabold" style={{ color: INK }}>
                Researching real data & building the story…
              </p>
              <p className="mt-2 text-sm font-semibold" style={{ color: "#2c2823aa" }}>
                Pulling verified figures and writing the timeline — this takes a moment.
              </p>
            </>
          ) : (
            <>
              <BarChart3 size={48} style={{ color: SEAL }} />
              <h1 className="mt-3 text-5xl font-extrabold leading-none tracking-tight sm:text-6xl" style={{ color: INK }}>
                Stat <span style={{ color: SEAL }}>Battle</span>
              </h1>
              <p className="mt-3 text-lg font-bold" style={{ color: "#2c2823cc" }}>
                Describe any ranking over time — watch history race.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void start(request.trim() || PRESETS[0].request);
                }}
                className="mt-6 flex w-full items-center gap-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-black/10 px-4 backdrop-blur">
                  <Sparkles size={18} className="shrink-0 text-[#2c2823]/60" />
                  <input
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    placeholder="e.g. World's Largest Economies GDP (1960–2026)"
                    className="h-12 w-full bg-transparent font-bold text-[#2c2823] outline-none placeholder:font-medium placeholder:text-[#2c2823]/55"
                  />
                </div>
                <button
                  type="submit"
                  aria-label="Generate"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#2c2823] text-[#f6f4ee] shadow-xl transition hover:scale-[1.05]"
                >
                  <Play size={20} fill="currentColor" />
                </button>
              </form>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => void start(p.request)}
                    className="rounded-full bg-black/10 px-4 py-2 text-sm font-extrabold text-[#2c2823] transition hover:bg-black/20"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {failed && <p className="mt-5 text-sm font-bold" style={{ color: SEAL }}>Couldn&apos;t build that one — try rephrasing the topic and range.</p>}
              <p className="mt-4 max-w-sm text-[11px] leading-relaxed text-[#2c2823]/50">
                Economy &amp; population stats use verified World Bank data; other topics are researched from the live web. Watch it here, or turn it into a video for your projects.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Player ──────────────────────────────────────────────────────────────
  return (
    <div className="relative grid h-[100dvh] w-screen place-items-center overflow-hidden px-3 select-none" style={{ background: "#bdbab2" }}>
      <button
        onClick={() => setPhase("menu")}
        aria-label="New stat battle"
        className="z-20 flex h-11 items-center gap-1.5 rounded-full px-4 text-[#2c2823] backdrop-blur transition hover:opacity-80"
        style={{ position: "absolute", left: 16, top: 16, background: "rgba(0,0,0,0.14)" }}
      >
        <ArrowLeft size={18} /> <span className="text-sm font-extrabold">New</span>
      </button>

      <div className="flex w-full max-w-4xl flex-col items-center gap-4">
        <canvas ref={canvasRef} width={1280} height={720} className="w-full rounded-2xl shadow-2xl" style={{ maxHeight: "72dvh", objectFit: "contain" }} />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setReplayKey((n) => n + 1)}
            className="flex items-center gap-2 rounded-full bg-black/15 px-5 py-3 font-extrabold text-[#2c2823] backdrop-blur transition hover:bg-black/25"
          >
            <RotateCcw size={18} /> Replay
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-2 rounded-full px-6 py-3 font-extrabold text-white shadow-xl transition hover:scale-[1.03]"
            style={{ background: "linear-gradient(120deg, #7c3aed 0%, #ec4899 50%, #f97316 100%)" }}
          >
            <Film size={18} /> Create video
          </button>
        </div>
        <p className="-mt-1 text-center text-xs font-semibold text-[#2c2823]/55">Watch it here, or export a video (optional) for your projects &amp; socials.</p>
      </div>

      {race && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          fileName="clunoid-stat-battle"
          heading="Share your stat battle"
          idleHint="Export this stat battle as a video — for your projects & socials."
          caption={`${race.title} — a stat battle from clunoid.com 📊`}
          render={(aspect: ReelAspect, opts) => renderRaceVideo(race, aspect, opts)}
        />
      )}
    </div>
  );
}
