"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Clapperboard, Film, History, Loader2, Smartphone, Monitor, Sparkles, Trash2, Wand2, Crown, Shuffle } from "lucide-react";
import { DocumentBackground } from "@/components/games/DocumentBackground";
import { HostVoicePicker } from "@/components/games/HostVoicePicker";
import { ShareModal } from "@/components/share/ShareModal";
import { preflightGraphics, planGraphics, suggestGraphicsIdeas } from "@/lib/graphics/generate";
import { renderMotionVideo } from "@/lib/graphics/render";
import { saveGraphicsVideo, listGraphicsVideos, deleteGraphicsVideo, type SavedGraphics, type GraphicsSnapshot } from "@/lib/graphics/storage";
import { deleteGameVideo } from "@/lib/games/videoStore";
import { getVideoVoicePref, setVideoVoicePref } from "@/lib/voice/preference";
import { useBilling } from "@/lib/billing/store";
import { graphicsPlanCost } from "@/lib/billing/costs";
import type { MotionSpec } from "@/lib/graphics/spec";
import type { ReelAspect } from "@/lib/share/reel";

/** Video length choices — Auto is the classic ~1-minute short; the rest run the
 *  long-form pipeline (research → script outline → chapter writing). */
const LENGTHS: { sec: number; label: string; hint: string }[] = [
  { sec: 0, label: "Auto", hint: "~1 min" },
  { sec: 120, label: "2 min", hint: "" },
  { sec: 180, label: "3 min", hint: "" },
  { sec: 300, label: "5 min", hint: "" },
  { sec: 480, label: "8 min", hint: "" },
  { sec: 720, label: "12 min", hint: "" },
  { sec: 900, label: "15 min", hint: "" },
];

const INK = "#2c2823"; // primary text — matches the document theme (Stat Battle)
const ACCENT = "#6d28d9"; // deep violet — the motion-graphics accent on warm paper

// Remotion-powered live preview (client-only; heavy — load on demand)
const MotionPreview = dynamic(() => import("./MotionPreview").then((m) => m.MotionPreview), {
  ssr: false,
  loading: () => (
    <div className="grid aspect-video w-full place-items-center rounded-xl bg-black/80">
      <Loader2 size={26} className="animate-spin text-white/60" />
    </div>
  ),
});

// Seed ideas — used ONLY as an offline fallback if the AI suggestion call fails.
// The live experience pulls fresh, randomized ideas from the model on every click.
const SEED_IDEAS = [
  "Explain how AI works",
  "How does Bitcoin mining work?",
  "Explain black holes simply",
  "Create a startup pitch for a food delivery app",
  "History of Ancient Rome",
  "Explain quantum mechanics simply",
  "Market a cozy neighborhood restaurant",
  "Create a motivational business video",
  "Product launch video for a fitness app",
  "How the internet actually works",
];

const UPGRADE_MSG = "Motion graphics videos use our most powerful AI. Subscribe to Pro or Max — or add credits — to start creating.";

/**
 * MOTION GRAPHICS STUDIO — prompt → a professionally animated explainer video
 * (kinetic type, icons, UI mockups, charts, narration, captions, music). Pro/Max
 * feature (or unlocked by buying credits); every generation is credit-billed.
 *
 * Design: the clean "document" look shared with Stat Battle (warm security-printed
 * paper), re-themed for motion graphics — one centered column that fits every
 * screen, with an AI "Suggest an idea" button in place of a static chip list.
 */
export function GraphicsStudio({ initialRequest }: { initialRequest?: string }) {
  const router = useRouter();
  const [request, setRequest] = useState(initialRequest || "");
  const [durationSec, setDurationSec] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planStage, setPlanStage] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [err, setErr] = useState("");
  const [snap, setSnap] = useState<GraphicsSnapshot | null>(null);
  const [videoId, setVideoId] = useState<string | undefined>(undefined);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAspect, setPreviewAspect] = useState<ReelAspect>("9:16");
  const [histOpen, setHistOpen] = useState(false);
  const [hist, setHist] = useState<SavedGraphics[] | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // A queue of AI ideas so each "Suggest" click is instant; we refill in the
  // background as it drains. Refs (not state) — churning these shouldn't re-render.
  const ideaQueue = useRef<string[]>([]);
  const fetchingIdeas = useRef(false);
  // the staged "Researching… / Writing the script…" ticker — must die with the component
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (stageTimer.current) clearInterval(stageTimer.current);
  }, []);
  const plan = useBilling((s) => s.plan);
  const purchased = useBilling((s) => s.purchased);
  const loaded = useBilling((s) => s.loaded);
  const openUpgrade = useBilling((s) => s.openUpgrade);
  const isSubscriber = plan === "pro" || plan === "max";
  const locked = loaded && !isSubscriber && (purchased || 0) <= 0;

  // The prompt box grows with its content.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [request]);

  // Warm the idea queue on mount so the very first "Suggest" click is AI-fresh.
  const refillIdeas = useCallback(async () => {
    if (fetchingIdeas.current || ideaQueue.current.length >= 5) return;
    fetchingIdeas.current = true;
    try {
      const ideas = await suggestGraphicsIdeas();
      // de-dupe against what's already queued
      for (const i of ideas) if (!ideaQueue.current.includes(i)) ideaQueue.current.push(i);
    } finally {
      fetchingIdeas.current = false;
    }
  }, []);

  useEffect(() => {
    void refillIdeas();
  }, [refillIdeas]);

  // "Suggest an idea" — drop a fresh, AI-generated idea into the box. Users can
  // keep clicking for new directions until one clicks. Falls back to a seed idea
  // only if the model is unreachable, so the button always does something.
  const suggest = useCallback(async () => {
    setErr("");
    const pickDifferent = (pool: string[]) => {
      const cur = request.trim();
      const fresh = pool.filter((i) => i && i !== cur);
      return (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    };

    if (ideaQueue.current.length === 0) {
      setSuggesting(true);
      await refillIdeas();
      setSuggesting(false);
    }

    let idea: string | undefined;
    if (ideaQueue.current.length) {
      // pull the next non-duplicate idea off the queue
      let next = ideaQueue.current.shift();
      if (next && next === request.trim() && ideaQueue.current.length) next = ideaQueue.current.shift();
      idea = next;
    }
    if (!idea) idea = pickDifferent(SEED_IDEAS); // offline fallback

    setRequest(idea);
    taRef.current?.focus();
    if (ideaQueue.current.length < 2) void refillIdeas(); // top up in the background
  }, [request, refillIdeas]);

  const loadHistory = useCallback(async () => {
    setHist(null);
    setHist(await listGraphicsVideos());
  }, []);

  const generate = useCallback(async () => {
    const req = request.trim();
    if (!req || planning) return;
    setErr("");
    setPlanning(true);
    // VERIFY before Opus — auth + plan access + credits (no charge).
    const pre = await preflightGraphics(req, durationSec);
    if (!pre.ok) {
      setPlanning(false);
      if (pre.reason === "plan") openUpgrade(UPGRADE_MSG);
      else if (pre.reason === "credits") openUpgrade("You don't have enough credits for this video length. Add credits or subscribe to keep creating.");
      else if (pre.reason === "auth") setErr("Please sign in to generate a video.");
      return;
    }
    // long-form runs research → script → chapters; narrate the wait honestly
    const stages = durationSec > 150
      ? ["Researching your topic…", "Writing the script…", "Designing chapters…", "Designing scenes…", "Casting visuals…"]
      : ["Researching your topic…", "Designing your video…"];
    let si = 0;
    setPlanStage(stages[0]);
    if (stageTimer.current) clearInterval(stageTimer.current);
    stageTimer.current = setInterval(() => {
      si = Math.min(si + 1, stages.length - 1);
      setPlanStage(stages[si]);
    }, durationSec > 150 ? 40_000 : 18_000);
    let res: Awaited<ReturnType<typeof planGraphics>>;
    try {
      res = await planGraphics(req, durationSec);
    } finally {
      if (stageTimer.current) clearInterval(stageTimer.current);
      stageTimer.current = null;
      setPlanning(false);
      setPlanStage("");
    }
    if (!res.ok) {
      if (res.reason === "plan") openUpgrade(UPGRADE_MSG);
      else if (res.reason === "credits") openUpgrade("You don't have enough credits for this video length. Add credits or subscribe to keep creating.");
      else if (res.reason === "auth") setErr("Please sign in to generate a video.");
      else setErr("Couldn't design that one — try rephrasing your idea.");
      return;
    }
    const s: GraphicsSnapshot = { prompt: req, voice: getVideoVoicePref(), spec: res.spec, durationSec };
    const id = await saveGraphicsVideo(s); // history, like games + stat battles
    setSnap(s);
    setVideoId(id ?? undefined);
    setPreviewOpen(true); // WATCH the design first — the render is a click away
  }, [request, planning, durationSec, openUpgrade]);

  const openSaved = useCallback((g: SavedGraphics) => {
    // Re-render with the voice the video was ORIGINALLY made with (not whatever the
    // global preference has since become) — history should reproduce the same video.
    if (g.data.voice) setVideoVoicePref(g.data.voice);
    setSnap(g.data);
    setVideoId(g.id);
    setHistOpen(false);
    setPreviewOpen(true);
  }, []);

  const spec: MotionSpec | null = snap?.spec ?? null;

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col items-center overflow-y-auto overflow-x-hidden px-4 pb-12 pt-16 text-center select-none sm:px-6" style={{ background: "#c8c5bd" }}>
      {/* Pinned to the viewport so the paper weave covers the whole screen no matter
          how far the column scrolls (the content can exceed 100dvh on small screens). */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <DocumentBackground />
      </div>

      {/* Home + History — matching Stat Battle's corner pills */}
      <button
        onClick={() => router.push("/home")}
        aria-label="Home"
        className="z-20 flex h-9 items-center gap-1.5 rounded-full px-3 text-[#2c2823] backdrop-blur transition hover:opacity-80"
        style={{ position: "absolute", left: 12, top: 12, background: "rgba(0,0,0,0.1)" }}
      >
        <ArrowLeft size={16} /> <span className="text-[13px] font-extrabold">Home</span>
      </button>
      <button
        onClick={() => {
          setHistOpen(true);
          void loadHistory();
        }}
        aria-label="Your videos"
        className="z-20 flex h-9 items-center gap-1.5 rounded-full px-3 text-[#2c2823] backdrop-blur transition hover:opacity-80"
        style={{ position: "absolute", right: 12, top: 12, background: "rgba(0,0,0,0.1)" }}
      >
        <History size={16} /> <span className="text-[13px] font-extrabold">Videos</span>
      </button>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        <Clapperboard size={40} style={{ color: ACCENT }} />
        <h1 className="mt-2 text-4xl font-extrabold leading-none tracking-tight sm:text-5xl" style={{ color: INK }}>
          Motion <span style={{ color: ACCENT }}>Graphics</span>
        </h1>
        <div className="mt-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide" style={{ background: "rgba(109,40,217,0.14)", color: "#5b21b6" }}>
          <Crown size={11} /> Pro &amp; Max · or credits
        </div>
        <p className="mt-2.5 max-w-md text-base font-bold" style={{ color: "#2c2823cc" }}>
          Describe anything — Clunoid writes the story, animates the scenes, narrates it, and adds captions.
        </p>

        {locked && (
          <div className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl px-4 py-3" style={{ background: "rgba(109,40,217,0.10)", border: "1px solid rgba(109,40,217,0.28)" }}>
            <p className="text-[13px] font-bold" style={{ color: "#4c1d95" }}>This studio runs on our most powerful AI. Subscribe to Pro or Max — or add credits — to unlock it.</p>
            <button type="button" onClick={() => openUpgrade(UPGRADE_MSG)} className="rounded-full px-4 py-1.5 text-[12px] font-extrabold text-white transition hover:brightness-110" style={{ background: ACCENT }}>
              Unlock
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
          className="mt-5 w-full"
        >
          {/* main, extending prompt box */}
          <div className="flex w-full items-start gap-2 rounded-2xl px-4 py-3 backdrop-blur" style={{ background: "rgba(0,0,0,0.1)" }}>
            <Clapperboard size={18} className="mt-1 shrink-0 text-[#2c2823]/60" />
            <textarea
              ref={taRef}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void generate();
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder="Describe your video — e.g. Explain how AI works · Create a product launch video · History of Ancient Rome. Long videos can take a full brief: facts to include, chapters you want, tone."
              className="w-full resize-none bg-transparent text-[15px] font-bold leading-snug text-[#2c2823] outline-none placeholder:font-medium placeholder:text-[#2c2823]/50"
            />
          </div>

          {/* AI idea helper — click for a fresh idea, keep clicking until one clicks */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void suggest()}
              disabled={suggesting}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-extrabold text-[#2c2823] transition hover:opacity-80 disabled:opacity-50"
              style={{ background: "rgba(0,0,0,0.08)" }}
            >
              {suggesting ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />} Suggest an idea
            </button>
            {request.trim() && (
              <button
                type="button"
                onClick={() => {
                  setRequest("");
                  taRef.current?.focus();
                }}
                className="rounded-full px-3.5 py-2 text-[13px] font-extrabold text-[#2c2823]/70 transition hover:opacity-80"
                style={{ background: "rgba(0,0,0,0.05)" }}
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#2c2823]/50">
            Fresh AI ideas every click — across science, tech, history, business &amp; more.
          </p>

          {/* video length — Auto is a ~1-min short; longer lengths run the full
              research → script → chapters production pipeline */}
          <div className="mt-4 w-full text-left">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#2c2823]/50">Video length</p>
            <div className="flex flex-wrap gap-1.5">
              {LENGTHS.map((l) => {
                const sel = durationSec === l.sec;
                return (
                  <button
                    key={l.sec}
                    type="button"
                    onClick={() => setDurationSec(l.sec)}
                    aria-pressed={sel}
                    className="rounded-full px-3 py-1.5 text-[12px] font-extrabold transition hover:opacity-85"
                    style={sel ? { background: ACCENT, color: "#fff" } : { background: "rgba(0,0,0,0.08)", color: INK }}
                  >
                    {l.label}
                    {l.hint ? <span className="font-bold opacity-70"> · {l.hint}</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#2c2823]/50">
              {durationSec > 150 ? (
                <>
                  ≈ {graphicsPlanCost(durationSec).toLocaleString()} credits + ~{(Math.round(durationSec / 10.5) * 2).toLocaleString()} narration per render (each
                  aspect renders separately). Long videos research the topic, write a chaptered script, and mix in real footage — designing takes a few minutes
                  {durationSec > 480 ? ", and creating the file works best in Chrome or Edge on a computer" : ""}.
                </>
              ) : (
                <>≈ {graphicsPlanCost(durationSec).toLocaleString()} credits + narration billed per line (each aspect renders separately).</>
              )}
            </p>
          </div>

          {/* narration voice — a dark "console" so the shared picker reads on paper */}
          <div className="mt-4 w-full text-left">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#2c2823]/50">Narration voice</p>
            <div className="rounded-2xl p-2" style={{ background: "#26211c" }}>
              <HostVoicePicker mode="video" />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#2c2823]/50">
              Narration is billed per line from your credits. Pick “Silent” for captions + music only.
            </p>
          </div>

          <button
            type="submit"
            disabled={!request.trim() || planning}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[16px] font-extrabold text-white shadow-xl transition enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: "linear-gradient(120deg, #7c3aed 0%, #9333ea 50%, #db2777 100%)" }}
          >
            {planning ? <Loader2 size={20} className="animate-spin" /> : <Wand2 size={20} />}
            {planning ? planStage || "Designing your video…" : "Generate video"}
          </button>
        </form>

        {err && <p className="mt-4 text-sm font-bold" style={{ color: "#8a2433" }}>{err}</p>}
        <p className="mt-4 max-w-sm text-[11px] leading-relaxed text-[#2c2823]/50">
          You’ll choose vertical, wide, or both on the next screen. Every video is saved to your history.
        </p>
      </div>

      {/* history overlay — paper-themed */}
      {histOpen && (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ background: "rgba(200,197,189,0.97)", backdropFilter: "blur(6px)" }}>
          <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-4 sm:px-6">
            <h2 className="text-xl font-extrabold" style={{ color: INK }}>Your videos</h2>
            <button type="button" onClick={() => setHistOpen(false)} className="rounded-full px-4 py-1.5 text-sm font-extrabold text-[#2c2823] transition hover:opacity-80" style={{ background: "rgba(0,0,0,0.1)" }}>
              Close
            </button>
          </div>
          <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pb-10 sm:px-6">
            {hist === null ? (
              <div className="grid place-items-center py-16"><Loader2 size={26} className="animate-spin text-[#2c2823]/50" /></div>
            ) : hist.length === 0 ? (
              <p className="py-16 text-center font-semibold text-[#2c2823]/50">No videos yet — generate your first one.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {hist.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(0,0,0,0.06)" }}>
                    <Sparkles size={18} className="shrink-0" style={{ color: ACCENT }} />
                    <button type="button" onClick={() => openSaved(g)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[15px] font-extrabold" style={{ color: INK }}>{g.title}</p>
                      <p className="truncate text-[12px] text-[#2c2823]/50">{g.data.prompt}</p>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={async () => {
                        if (await deleteGraphicsVideo(g.id)) {
                          void deleteGameVideo(`gfx-${g.id}`); // drop the cached rendered file too
                          setHist((h) => (h ? h.filter((x) => x.id !== g.id) : h));
                        }
                      }}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#2c2823]/45 transition hover:bg-black/10 hover:text-[#8a2433]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* live preview — watch the whole design (Remotion Player + the real engine)
          before spending anything on narration + the render */}
      {previewOpen && spec && (
        <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto" style={{ background: "rgba(15,13,20,0.97)", backdropFilter: "blur(6px)" }}>
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-extrabold text-white">{spec.title}</h2>
              <p className="text-[12px] text-white/50">Preview — pacing is estimated; the real render follows the narration, and footage plays live.</p>
            </div>
            <button type="button" onClick={() => setPreviewOpen(false)} className="ml-3 shrink-0 rounded-full bg-white/10 px-4 py-1.5 text-sm font-extrabold text-white/85 transition hover:bg-white/20">
              Close
            </button>
          </div>
          <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 sm:px-6">
            <div className="mb-3 flex items-center gap-2">
              {(
                [
                  { a: "9:16" as ReelAspect, label: "Vertical", Icon: Smartphone },
                  { a: "16:9" as ReelAspect, label: "Wide", Icon: Monitor },
                ]
              ).map(({ a, label, Icon }) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setPreviewAspect(a)}
                  aria-pressed={previewAspect === a}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-extrabold transition"
                  style={previewAspect === a ? { background: "#a78bfa", color: "#17111f" } : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div className={previewAspect === "9:16" ? "mx-auto max-w-[340px]" : "w-full"}>
              <MotionPreview key={previewAspect + (videoId || "")} spec={spec} aspect={previewAspect} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  setShareOpen(true);
                }}
                className="flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-extrabold text-white shadow-xl transition hover:scale-[1.02]"
                style={{ background: "linear-gradient(120deg, #7c3aed 0%, #9333ea 50%, #db2777 100%)" }}
              >
                <Film size={18} /> Create video file
              </button>
              <p className="text-[12px] text-white/45">Narration is billed per line when the file is created.</p>
            </div>
          </div>
        </div>
      )}

      {spec && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          render={(a: ReelAspect, o) => renderMotionVideo(spec, a, o)}
          renderVoiceFromPref
          gameId={videoId ? `gfx-${videoId}` : undefined}
          fileName={`clunoid-${(spec.title || "motion").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "motion"}`}
          heading="Your motion graphics video"
          idleHint="Your video is designed and ready to create."
          caption={`${spec.title} 🎬 Made on clunoid.com`}
          captionContext={{ title: spec.title, kind: "animated motion graphics explainer video" }}
        />
      )}
    </div>
  );
}
