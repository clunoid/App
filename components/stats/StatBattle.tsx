"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Play, RotateCcw, Film, Loader2, BarChart3, History, Shuffle, Upload, ChevronLeft, ChevronRight, Maximize2, Smartphone, Monitor, Gauge } from "lucide-react";
import { DocumentBackground } from "@/components/games/DocumentBackground";
import { ShareModal } from "@/components/share/ShareModal";
import { StatReview } from "@/components/stats/StatReview";
import { StatGate, useStatGate } from "@/components/stats/StatGate";
import { StatHistory } from "@/components/stats/StatHistory";
import { StatViewer, requestLandscape } from "@/components/stats/StatViewer";
import { buildRace, buildRaceFromFile, gdpFallbackRace, PRESETS } from "@/lib/stats/generate";
import { drawRaceStyle, newRaceState, preloadRaceImages, renderRaceVideo, RACE_STYLES } from "@/lib/stats/render";
import type { RaceStyle } from "@/lib/stats/render";
import { resolveRaceMedia } from "@/lib/stats/media";
import { saveStatBattle } from "@/lib/stats/storage";
import type { RaceData } from "@/lib/stats/types";
import { LEN_MIN, LEN_MAX, sliderColor, type ReelAspect } from "@/lib/share/reel";

const INK = "#2c2823";
const SEAL = "#8a2433";

/** Seconds → m:ss — for the speed / video-length readouts. */
const fmtDur = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s) % 60)).padStart(2, "0")}`;

// menu → building (research) → review (edit & approve the data) → playing
type Phase = "menu" | "building" | "review" | "playing";

// Curated, diverse ideas for the "Surprise me" button. Each is a full prompt
// (with its own range); some carry optional bars/units that we SOMETIMES drop
// into the guided fields so users see how those work too.
const SURPRISE: { req: string; bars?: string; units?: string }[] = [
  { req: "Most valuable football players by transfer value, 2004 to 2026", units: "millions" },
  { req: "World's largest companies by market cap, 1990 to 2026", units: "billions", bars: "12" },
  { req: "Richest people in the world, 1980 to 2026" },
  { req: "Most populous countries, 1950 to 2026", bars: "15" },
  { req: "Most-subscribed YouTube channels, 2010 to 2026" },
  { req: "Top international goalscorers in men's football, 1990 to 2026" },
  { req: "Largest militaries by active personnel, 1816 to 2026" },
  { req: "Most Grand Slam singles titles (men's tennis), 2000 to 2026" },
  { req: "World's tallest completed skyscrapers, 1900 to 2026", units: "meters" },
  { req: "Highest-grossing movie franchises of all time, 1977 to 2026", units: "billions" },
  { req: "Most Olympic gold medals by country, 1896 to 2024", bars: "12" },
  { req: "Biggest CO₂-emitting countries, 1960 to 2026" },
  { req: "Most-streamed artists on Spotify, 2015 to 2026" },
  { req: "Countries by GDP, 1960 to 2026", units: "trillions" },
  { req: "Most NBA championships by franchise, 1947 to 2026" },
  { req: "Top chess players by Elo rating, 1970 to 2026" },
  { req: "World's busiest airports by passengers, 1990 to 2026" },
  { req: "Best-selling video game consoles, 1972 to 2026", units: "millions" },
];

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

/** A selectable design preview — a representative still of the race in one style.
 *  (Module-level so its canvas effect is stable.) */
function StyleThumb({ race, styleId, label, selected, onClick }: { race: RaceData; styleId: RaceStyle; label: string; selected: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = 480;
    const H = 270;
    cv.width = W;
    cv.height = H;
    const el = race.durationSec * 0.78; // a near-full, representative frame
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const draw = () => drawRaceStyle(ctx, W, H, race, newRaceState(), el, styleId);
    draw();
    // redraw a few times so flags / photos appear as they finish loading
    const tick = () => {
      draw();
      if (++n < 6) timer = setTimeout(tick, 350);
    };
    timer = setTimeout(tick, 300);
    return () => clearTimeout(timer);
  }, [race, styleId]);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex flex-col items-center gap-1 rounded-xl p-1.5 transition hover:bg-black/[0.04]"
      style={{ outline: selected ? `2.5px solid ${SEAL}` : "1px solid rgba(0,0,0,0.12)", outlineOffset: -1, background: selected ? "rgba(0,0,0,0.05)" : "transparent" }}
    >
      <canvas ref={ref} className="w-32 rounded-lg sm:w-40" style={{ aspectRatio: "16 / 9", background: "#c8c5bd" }} />
      <span className="text-[11px] font-extrabold" style={{ color: selected ? SEAL : "#2c2823aa" }}>{label}</span>
    </button>
  );
}

const STORE_KEY = "clunoid_stat_battle_v1"; // per-tab snapshot so a refresh keeps your view

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
  const [errMsg, setErrMsg] = useState("");
  const [buildKind, setBuildKind] = useState<"gen" | "file">("gen");
  const [replayKey, setReplayKey] = useState(0);
  const [style, setStyle] = useState<RaceStyle>("bars"); // which visual design to show / export
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false); // "view fullscreen" prompt
  const [viewerMode, setViewerMode] = useState<"landscape" | "portrait" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const savedIdRef = useRef<string | null>(null); // Supabase id of the current battle (insert→update)
  // Pre-flight gate: verify auth + enough credits (server-side, no AI/charge) BEFORE any
  // expensive Opus request — on success a green tick plays, then generation auto-starts.
  const { gate, runGate } = useStatGate();

  // Playback SPEED (multiplier; 0.5 = HALF the natural pace = the default, a calmer
  // higher-quality watch). Higher = faster, the years roll by quicker. A ref lets the
  // live loop re-pace smoothly when the slider is dragged (no restart). The exported
  // VIDEO uses its own per-size length set in the share modal — speed only affects
  // the live views (card + fullscreen) and applies to history too.
  const [speed, setSpeed] = useState(0.5);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

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
    setErrMsg("");
    // GATE FIRST — nothing reaches the model until auth + credits are verified. On 401/402
    // the gate raises the auth / credits popup and we stop here (no request is sent).
    const okToRun = await runGate(r || PRESETS[0].request, "generate");
    if (!okToRun) return;
    setBuildKind("gen");
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
        setErrMsg("Couldn't build that one — try rephrasing the topic and range.");
        setPhase("menu");
      }
    }
  }, [runGate]);

  // "Surprise me" — drop a random ready-made idea into the box, and SOMETIMES
  // pre-fill a guided field or two so users discover them.
  const surprise = useCallback(() => {
    setErrMsg("");
    const pick = SURPRISE[Math.floor(Math.random() * SURPRISE.length)];
    setRequest(pick.req);
    // these aren't in the prompt text, so filling them won't duplicate anything
    setRange("");
    setCompetitors("");
    const fill = Math.random() < 0.5;
    setBars(fill && pick.bars && Math.random() < 0.7 ? pick.bars : "");
    setUnits(fill && pick.units && Math.random() < 0.7 ? pick.units : "");
    taRef.current?.focus();
  }, []);

  // Upload a document the user already has and build the battle from it.
  const onFile = useCallback(async (file: File) => {
    const MAX = 3 * 1024 * 1024; // 3 MB — keeps the request under the serverless body limit
    if (file.size > MAX) {
      setErrMsg("That file is over 3 MB. Please upload a smaller PDF, CSV, TXT or MD file.");
      return;
    }
    setErrMsg("");
    // GATE FIRST — a file build always runs Opus, so verify auth + credits before reading it.
    const okToRun = await runGate(file.name, "file");
    if (!okToRun) return;
    setBuildKind("file");
    savedIdRef.current = null;
    setPhase("building");
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      let data: RaceData;
      if (isPdf) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        const CH = 0x8000;
        for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
        data = await buildRaceFromFile({ kind: "pdf", filename: file.name, dataBase64: btoa(bin) });
      } else {
        const text = await file.text();
        data = await buildRaceFromFile({ kind: "text", filename: file.name, text });
      }
      await resolveRaceMedia(data).catch(() => {});
      setRace(data);
      setPhase("review");
    } catch {
      setErrMsg("Couldn't read that file — use a PDF, CSV, TXT or MD with a clear ranking and numbers.");
      setPhase("menu");
    }
  }, [runGate]);

  // User approved the (possibly edited) data sheet → prepare media + play.
  const approve = useCallback(async (edited: RaceData) => {
    setBuildKind("gen"); // this build is media prep, not file reading
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
    setBuildKind("gen"); // loading a saved battle / media prep, not file reading
    setPhase("building");
    await resolveRaceMedia(saved).catch(() => {});
    await preloadRaceImages(saved).catch(() => {});
    setRace(saved);
    setReplayKey((n) => n + 1);
    setPhase("playing");
    if (mode === "video") setTimeout(() => setShareOpen(true), 120);
  }, []);

  // On mount: an explicit ?q request starts a new battle; otherwise restore the
  // last view from this tab so a REFRESH keeps you exactly where you were.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (initialRequest) {
      void start(initialRequest);
      return;
    }
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        phase?: Phase; request?: string; range?: string; bars?: string; units?: string;
        competitors?: string; style?: RaceStyle; speed?: number; savedId?: string | null; race?: RaceData | null;
      };
      setRequest(s.request || "");
      setRange(s.range || "");
      setBars(s.bars || "");
      setUnits(s.units || "");
      setCompetitors(s.competitors || "");
      if (s.style) setStyle(s.style);
      if (typeof s.speed === "number" && s.speed > 0) setSpeed(s.speed);
      if (s.savedId) savedIdRef.current = s.savedId;
      if (s.race && (s.phase === "review" || s.phase === "playing")) {
        setRace(s.race);
        if (s.phase === "playing") {
          void preloadRaceImages(s.race).catch(() => {});
          setReplayKey((n) => n + 1);
        }
        setPhase(s.phase);
      }
    } catch {
      /* ignore a corrupt snapshot */
    }
  }, [initialRequest, start]);

  // Persist the current view to this tab (skip the transient "building" state) so a
  // refresh restores it rather than dumping the user back to the start.
  useEffect(() => {
    try {
      if (phase === "building") return;
      const keepRace = phase === "review" || phase === "playing";
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ phase, request, range, bars, units, competitors, style, speed, savedId: savedIdRef.current, race: keepRace ? race : null })
      );
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [phase, request, range, bars, units, competitors, style, speed, race]);

  // Flip through the design gallery with ease (wraps both ways).
  const cycleStyle = useCallback((dir: 1 | -1) => {
    setStyle((cur) => {
      const i = RACE_STYLES.findIndex((s) => s.id === cur);
      const n = RACE_STYLES.length;
      return RACE_STYLES[((i < 0 ? 0 : i) + dir + n) % n].id;
    });
  }, []);

  // Live preview loop (visual only; the export adds sound). Pauses while the
  // fullscreen viewer is open so we don't animate an occluded canvas.
  useEffect(() => {
    if (phase !== "playing" || !race || viewerMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const state = newRaceState();
    // Pace the race over (durationSec / speed) wall-seconds via a progress accumulator,
    // so dragging the speed slider re-paces LIVE (reads speedRef) without restarting.
    let prog = 0;
    let last = performance.now();
    let holdAt = 0;
    let raf = 0;
    drawRaceStyle(ctx, canvas.width, canvas.height, race, state, 0, style); // frame 0 (never blank)
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
  }, [phase, race, replayKey, style, viewerMode]);

  // ── Review & edit the data sheet, then approve ───────────────────────────
  if (phase === "review" && race) {
    return <StatReview race={race} onApprove={approve} onBack={() => setPhase("menu")} />;
  }

  // ── Menu ────────────────────────────────────────────────────────────────
  if (phase !== "playing") {
    const building = phase === "building";
    return (
      <div className={`relative flex h-[100dvh] w-screen flex-col items-center overflow-y-auto overflow-x-hidden px-4 pb-10 pt-20 select-none sm:px-6 sm:pb-12 ${building ? "justify-center" : ""}`}>
        <DocumentBackground />
        <StatGate state={gate} />
        <button
          onClick={() => router.push("/home")}
          aria-label="Back"
          className="z-20 flex h-9 items-center gap-1.5 rounded-full px-3 text-[#2c2823] backdrop-blur transition hover:opacity-80"
          style={{ position: "absolute", left: 12, top: 12, background: "rgba(0,0,0,0.1)" }}
        >
          <ArrowLeft size={16} /> <span className="text-[13px] font-extrabold">Home</span>
        </button>
        {!building && (
          <button
            onClick={() => setHistoryOpen(true)}
            aria-label="History"
            className="z-20 flex h-9 items-center gap-1.5 rounded-full px-3 text-[#2c2823] backdrop-blur transition hover:opacity-80"
            style={{ position: "absolute", right: 12, top: 12, background: "rgba(0,0,0,0.1)" }}
          >
            <History size={16} /> <span className="text-[13px] font-extrabold">History</span>
          </button>
        )}

        <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
          {building ? (
            <>
              <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#2c2823]/25 border-t-[#2c2823]" />
              <p className="mt-5 text-xl font-extrabold" style={{ color: INK }}>
                {buildKind === "file" ? "Reading your file & building the stat battle…" : "Researching real data & building the story…"}
              </p>
              <p className="mt-2 text-sm font-semibold" style={{ color: "#2c2823aa" }}>
                {buildKind === "file"
                  ? "Pulling the rankings and figures out of your document — this takes a moment."
                  : "Pulling verified figures and writing the timeline — this takes a moment."}
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

                {/* quick-start helpers: a random idea, or build from a file you already have */}
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={surprise}
                    className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-extrabold text-[#2c2823] transition hover:opacity-80"
                    style={{ background: "rgba(0,0,0,0.08)" }}
                  >
                    <Shuffle size={15} /> Surprise me
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-extrabold text-[#2c2823] transition hover:opacity-80"
                    style={{ background: "rgba(0,0,0,0.08)" }}
                  >
                    <Upload size={15} /> Upload a file
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.csv,.tsv,.txt,.md,.json,application/pdf,text/csv,text/plain,text/markdown,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onFile(f);
                      e.target.value = ""; // allow re-uploading the same file
                    }}
                  />
                </div>
                <p className="mt-1.5 text-center text-[11px] leading-relaxed text-[#2c2823]/50">
                  Already have the data? Upload a <span className="font-bold">PDF, CSV, TXT or MD</span> file (up to 3 MB) to build from it.
                </p>

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
              <div className="flex w-full flex-wrap justify-center gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setRequest(p.request);
                      taRef.current?.focus();
                    }}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold text-[#2c2823] transition hover:opacity-80"
                    style={{ background: "rgba(0,0,0,0.1)" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {errMsg && <p className="mt-5 text-sm font-bold" style={{ color: SEAL }}>{errMsg}</p>}
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
    <div className="relative h-[100dvh] w-screen overflow-y-auto select-none" style={{ background: "#bdbab2" }}>
      <button
        onClick={() => setPhase("menu")}
        aria-label="New stat battle"
        className="z-20 flex h-11 items-center gap-1.5 rounded-full px-4 text-[#2c2823] backdrop-blur transition hover:opacity-80"
        style={{ position: "absolute", left: 16, top: 16, background: "rgba(0,0,0,0.14)" }}
      >
        <ArrowLeft size={18} /> <span className="text-sm font-extrabold">New</span>
      </button>

      {/* Top-left layout: the card + its design choices live in the top-left so
          there's room to grow the design gallery. */}
      <div className="flex w-full flex-col items-start gap-3 px-4 pb-10 pt-16 sm:px-6 sm:pt-20">
        {/* design chooser — the SAME data, different modern styles */}
        {race && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#2c2823]/55">Choose a design — same data, different look</p>
            <div className="flex flex-wrap items-start gap-2.5">
              {RACE_STYLES.map((s) => (
                <StyleThumb key={s.id} race={race} styleId={s.id} label={s.label} selected={style === s.id} onClick={() => setStyle(s.id)} />
              ))}
            </div>
          </div>
        )}

        {/* main card in the chosen design — tap to view bigger; arrows flip designs */}
        <div className="relative w-full max-w-3xl">
          <button type="button" onClick={() => setChooserOpen(true)} aria-label="View fullscreen" className="block w-full">
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="w-full rounded-2xl shadow-2xl"
              style={{ maxHeight: "54dvh", objectFit: "contain", background: "#c8c5bd" }}
            />
            <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
              <Maximize2 size={13} /> Fullscreen
            </span>
          </button>
          <button
            type="button"
            onClick={() => cycleStyle(-1)}
            aria-label="Previous design"
            className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={() => cycleStyle(1)}
            aria-label="Next design"
            className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Speed — total control: from very slow (up to an hour to play) to fast.
            The slider is a LENGTH (battle-independent), stored as a speed multiplier. */}
        {race &&
          (() => {
            const play = Math.min(LEN_MAX, Math.max(LEN_MIN, Math.round(race.durationSec / speed)));
            return (
              <div className="flex w-full max-w-3xl items-center gap-3 rounded-full bg-black/10 px-4 py-2.5 backdrop-blur">
                <Gauge size={17} className="shrink-0 text-[#2c2823]" />
                <span className="shrink-0 text-xs font-extrabold text-[#2c2823]">Speed</span>
                <span className="hidden shrink-0 text-[10px] font-bold text-[#2c2823]/45 sm:inline">Faster</span>
                <input
                  type="range"
                  min={LEN_MIN}
                  max={LEN_MAX}
                  step={5}
                  value={play}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v > 0) setSpeed(race.durationSec / v);
                  }}
                  aria-label="Playback length"
                  style={{ accentColor: sliderColor((play - LEN_MIN) / (LEN_MAX - LEN_MIN)) }}
                  className="h-1.5 flex-1 cursor-pointer"
                />
                <span className="hidden shrink-0 text-[10px] font-bold text-[#2c2823]/45 sm:inline">Slower</span>
                <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-[#2c2823]/65">{fmtDur(play)}</span>
              </div>
            );
          })()}

        <div className="flex flex-wrap items-center gap-3">
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
        <p className="text-xs font-semibold text-[#2c2823]/55">Pick a design above, then watch it here or export a video (optional) for your projects &amp; socials.</p>
      </div>

      {/* "View fullscreen" prompt — landscape (rotate) or phone-size portrait */}
      {chooserOpen && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setChooserOpen(false)}
        >
          <div className="w-full max-w-xs rounded-2xl bg-[#f3f1ea] p-5 text-[#2c2823] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-base font-extrabold">View fullscreen</p>
            <p className="mt-1 text-center text-xs font-semibold text-[#2c2823]/60">Bigger is better — pick how you want to watch.</p>
            <div className="mt-4 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  void requestLandscape(); // inside the user gesture so fullscreen is permitted
                  setViewerMode("landscape");
                  setChooserOpen(false);
                }}
                className="flex items-center gap-3 rounded-xl bg-[#2c2823] px-4 py-3 text-left text-[#f6f4ee] transition hover:opacity-90"
              >
                <Monitor size={20} className="shrink-0" />
                <span>
                  <span className="block font-extrabold">Landscape</span>
                  <span className="block text-[11px] font-semibold opacity-70">Rotate your phone — fills the screen</span>
                </span>
              </button>
              <button
                onClick={() => {
                  setViewerMode("portrait");
                  setChooserOpen(false);
                }}
                className="flex items-center gap-3 rounded-xl bg-black/10 px-4 py-3 text-left transition hover:bg-black/15"
              >
                <Smartphone size={20} className="shrink-0" />
                <span>
                  <span className="block font-extrabold">Phone view</span>
                  <span className="block text-[11px] font-semibold opacity-60">Stay upright — fits your screen</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerMode && race && (
        <StatViewer
          race={race}
          style={style}
          speed={speed}
          onSpeed={setSpeed}
          initialMode={viewerMode}
          onPrev={() => cycleStyle(-1)}
          onNext={() => cycleStyle(1)}
          onClose={() => setViewerMode(null)}
        />
      )}

      {race && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          fileName="clunoid-stat-battle"
          heading="Share your stat battle"
          idleHint="Export this stat battle as a video — for your projects & socials."
          caption={`${race.title} — a stat battle from clunoid.com 📊`}
          captionContext={{ title: race.title, subtitle: race.subtitle, source: race.source, kind: "stat battle bar-chart race" }}
          videoDuration={{ vertical: 120, wide: 300 }}
          render={(aspect: ReelAspect, opts) =>
            renderRaceVideo({ ...race, durationSec: opts.durationSec ?? race.durationSec }, aspect, { ...opts, style })
          }
        />
      )}
    </div>
  );
}
