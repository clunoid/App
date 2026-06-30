"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Download, Share2, X, Film, Loader2, Smartphone, Monitor, Layers, Instagram, Youtube, Facebook, Sparkles, Copy, Check, AlertTriangle, CheckCircle2, Mic, ChevronDown, Gauge } from "lucide-react";
import { canRecordVideo, LEN_MIN, LEN_MAX, sliderColor, type ReelAspect, type ReelSpec } from "@/lib/share/reel";
import { renderReel } from "@/lib/share/renderer";
import { useBilling } from "@/lib/billing/store";
import { HostVoicePicker } from "@/components/games/HostVoicePicker";
import { RaysBackground } from "@/components/games/RaysBackground";
import { getVideoVoicePref, voiceById, isPremiumVideoVoice } from "@/lib/voice/preference";
import { loadGameVideo, saveGameVideo } from "@/lib/games/videoStore";
import { TikTokIcon, XIcon, WhatsAppIcon } from "./SocialIcons";

// Shared game look (matches the flag game's title treatment + signature rays).
const TITLE_SHADOW = "0 3px 0 rgba(0,0,0,0.22), 0 7px 16px rgba(0,0,0,0.38)";
const YELLOW = "#FFD400";

type Status = "idle" | "rendering" | "ready" | "unsupported" | "error";
// What the user picks: a single size, or both at once.
type AspectChoice = ReelAspect | "both";
// One finished video.
type RenderItem = { aspect: ReelAspect; url: string; blob: Blob; ext: string; mime: string; hadVoice: boolean };

const ASPECT_LABEL: Record<ReelAspect, string> = { "9:16": "Vertical", "16:9": "Wide" };

const DEFAULT_CAPTION = "I played Guess the Country on clunoid.com 🌍 Can you beat me?";
const SHARE_URL = "https://clunoid.com";
// Each opens the app via its universal/https link (the OS routes to the installed
// app, else the web). text-capable ones (X, WhatsApp) get a prefilled caption.
function buildPlatforms(caption: string): { key: string; label: string; color: string; href: string; Icon: ComponentType<{ size?: number; className?: string }> }[] {
  return [
    { key: "instagram", label: "Instagram", color: "#E1306C", href: "https://www.instagram.com/", Icon: Instagram },
    { key: "tiktok", label: "TikTok", color: "#010101", href: "https://www.tiktok.com/upload", Icon: TikTokIcon },
    { key: "youtube", label: "YouTube", color: "#FF0000", href: "https://www.youtube.com/upload", Icon: Youtube },
    { key: "x", label: "X", color: "#000000", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(SHARE_URL)}`, Icon: XIcon },
    { key: "whatsapp", label: "WhatsApp", color: "#25D366", href: `https://wa.me/?text=${encodeURIComponent(caption + " " + SHARE_URL)}`, Icon: WhatsAppIcon },
    { key: "facebook", label: "Facebook", color: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`, Icon: Facebook },
  ];
}

/**
 * Generic, reusable "share your game as a video" modal. Any game passes a
 * makeSpec(aspect) that returns a ReelSpec; this component handles the rest
 * (render → preview → download / Web Share). No game-specific code here.
 *
 * Users can render one size, or BOTH (9:16 + 16:9) in a single action — handy
 * for posting to both feed and stories without doing it twice.
 */
export function ShareModal({
  open,
  onClose,
  makeSpec,
  render,
  fileName = "clunoid",
  heading = "Share your game",
  idleHint,
  caption = DEFAULT_CAPTION,
  captionContext,
  gameId,
  videoDuration,
}: {
  open: boolean;
  onClose: () => void;
  makeSpec?: (aspect: ReelAspect, opts: { branded: boolean }) => ReelSpec;
  // Optional custom renderer (e.g. the Stat Battle race). Defaults to renderReel(makeSpec).
  render?: (aspect: ReelAspect, opts: { host: HTMLElement | null; signal: AbortSignal; onProgress: (p: number, l: string) => void; branded: boolean; durationSec?: number }) => Promise<{ blob: Blob; ext: string; mime: string; hadVoice: boolean }>;
  fileName?: string;
  heading?: string; // modal title (e.g. "Share your stat battle")
  idleHint?: string; // the idle preview hint (defaults to the game wording)
  caption?: string; // prefilled social caption
  captionContext?: { title: string; subtitle?: string; source?: string; kind?: string }; // enables the AI caption generator
  gameId?: string; // when set, a PREMIUM video is cached under this id + reloaded here (skip re-render)
  videoDuration?: { vertical: number; wide: number }; // STAT BATTLE: enables the per-size video LENGTH controls (default seconds for each)
}) {
  const platforms = buildPlatforms(caption);
  const [cap, setCap] = useState<{ title: string; caption: string; hashtags: string[] } | null>(null);
  const [capLoading, setCapLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aspect, setAspect] = useState<AspectChoice>("9:16");
  // Pro/Max can export an unbranded video (no watermark, no clunoid mention).
  const plan = useBilling((s) => s.plan);
  const isSubscriber = plan === "pro" || plan === "max";
  const [branded, setBranded] = useState(true);
  // Which voice narrates the video (remembered across renders). "silent" = no voice.
  const [videoVoice, setVideoVoice] = useState<string>("isaac");
  const [voiceOpen, setVoiceOpen] = useState(false);
  // True when the shown result was loaded from the saved-video cache (not re-rendered).
  const [fromSaved, setFromSaved] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState("");
  // True once the renderer reports it's encoding in the BACKGROUND (WebCodecs path,
  // tab-safe). Stays false for the real-time recorder, which needs the tab open.
  const [bgSafe, setBgSafe] = useState(false);
  const [results, setResults] = useState<RenderItem[]>([]);
  // Per-size video LENGTH in seconds (Stat Battle only; vertical & wide can differ).
  const [durVert, setDurVert] = useState(videoDuration?.vertical ?? 120);
  const [durWide, setDurWide] = useState(videoDuration?.wide ?? 300);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<RenderItem[]>([]);
  resultsRef.current = results;

  const cleanupUrls = useCallback(() => {
    for (const r of resultsRef.current) URL.revokeObjectURL(r.url);
  }, []);

  // On open: if this game already has a saved PREMIUM video, show it immediately
  // (no re-render, no re-spend). Otherwise reflect the remembered voice + check support.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setFromSaved(false);
    if (videoDuration) {
      setDurVert(videoDuration.vertical);
      setDurWide(videoDuration.wide);
    }
    (async () => {
      if (gameId) {
        const saved = await loadGameVideo(gameId);
        if (!alive) return;
        if (saved?.items.length) {
          const items: RenderItem[] = saved.items.map((it) => ({
            aspect: it.aspect as ReelAspect,
            url: URL.createObjectURL(it.blob),
            blob: it.blob,
            ext: it.ext,
            mime: it.mime,
            hadVoice: true,
          }));
          setResults(items);
          setAspect(items.length > 1 ? "both" : items[0].aspect);
          setVideoVoice(saved.voice);
          setBranded(saved.branded);
          setStatus("ready");
          setFromSaved(true);
          return;
        }
      }
      if (!alive) return;
      setVideoVoice(getVideoVoicePref());
      if (!canRecordVideo()) setStatus("unsupported");
    })();
    return () => {
      alive = false;
    };
    // videoDuration is intentionally tracked by its default values (the object identity
    // changes each render); including the object would reset the inputs every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gameId, videoDuration?.vertical, videoDuration?.wide]);

  // Reset everything when closing.
  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    cleanupUrls();
    setResults([]);
    setStatus(canRecordVideo() ? "idle" : "unsupported");
    setPct(0);
    setCap(null);
    setCapLoading(false);
    setFromSaved(false);
    onClose();
  }, [cleanupUrls, onClose]);

  // On unmount (e.g. a client navigation away while results are showing), abort
  // any render and revoke committed blob URLs so they don't leak.
  useEffect(() => () => {
    abortRef.current?.abort();
    cleanupUrls();
  }, [cleanupUrls]);

  const generate = useCallback(async () => {
    if (!canRecordVideo()) {
      setStatus("unsupported");
      return;
    }
    if (!render && !makeSpec) {
      setStatus("error"); // misconfigured caller — nothing to render
      return;
    }
    cleanupUrls();
    setResults([]);
    setPct(0);
    setBgSafe(false);
    setFromSaved(false);
    setStatus("rendering");
    const ac = new AbortController();
    abortRef.current = ac;
    const targets: ReelAspect[] = aspect === "both" ? ["9:16", "16:9"] : [aspect];
    // Display name of the chosen voice, so progress labels say the right thing
    // (not always "Isaac"). undefined for a silent video.
    const voiceName = videoVoice === "silent" ? undefined : voiceById(videoVoice)?.name ?? "Isaac";
    const out: RenderItem[] = [];
    try {
      // let the "rendering" view (host div) mount before we draw into it
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i];
        const base = (i / targets.length) * 100;
        const span = 100 / targets.length;
        const onProgress = (p: number, l: string) => {
          setPct(Math.round(base + (p / 100) * span));
          setLabel(targets.length > 1 ? `${l} · ${ASPECT_LABEL[a]} (${i + 1}/${targets.length})` : l);
          if (l.toLowerCase().includes("background")) setBgSafe(true);
        };
        const res = render
          ? await render(a, { host: hostRef.current, signal: ac.signal, onProgress, branded, durationSec: videoDuration ? (a === "9:16" ? durVert : durWide) : undefined })
          : await renderReel(makeSpec!(a, { branded }), { host: hostRef.current, signal: ac.signal, onProgress, voiceName });
        if (ac.signal.aborted) {
          out.forEach((r) => URL.revokeObjectURL(r.url)); // don't orphan an already-finished size
          return;
        }
        out.push({ aspect: a, url: URL.createObjectURL(res.blob), blob: res.blob, ext: res.ext, mime: res.mime, hadVoice: res.hadVoice });
      }
      setResults(out);
      setStatus("ready");
      // Cache PREMIUM (paid-voice) videos under this game so re-opening it from
      // history serves the saved file instead of re-rendering (re-spending credits).
      // Free-voice videos are cheap → not cached.
      const usedVoice = getVideoVoicePref();
      if (gameId && isPremiumVideoVoice(usedVoice) && out.length) {
        void saveGameVideo({
          gameId,
          voice: usedVoice,
          branded,
          items: out.map((r) => ({ aspect: r.aspect, ext: r.ext, mime: r.mime, blob: r.blob })),
          createdAt: Date.now(),
        });
      }
    } catch (e) {
      // Renderers THROW AbortError on abort (they don't resolve) — revoke any
      // size that already finished so its blob URL isn't orphaned.
      out.forEach((r) => URL.revokeObjectURL(r.url));
      if ((e as Error)?.name === "AbortError") return;
      console.error("reel render failed", e);
      setStatus("error");
    }
  }, [aspect, branded, cleanupUrls, makeSpec, render, gameId, videoVoice, durVert, durWide, videoDuration]);

  const nameFor = useCallback(
    (item: RenderItem) => (resultsRef.current.length > 1 ? `${fileName}-${item.aspect.replace(":", "x")}` : fileName),
    [fileName]
  );

  const download = useCallback(
    (item: RenderItem) => {
      const a = document.createElement("a");
      const u = URL.createObjectURL(item.blob);
      a.href = u;
      a.download = `${nameFor(item)}.${item.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    },
    [nameFor]
  );

  const share = useCallback(
    async (item: RenderItem) => {
      try {
        const file = new File([item.blob], `${nameFor(item)}.${item.ext}`, { type: item.mime });
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (nav.canShare && nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: heading, text: caption });
          return;
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
      download(item); // no file-share support (most desktops) → download instead
    },
    [download, nameFor, caption, heading]
  );

  // Open a specific platform: save ONE clip first (the vertical when both exist —
  // browsers reliably allow only a single programmatic download per gesture), then
  // open the app (its https link routes to the installed app, else the web) so the
  // user can attach the just-saved clip / post the link.
  const postTo = useCallback(
    (href: string) => {
      try {
        window.open(href, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
      const first = resultsRef.current[0];
      if (first) download(first);
    },
    [download]
  );

  // Ask the brain for a ready-to-paste title + caption + hashtags.
  const generateCaption = useCallback(async () => {
    if (!captionContext) return;
    setCapLoading(true);
    setCap(null);
    try {
      const res = await fetch("/api/share-caption", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(captionContext),
      });
      const d = await res.json();
      if (!d.error && d.caption) setCap({ title: d.title || "", caption: d.caption, hashtags: d.hashtags || [] });
    } catch {
      /* leave cap null → the button can be retried */
    }
    setCapLoading(false);
  }, [captionContext]);

  const captionText = cap ? `${cap.title}\n\n${cap.caption}\n\n${cap.hashtags.join(" ")}`.trim() : "";
  const copyCaption = useCallback(() => {
    if (!captionText) return;
    navigator.clipboard
      ?.writeText(captionText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }, [captionText]);

  if (!open) return null;

  const ready = status === "ready" && results.length > 0;
  const multi = results.length > 1;

  const voiceLabel = videoVoice === "silent" ? "Silent" : voiceById(videoVoice)?.name ?? "Isaac";

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden text-white">
      <RaysBackground hue={222} />
      {/* readability scrim so the floating content reads cleanly over the rays */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(125% 95% at 50% 34%, rgba(10,13,22,0.42), rgba(7,9,15,0.82) 95%)" }} />

      {/* close */}
      <button
        onClick={handleClose}
        aria-label="Close"
        className="absolute right-4 top-[max(env(safe-area-inset-top),1rem)] z-30 grid h-11 w-11 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur transition hover:bg-black/50 hover:text-white"
      >
        <X size={20} />
      </button>

      {/* Full-screen content. Mobile: single scrolling column. Big screens: an
          end-to-end layout — controls left, preview right, socials + action bar
          across the bottom. */}
      <div className="relative z-10 mx-auto flex h-full w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.1rem)] pt-[max(env(safe-area-inset-top),1.5rem)] lg:max-w-6xl lg:px-12 lg:pb-7">
        {/* title */}
        <div className="shrink-0 pr-12 text-center lg:pr-14 lg:text-left">
          <h2 className="text-3xl font-extrabold leading-none sm:text-4xl" style={{ textShadow: TITLE_SHADOW }}>
            {heading}
          </h2>
          <p className="mt-2 text-sm font-semibold text-white/70">
            {fromSaved && ready
              ? `Saved ${voiceLabel} video — ready to share, no new credits used`
              : `${render ? "Narrated by Isaac" : videoVoice === "silent" ? "Silent video" : `Narrated by ${voiceLabel}`} · ready in seconds`}
          </p>
        </div>

        {/* MAIN — stacks on mobile; on big screens: controls left, preview right
            (watermark + action on top, a vertical social rail beside it). */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-1 lg:mt-6 lg:flex-row lg:items-stretch lg:gap-8 lg:overflow-hidden lg:pb-0">
          {/* LEFT — size + voice */}
          <div className="flex shrink-0 flex-col gap-3 lg:w-[360px] lg:overflow-y-auto lg:pb-2 lg:pr-1">
            {/* size — frosted pills */}
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 lg:justify-start">
              {([
                { v: "9:16", label: "Vertical", Icon: Smartphone },
                { v: "16:9", label: "Wide", Icon: Monitor },
                { v: "both", label: "Both", Icon: Layers },
              ] as const).map(({ v, label: l, Icon }) => (
                <button
                  key={v}
                  disabled={status === "rendering"}
                  onClick={() => {
                    if (v === aspect) return;
                    setAspect(v);
                    cleanupUrls();
                    setResults([]);
                    if (status === "ready") setStatus("idle");
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-extrabold backdrop-blur transition disabled:opacity-50 ${
                    aspect === v ? "bg-white text-black shadow-lg" : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  <Icon size={15} /> {l}
                </button>
              ))}
            </div>

            {/* Video length — Stat Battle: total control, per size (vertical & wide can differ). */}
            {videoDuration && (
              <div className="shrink-0 space-y-1.5">
                <p className="flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wide text-white/45">
                  <Gauge size={13} className="text-[#FFD400]" /> Video length
                </p>
                {(aspect === "both" ? (["9:16", "16:9"] as ReelAspect[]) : [aspect as ReelAspect]).map((a) => {
                  const val = a === "9:16" ? durVert : durWide;
                  const setVal = a === "9:16" ? setDurVert : setDurWide;
                  const apply = (sec: number) => {
                    setVal(Math.min(LEN_MAX, Math.max(LEN_MIN, Math.round(sec))));
                    cleanupUrls();
                    setResults([]);
                    if (status === "ready") setStatus("idle");
                  };
                  return (
                    <div key={a} className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2">
                      <span className="flex w-[4.4rem] shrink-0 items-center gap-1 text-xs font-extrabold text-white/80">
                        {a === "9:16" ? <Smartphone size={13} /> : <Monitor size={13} />} {a === "9:16" ? "Vertical" : "Wide"}
                      </span>
                      <input
                        type="range"
                        min={LEN_MIN}
                        max={LEN_MAX}
                        step={5}
                        value={val}
                        disabled={status === "rendering"}
                        onChange={(e) => apply(parseInt(e.target.value, 10))}
                        aria-label={`${a === "9:16" ? "Vertical" : "Wide"} video length`}
                        style={{ accentColor: sliderColor((val - LEN_MIN) / (LEN_MAX - LEN_MIN)) }}
                        className="h-1.5 flex-1 cursor-pointer disabled:opacity-50"
                      />
                      <input
                        type="number"
                        min={LEN_MIN / 60}
                        max={LEN_MAX / 60}
                        step={0.5}
                        value={Number((val / 60).toFixed(2))}
                        disabled={status === "rendering"}
                        onChange={(e) => {
                          const m = parseFloat(e.target.value);
                          if (!Number.isNaN(m)) apply(m * 60);
                        }}
                        aria-label={`${a === "9:16" ? "Vertical" : "Wide"} length in minutes`}
                        className="w-12 shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-center text-xs font-bold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                      />
                      <span className="shrink-0 text-[10px] font-semibold text-white/45">min</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Voice — narrated videos only (the stat-battle race has a fixed outro).
                Mobile: a compact pill that expands. Big screens: shown directly so
                the free-voices group can drop down in place. */}
            {!render && (
              <div className="shrink-0">
                <button
                  type="button"
                  disabled={status === "rendering"}
                  onClick={() => setVoiceOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-2 rounded-full bg-white/12 px-4 py-3 text-left backdrop-blur transition hover:bg-white/20 disabled:opacity-50 lg:hidden"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-white">
                    <Mic size={16} className="shrink-0 text-[#FFD400]" /> Voice
                    <span className="truncate font-semibold text-white/60">· {voiceLabel}</span>
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-white/60 transition ${voiceOpen ? "rotate-180" : ""}`} />
                </button>
                <div className={`${voiceOpen ? "mt-1.5 block" : "hidden"} lg:mt-0 lg:block`}>
                  <p className="mb-1.5 hidden items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wide text-white/45 lg:flex">
                    <Mic size={13} className="text-[#FFD400]" /> Voice
                  </p>
                  <HostVoicePicker
                    mode="video"
                    onPick={(id) => {
                      setVideoVoice(id);
                      // The chosen voice changed → any already-rendered clip is stale.
                      cleanupUrls();
                      setResults([]);
                      if (status === "ready") setStatus("idle");
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — watermark · action · preview + social rail · progress/caption */}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 lg:overflow-y-auto lg:pb-2">
            {/* Remove watermark — above the preview (Pro/Max) */}
            {isSubscriber && (
              <button
                type="button"
                disabled={status === "rendering"}
                onClick={() => {
                  setBranded((b) => !b);
                  cleanupUrls();
                  setResults([]);
                  if (status === "ready") setStatus("idle");
                }}
                aria-pressed={!branded}
                className={`flex shrink-0 items-center justify-between gap-3 rounded-full px-4 py-2.5 text-left backdrop-blur transition disabled:opacity-50 ${
                  !branded ? "bg-violet-500/30" : "bg-white/12 hover:bg-white/20"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-white">
                  <Sparkles size={16} className="shrink-0 text-violet-300" /> Remove watermark
                  <span className="rounded bg-violet-500/30 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-violet-100">Pro</span>
                </span>
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${!branded ? "bg-violet-400" : "bg-white/25"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${!branded ? "left-[1.375rem]" : "left-0.5"}`} />
                </span>
              </button>
            )}

            {/* Action — on top of the preview: Create → Creating → Download/Share */}
            <div className="shrink-0">
              {ready ? (
                multi ? (
                  <p className="py-0.5 text-center text-xs font-semibold leading-snug text-white/70">
                    Both sizes are ready — tap <span className="font-bold text-white/90">Save</span> on each below.
                  </p>
                ) : (
                  <div className="flex gap-2.5">
                    <button onClick={() => download(results[0])} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3.5 text-sm font-extrabold text-black shadow-lg transition hover:bg-white/90">
                      <Download size={18} /> Download
                    </button>
                    <button onClick={() => share(results[0])} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/15 py-3.5 text-sm font-extrabold text-white backdrop-blur transition hover:bg-white/25">
                      <Share2 size={18} /> Share
                    </button>
                  </div>
                )
              ) : (
                <button
                  onClick={generate}
                  disabled={status === "rendering" || status === "unsupported"}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-base font-extrabold text-black shadow-[0_12px_34px_-10px_rgba(0,0,0,0.7)] transition hover:bg-white/90 disabled:opacity-50"
                >
                  {status === "rendering" ? <Loader2 size={18} className="animate-spin" /> : <Film size={18} />}
                  {status === "rendering" ? `Creating… ${pct}%` : aspect === "both" ? "Create both videos" : "Create video"}
                </button>
              )}
            </div>

            {/* Preview — DYNAMIC. Both results flow at full size (stacked on phones,
                side-by-side on wider screens) so every clip is fully visible and the
                column simply scrolls; no fixed-height box hides the second video. A
                definite-height stage is kept only for the live render + single result
                (the renderer needs a sized canvas host). */}
            {ready && multi ? (
              <div className="flex shrink-0 flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-center">
                {results.map((r) => (
                  <div key={r.aspect} className="w-full overflow-hidden rounded-2xl bg-black/40 sm:w-auto sm:max-w-[49%]">
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold text-white/85">
                        {r.aspect === "9:16" ? <Smartphone size={14} /> : <Monitor size={14} />} {ASPECT_LABEL[r.aspect]} <span className="text-white/45">{r.aspect}</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => download(r)} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold transition hover:bg-white/25">
                          <Download size={13} /> Save
                        </button>
                        <button onClick={() => share(r)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black transition hover:bg-white/90">
                          <Share2 size={13} /> Share
                        </button>
                      </div>
                    </div>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={r.url}
                      controls
                      autoPlay
                      muted
                      loop
                      playsInline
                      className={`bg-black object-contain ${r.aspect === "9:16" ? "mx-auto max-h-[62dvh] w-auto max-w-full" : "h-auto w-full max-h-[44dvh]"}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative flex h-[42dvh] shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-black/35 backdrop-blur lg:h-[52vh]">
                {status === "unsupported" ? (
                  <p className="px-6 text-center text-sm text-white/70">
                    Video creation isn’t supported in this browser. Try Chrome on desktop or Android.
                  </p>
                ) : status === "error" ? (
                  <p className="px-6 text-center text-sm text-white/70">Something went wrong creating the video. Please try again.</p>
                ) : ready && results[0] ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={results[0].url} controls autoPlay muted loop playsInline className="max-h-full max-w-full rounded-2xl bg-black object-contain" />
                ) : (
                  <div ref={hostRef} className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
                    {status === "idle" && (
                      <>
                        <span className="grid h-16 w-16 place-items-center rounded-full bg-white/10 ring-1 ring-white/15">
                          <Film size={28} className="text-white/70" />
                        </span>
                        <p className="max-w-[16rem] text-sm font-semibold text-white/65">
                          {idleHint || `Your ${aspect === "both" ? "vertical + wide" : aspect} recap — tap Create above.`}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* social rail — a horizontal row below the preview, once a clip is ready */}
            {ready && (
              <div className="flex shrink-0 flex-wrap items-center justify-center gap-2.5">
                {platforms.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => postTo(p.href)}
                    aria-label={`Post to ${p.label}`}
                    title={`Save the video & open ${p.label}`}
                    className="grid h-11 w-11 place-items-center rounded-full text-white shadow-md ring-1 ring-white/15 transition hover:scale-110"
                    style={{ backgroundColor: p.color }}
                  >
                    <p.Icon size={19} />
                  </button>
                ))}
              </div>
            )}

            {/* progress */}
            {status === "rendering" && (
              <div className="shrink-0 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-white/80">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Loader2 size={14} className="shrink-0 animate-spin" /> <span className="truncate">{label || "Working…"}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{pct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/40">
                  <div className="h-full rounded-full bg-[#FFD400] transition-all" style={{ width: `${pct}%` }} />
                </div>
                {bgSafe ? (
                  <div className="flex items-start gap-2 rounded-2xl bg-emerald-500/15 px-3 py-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                    <p className="text-[12px] font-semibold leading-snug text-emerald-100/90">
                      Encoding in the background — feel free to switch tabs. Your {aspect === "both" ? "videos" : "video"} will be ready when you come back.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-2xl bg-amber-400/20 px-3.5 py-3">
                    <AlertTriangle size={20} className="mt-0.5 shrink-0 animate-pulse text-amber-300" />
                    <div>
                      <p className="text-[13px] font-extrabold leading-snug text-amber-100">Keep this tab open</p>
                      <p className="mt-0.5 text-[12px] font-medium leading-snug text-amber-100/85">
                        Your video is recording in real time — don’t switch tabs or minimise until it finishes, or it won’t save fully.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {ready && videoVoice !== "silent" && results.some((r) => !r.hadVoice) && (
              <p className="shrink-0 px-2 text-center text-[11px] text-amber-300/90">
                The {voiceById(videoVoice)?.name ?? "Isaac"} voice wasn’t available for {multi ? "one of these clips" : "this clip"}
                {videoVoice !== "isaac" ? " — the free voices are rate-limited. Try Isaac or “Silent.”" : "."}
              </p>
            )}

            {/* AI caption generator */}
            {ready && captionContext && (
              <div className="shrink-0">
                {!cap ? (
                  <button
                    onClick={generateCaption}
                    disabled={capLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-extrabold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
                  >
                    {capLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {capLoading ? "Writing your caption…" : "Generate title, caption & hashtags"}
                  </button>
                ) : (
                  <div className="rounded-2xl bg-black/35 p-3 backdrop-blur">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-bold text-white/60">Ready to post — copy &amp; paste</p>
                      <button onClick={copyCaption} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white transition hover:bg-white/25">
                        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy all"}
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-xl bg-black/30 p-3 text-sm leading-relaxed">
                      <p className="font-extrabold text-white">{cap.title}</p>
                      <p className="mt-1.5 text-white/85">{cap.caption}</p>
                      <p className="mt-1.5 font-semibold text-sky-300/90">{cap.hashtags.join(" ")}</p>
                    </div>
                    <button onClick={generateCaption} disabled={capLoading} className="mt-1.5 text-[11px] text-white/50 underline transition hover:text-white/80">
                      {capLoading ? "Regenerating…" : "Regenerate"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
