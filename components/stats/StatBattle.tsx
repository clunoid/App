"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Play, RotateCcw, Film, Loader2, BarChart3, History } from "lucide-react";
import { DocumentBackground } from "@/components/games/DocumentBackground";
import { ShareModal } from "@/components/share/ShareModal";
import { StatReview } from "@/components/stats/StatReview";
import { StatHistory } from "@/components/stats/StatHistory";
import { buildRace, gdpFallbackRace, PRESETS } from "@/lib/stats/generate";
import { drawRaceFrame, newRaceState, preloadRaceImages, renderRaceVideo } from "@/lib/stats/render";
import { resolveRaceMedia } from "@/lib/stats/media";
import { saveStatBattle } from "@/lib/stats/storage";
import type { RaceData } from "@/lib/stats/types";
import type { ReelAspect } from "@/lib/share/reel";

const INK = "#2c2823";
const SEAL = "#8a2433";

// menu → building (research) → review (edit & approve the data) → playing
type Phase = "menu" | "building" | "review" | "playing";

/** One optional detail field (module-level so typing never loses focus). */
function OptField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1 text-left">
      <span className="text-[10px] font-bold uppercase tracking-wide text-[#2c2823]/50">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl px-3 text-sm font-semibold text-[#2c2823] outline-none backdrop-blur placeholder:font-normal placeholder:text-[#2c2823]/40"
        style={{ background: "rgba(0,0,0,0.09)" }}
      />
    </label>
  );
}

export function StatBattle({ initialRequest }: { initialRequest?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("menu");
  const [request, setRequest] = useState("");
  // optional guided details
  const [range, setRange] = useState("");
  const [bars, setBars] = useState("");
  const [units, setUnits] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [race, setRace] = useState<RaceData | null>(null);
  const [failed, setFailed] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const savedIdRef = useRef<string | null>(null); // Supabase id of the current battle (insert→update)

  // Weave the main request + any optional details into one natural-language prompt.
  const compose = useCallback(() => {
    let req = request.trim();
    if (!req) return "";
    if (competitors.trim()) req += ` — featuring exactly: ${competitors.trim()}`;
    if (range.trim()) req += ` (${range.trim()})`;
    if (bars.trim()) req += `, show top ${bars.trim()}`;
    if (units.trim()) req += `, in ${units.trim()}`;
    return req;
  }, [request, range, bars, units, competitors]);

  // The main input grows with its content (an "extending" box).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [request, phase]);

  const start = useCallback(async (req: string) => {
    const r = (req || "").trim();
    const isDefault = !r || r === PRESETS[0].request;
    setFailed(false);
    savedIdRef.current = null; // a brand-new battle → save as a new history entry
    setPhase("building");
    try {
      const data = await buildRace(r || PRESETS[0].request);
      await resolveRaceMedia(data).catch(() => {}); // flags / logos / photos by entity kind
      setRace(data);
      setPhase("review"); // user reviews/edits the data, then approves → it plays
    } catch {
      // The GDP default always works (offline fallback); other topics that fail
      // (usually a transient model hiccup) ask the user to try again.
      if (isDefault) {
        const fb = gdpFallbackRace();
        await resolveRaceMedia(fb).catch(() => {});
        setRace(fb);
        setPhase("review");
      } else {
        setFailed(true);
        setPhase("menu");
      }
    }
  }, []);

  // User approved the (possibly edited) data sheet → prepare media + play.
  const approve = useCallback(async (edited: RaceData) => {
    setPhase("building");
    await resolveRaceMedia(edited).catch(() => {}); // resolve media for any newly-added competitors
    await preloadRaceImages(edited).catch(() => {}); // decode before the race plays
    setRace(edited);
    setReplayKey((n) => n + 1);
    setPhase("playing");
    // Save to history (best-effort, in the background — never blocks the battle).
    // Insert the first time; update the same row on later edits/regenerations.
    void saveStatBattle(edited, savedIdRef.current).then((id) => {
      if (id) savedIdRef.current = id;
    });
  }, []);

  // Open a saved battle from history — play it, jump straight to editing, or play + export.
  const loadSaved = useCallback(async (saved: RaceData, id: string, mode: "play" | "edit" | "video") => {
    savedIdRef.current = id;
    setHistoryOpen(false);
    if (mode === "edit") {
      setRace(saved);
      setPhase("review");
      return;
    }
    setPhase("building");
    await resolveRaceMedia(saved).catch(() => {});
    await preloadRaceImages(saved).catch(() => {});
    setRace(saved);
    setReplayKey((n) => n + 1);
    setPhase("playing");
    if (mode === "video") setTimeout(() => setShareOpen(true), 120);
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
    drawRaceFrame(ctx, canvas.width, canvas.height, race, state, 0); // paint frame 0 immediately (never blank)
    const loop = () => {
      const el = (performance.now() - t0) / 1000;
      drawRaceFrame(ctx, canvas.width, canvas.height, race, state, Math.min(el, race.durationSec));
      if (el < total) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, race, replayKey]);

  // ── Review & edit the data sheet, then approve ───────────────────────────
  if (phase === "review" && race) {
    return <StatReview race={race} onApprove={approve} onBack={() => setPhase("menu")} />;
  }

  // ── Menu ────────────────────────────────────────────────────────────────
  if (phase !== "playing") {
    const building = phase === "building";
    return (
      <div className="relative flex h-[100dvh] w-screen flex-col items-center justify-center overflow-y-auto px-6 py-12 select-none">
        <DocumentBackground />
        <button
          onClick={() => router.push("/home")}
          aria-label="Back"
          className="z-20 flex h-11 items-center gap-1.5 rounded-full px-4 text-[#2c2823] backdrop-blur transition hover:opacity-80"
          style={{ position: "absolute", left: 16, top: 16, background: "rgba(0,0,0,0.1)" }}
        >
          <ArrowLeft size={18} /> <span className="text-sm font-extrabold">Home</span>
        </button>
        {!building && (
          <button
            onClick={() => setHistoryOpen(true)}
            aria-label="History"
            className="z-20 flex h-11 items-center gap-1.5 rounded-full px-4 text-[#2c2823] backdrop-blur transition hover:opacity-80"
            style={{ position: "absolute", right: 16, top: 16, background: "rgba(0,0,0,0.1)" }}
          >
            <History size={18} /> <span className="text-sm font-extrabold">History</span>
          </button>
        )}

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
              <BarChart3 size={42} style={{ color: SEAL }} />
              <h1 className="mt-2 text-4xl font-extrabold leading-none tracking-tight sm:text-5xl" style={{ color: INK }}>
                Stat <span style={{ color: SEAL }}>Battle</span>
              </h1>
              <p className="mt-2 text-base font-bold" style={{ color: "#2c2823cc" }}>
                Describe any ranking over time — watch it race.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void start(compose() || PRESETS[0].request);
                }}
                className="mt-5 w-full"
              >
                {/* main, extending request box */}
                <div className="flex w-full items-start gap-2 rounded-2xl px-4 py-3 backdrop-blur" style={{ background: "rgba(0,0,0,0.1)" }}>
                  <Sparkles size={18} className="mt-1 shrink-0 text-[#2c2823]/60" />
                  <textarea
                    ref={taRef}
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    rows={2}
                    placeholder="Describe your stat battle — e.g. Most valuable football players by transfer value, 2004 to 2026"
                    className="w-full resize-none bg-transparent text-[15px] font-bold leading-snug text-[#2c2823] outline-none placeholder:font-medium placeholder:text-[#2c2823]/50"
                  />
                </div>

                {/* optional guided details */}
                <p className="mb-2 mt-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#2c2823]/45">
                  Optional — add any details to get exactly what you want
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <OptField label="Time range" value={range} onChange={setRange} placeholder="e.g. 1960–2026, 1 AD–2026" />
                  <OptField label="Bars to show" value={bars} onChange={setBars} placeholder="e.g. 10, 15, 20" />
                  <OptField label="Units" value={units} onChange={setUnits} placeholder="millions / billions / exact" />
                  <OptField label="Only these competitors" value={competitors} onChange={setCompetitors} placeholder="e.g. Messi, Ronaldo, Mbappé" />
                </div>

                <button
                  type="submit"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#2c2823] py-3 font-extrabold text-[#f6f4ee] shadow-xl transition hover:scale-[1.02]"
                >
                  <Play size={18} fill="currentColor" /> Generate stat battle
                </button>
              </form>

              {/* presets fill the box so the user can tweak before generating */}
              <p className="mb-1.5 mt-5 text-left text-[11px] font-bold uppercase tracking-wide text-[#2c2823]/45 w-full">
                Or start from a preset, then customize
              </p>
              <div className="flex w-full flex-wrap justify-center gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setRequest(p.request);
                      taRef.current?.focus();
                    }}
                    className="rounded-full px-4 py-2 text-sm font-extrabold text-[#2c2823] transition hover:opacity-80"
                    style={{ background: "rgba(0,0,0,0.1)" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {failed && <p className="mt-5 text-sm font-bold" style={{ color: SEAL }}>Couldn&apos;t build that one — try rephrasing the topic and range.</p>}
              <p className="mt-4 max-w-sm text-[11px] leading-relaxed text-[#2c2823]/50">
                Economy &amp; population use verified World Bank data; other topics are researched from the live web, with logos &amp; photos pulled in automatically.
              </p>
            </>
          )}
        </div>
        <StatHistory open={historyOpen} onClose={() => setHistoryOpen(false)} onSelect={loadSaved} />
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
            onClick={() => setPhase("review")}
            className="flex items-center gap-2 rounded-full bg-black/15 px-5 py-3 font-extrabold text-[#2c2823] backdrop-blur transition hover:bg-black/25"
          >
            <Sparkles size={18} /> Edit with AI
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
          captionContext={{ title: race.title, subtitle: race.subtitle, source: race.source }}
          render={(aspect: ReelAspect, opts) => renderRaceVideo(race, aspect, opts)}
        />
      )}
    </div>
  );
}
