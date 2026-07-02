"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clapperboard, History, Loader2, Sparkles, Trash2, Wand2, Crown } from "lucide-react";
import { ProfileMenu } from "@/components/auth/ProfileMenu";
import { HostVoicePicker } from "@/components/games/HostVoicePicker";
import { ShareModal } from "@/components/share/ShareModal";
import { preflightGraphics, planGraphics } from "@/lib/graphics/generate";
import { renderMotionVideo } from "@/lib/graphics/render";
import { saveGraphicsVideo, listGraphicsVideos, deleteGraphicsVideo, type SavedGraphics, type GraphicsSnapshot } from "@/lib/graphics/storage";
import { deleteGameVideo } from "@/lib/games/videoStore";
import { getVideoVoicePref, setVideoVoicePref } from "@/lib/voice/preference";
import { useBilling } from "@/lib/billing/store";
import type { MotionSpec } from "@/lib/graphics/spec";
import type { ReelAspect } from "@/lib/share/reel";

const SUGGESTIONS = [
  "Explain how AI works",
  "How does Bitcoin mining work?",
  "Explain black holes",
  "Create a startup pitch for a food delivery app",
  "History of Ancient Rome",
  "Explain quantum mechanics simply",
  "Market a cozy neighborhood restaurant",
  "Create a motivational business video",
  "Product launch video for a fitness app",
  "How the internet works",
];

/**
 * MOTION GRAPHICS STUDIO — prompt → a professionally animated explainer video
 * (kinetic type, icons, UI mockups, charts, narration, captions, music). Pro/Max
 * feature (or unlocked by buying credits); every generation is credit-billed.
 */
export function GraphicsStudio({ initialRequest }: { initialRequest?: string }) {
  const [request, setRequest] = useState(initialRequest || "");
  const [planning, setPlanning] = useState(false);
  const [err, setErr] = useState("");
  const [snap, setSnap] = useState<GraphicsSnapshot | null>(null);
  const [videoId, setVideoId] = useState<string | undefined>(undefined);
  const [shareOpen, setShareOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [hist, setHist] = useState<SavedGraphics[] | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const plan = useBilling((s) => s.plan);
  const purchased = useBilling((s) => s.purchased);
  const loaded = useBilling((s) => s.loaded);
  const openUpgrade = useBilling((s) => s.openUpgrade);
  const isSubscriber = plan === "pro" || plan === "max";
  const locked = loaded && !isSubscriber && (purchased || 0) <= 0;

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [request]);

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
    const pre = await preflightGraphics(req);
    if (!pre.ok) {
      setPlanning(false);
      if (pre.reason === "plan") openUpgrade("Motion graphics videos use our most powerful AI. Subscribe to Pro or Max — or add credits — to start creating.");
      else if (pre.reason === "credits") openUpgrade("You don't have enough credits for a motion graphics video. Add credits or subscribe to keep creating.");
      else if (pre.reason === "auth") setErr("Please sign in to generate a video.");
      return;
    }
    const res = await planGraphics(req);
    setPlanning(false);
    if (!res.ok) {
      if (res.reason === "plan") openUpgrade("Motion graphics videos use our most powerful AI. Subscribe to Pro or Max — or add credits — to start creating.");
      else if (res.reason === "credits") openUpgrade("You don't have enough credits for a motion graphics video. Add credits or subscribe to keep creating.");
      else if (res.reason === "auth") setErr("Please sign in to generate a video.");
      else setErr("Couldn't design that one — try rephrasing your idea.");
      return;
    }
    const s: GraphicsSnapshot = { prompt: req, voice: getVideoVoicePref(), spec: res.spec };
    const id = await saveGraphicsVideo(s); // history, like games + stat battles
    setSnap(s);
    setVideoId(id ?? undefined);
    setShareOpen(true);
  }, [request, planning, openUpgrade]);

  const openSaved = useCallback((g: SavedGraphics) => {
    // Re-render with the voice the video was ORIGINALLY made with (not whatever the
    // global preference has since become) — history should reproduce the same video.
    if (g.data.voice) setVideoVoicePref(g.data.voice);
    setSnap(g.data);
    setVideoId(g.id);
    setHistOpen(false);
    setShareOpen(true);
  }, []);

  const spec: MotionSpec | null = snap?.spec ?? null;

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-gradient-to-b from-[#131022] via-[#100e1a] to-[#0c0b13] text-white">
      {/* header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-[#120f1d]/80 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/home" className="flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white">
          <ArrowLeft size={18} /> <span className="hidden sm:inline">Back</span>
        </Link>
        <span className="text-[15px] font-extrabold tracking-tight">clunoid</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setHistOpen(true);
              void loadHistory();
            }}
            aria-label="Your videos"
            className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <History size={18} />
          </button>
          <ProfileMenu />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[#a78bfa]">
            <Clapperboard size={22} />
            <span className="text-xs font-extrabold uppercase tracking-widest text-white/60">Motion Graphics</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#a78bfa]/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#c4b5fd]">
              <Crown size={10} /> Pro
            </span>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Create a motion graphics video</h1>
          <p className="text-[15px] text-white/60">
            Describe anything — Clunoid designs the story, animates the scenes, narrates it, and adds captions. A polished explainer, ready to post.
          </p>
        </div>

        {locked && (
          <div className="flex flex-col gap-2 rounded-2xl border border-[#a78bfa]/30 bg-[#a78bfa]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] font-bold text-[#e2dbff]">This studio runs on our most powerful AI. Subscribe to Pro or Max — or add credits — to unlock it.</p>
            <button type="button" onClick={() => openUpgrade("Motion graphics videos use our most powerful AI. Subscribe to Pro or Max — or add credits — to start creating.")} className="shrink-0 rounded-full bg-[#a78bfa] px-4 py-1.5 text-[12px] font-extrabold text-black transition hover:brightness-110">
              Unlock
            </button>
          </div>
        )}

        {/* prompt */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-white/50">Your idea</label>
          <textarea
            ref={taRef}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
            }}
            rows={2}
            maxLength={600}
            placeholder="e.g. Explain how AI works · Create a product launch video · History of Ancient Rome"
            className="w-full resize-none rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[16px] font-semibold text-white placeholder:text-white/35 outline-none transition focus:border-[#a78bfa]/60 focus:bg-white/10"
          />
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setRequest(s)} className="rounded-full bg-white/[0.07] px-3 py-1.5 text-[13px] font-bold text-white/75 transition hover:bg-white/15 hover:text-white">
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* voice */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-white/50">Narration voice</label>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            <HostVoicePicker mode="video" />
          </div>
          <p className="px-1 text-[12px] text-white/40">Narration is billed per line from your credits. Pick “Silent” for captions + music only.</p>
        </div>

        {err && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-[13px] font-bold text-red-200">{err}</p>}
      </main>

      {/* sticky generate bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#120f1d]/90 px-4 py-3 backdrop-blur sm:px-6" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="hidden flex-1 text-[13px] text-white/45 sm:block">You’ll pick vertical / wide / both on the next screen.</p>
          <button
            type="button"
            onClick={generate}
            disabled={!request.trim() || planning}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#a78bfa] px-6 py-3.5 text-[16px] font-extrabold text-black transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {planning ? <Loader2 size={20} className="animate-spin" /> : <Wand2 size={20} />}
            {planning ? "Designing…" : "Generate video"}
          </button>
        </div>
      </div>

      {/* history overlay */}
      {histOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#0c0b13]/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
            <h2 className="text-xl font-extrabold">Your videos</h2>
            <button type="button" onClick={() => setHistOpen(false)} className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-white/80 transition hover:bg-white/20">
              Close
            </button>
          </div>
          <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-10 sm:px-6">
            {hist === null ? (
              <div className="grid place-items-center py-16"><Loader2 size={26} className="animate-spin text-white/50" /></div>
            ) : hist.length === 0 ? (
              <p className="py-16 text-center text-white/45">No videos yet — generate your first one.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {hist.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3">
                    <Sparkles size={18} className="shrink-0 text-[#a78bfa]" />
                    <button type="button" onClick={() => openSaved(g)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[15px] font-extrabold">{g.title}</p>
                      <p className="truncate text-[12px] text-white/45">{g.data.prompt}</p>
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
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-red-300"
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
