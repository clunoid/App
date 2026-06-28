"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Download, Share2, X, Film, Loader2, Smartphone, Monitor, Layers, Instagram, Youtube, Facebook, Sparkles, Copy, Check, AlertTriangle, CheckCircle2 } from "lucide-react";
import { canRecordVideo, type ReelAspect, type ReelSpec } from "@/lib/share/reel";
import { renderReel } from "@/lib/share/renderer";
import { useBilling } from "@/lib/billing/store";
import { TikTokIcon, XIcon, WhatsAppIcon } from "./SocialIcons";

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
}: {
  open: boolean;
  onClose: () => void;
  makeSpec?: (aspect: ReelAspect, opts: { branded: boolean }) => ReelSpec;
  // Optional custom renderer (e.g. the Stat Battle race). Defaults to renderReel(makeSpec).
  render?: (aspect: ReelAspect, opts: { host: HTMLElement | null; signal: AbortSignal; onProgress: (p: number, l: string) => void; branded: boolean }) => Promise<{ blob: Blob; ext: string; mime: string; hadVoice: boolean }>;
  fileName?: string;
  heading?: string; // modal title (e.g. "Share your stat battle")
  idleHint?: string; // the idle preview hint (defaults to the game wording)
  caption?: string; // prefilled social caption
  captionContext?: { title: string; subtitle?: string; source?: string }; // enables the AI caption generator
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
  const [status, setStatus] = useState<Status>("idle");
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState("");
  // True once the renderer reports it's encoding in the BACKGROUND (WebCodecs path,
  // tab-safe). Stays false for the real-time recorder, which needs the tab open.
  const [bgSafe, setBgSafe] = useState(false);
  const [results, setResults] = useState<RenderItem[]>([]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<RenderItem[]>([]);
  resultsRef.current = results;

  const cleanupUrls = useCallback(() => {
    for (const r of resultsRef.current) URL.revokeObjectURL(r.url);
  }, []);

  useEffect(() => {
    if (open && !canRecordVideo()) setStatus("unsupported");
  }, [open]);

  // Reset everything when closing.
  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    cleanupUrls();
    setResults([]);
    setStatus(canRecordVideo() ? "idle" : "unsupported");
    setPct(0);
    setCap(null);
    setCapLoading(false);
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
    setStatus("rendering");
    const ac = new AbortController();
    abortRef.current = ac;
    const targets: ReelAspect[] = aspect === "both" ? ["9:16", "16:9"] : [aspect];
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
          ? await render(a, { host: hostRef.current, signal: ac.signal, onProgress, branded })
          : await renderReel(makeSpec!(a, { branded }), { host: hostRef.current, signal: ac.signal, onProgress });
        if (ac.signal.aborted) {
          out.forEach((r) => URL.revokeObjectURL(r.url)); // don't orphan an already-finished size
          return;
        }
        out.push({ aspect: a, url: URL.createObjectURL(res.blob), blob: res.blob, ext: res.ext, mime: res.mime, hadVoice: res.hadVoice });
      }
      setResults(out);
      setStatus("ready");
    } catch (e) {
      // Renderers THROW AbortError on abort (they don't resolve) — revoke any
      // size that already finished so its blob URL isn't orphaned.
      out.forEach((r) => URL.revokeObjectURL(r.url));
      if ((e as Error)?.name === "AbortError") return;
      console.error("reel render failed", e);
      setStatus("error");
    }
  }, [aspect, branded, cleanupUrls, makeSpec, render]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[#201f1d] text-white shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Film size={20} /> {heading}
          </h2>
          <button onClick={handleClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* size choice */}
          <div className="flex items-center justify-center gap-2">
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
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition disabled:opacity-50 ${
                  aspect === v ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"
                }`}
              >
                <Icon size={15} /> {l}
              </button>
            ))}
          </div>

          {/* Pro/Max: choose to remove the watermark (and any clunoid mention). */}
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
              className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-left ring-1 ring-white/10 transition hover:bg-white/[0.07] disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <Sparkles size={16} className="shrink-0 text-violet-300" />
                <span>
                  <span className="block text-sm font-bold">Remove watermark</span>
                  <span className="block text-[11px] text-white/55">
                    {branded ? "Pro & Max — your video, no clunoid mark or mention" : "Unbranded — no watermark, no clunoid, Isaac won't name the site"}
                  </span>
                </span>
              </span>
              <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${!branded ? "bg-violet-500" : "bg-white/20"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${!branded ? "left-[1.375rem]" : "left-0.5"}`} />
              </span>
            </button>
          )}

          {/* preview / results */}
          {ready && multi ? (
            <div className="flex flex-col gap-3">
              {results.map((r) => (
                <div key={r.aspect} className="overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-white/80">
                      {r.aspect === "9:16" ? <Smartphone size={14} /> : <Monitor size={14} />} {ASPECT_LABEL[r.aspect]} <span className="opacity-50">{r.aspect}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => download(r)} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold transition hover:bg-white/20">
                        <Download size={13} /> Save
                      </button>
                      <button onClick={() => share(r)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black transition hover:bg-white/90">
                        <Share2 size={13} /> Share
                      </button>
                    </div>
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={r.url} controls playsInline loop className="max-h-[34dvh] w-full bg-black object-contain" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl bg-black/40" style={{ height: "48dvh" }}>
              {status === "unsupported" ? (
                <p className="px-6 text-center text-sm text-white/70">
                  Video creation isn’t supported in this browser. Try Chrome on desktop or Android.
                </p>
              ) : status === "error" ? (
                <p className="px-6 text-center text-sm text-white/70">Something went wrong creating the video. Please try again.</p>
              ) : ready && results[0] ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={results[0].url} controls playsInline autoPlay loop className="max-h-full max-w-full rounded-xl" />
              ) : (
                <div ref={hostRef} className="flex h-full w-full items-center justify-center p-2">
                  {status === "idle" && (
                    <p className="px-6 text-center text-sm text-white/55">
                      {idleHint || `Create a ${aspect === "both" ? "vertical + wide" : aspect} video of your game, narrated by Isaac.`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* progress */}
          {status === "rendering" && (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-white/70">
                <span className="flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" /> {label || "Working…"}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
              </div>
              {bgSafe ? (
                <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-400/25">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                  <p className="text-[12px] font-semibold leading-snug text-emerald-100/90">
                    Encoding in the background — feel free to switch tabs or minimise. Your {aspect === "both" ? "videos" : "video"} will be ready when you come back.
                  </p>
                </div>
              ) : (
                <div className="mt-2.5 flex items-start gap-2.5 rounded-xl bg-amber-400/15 px-3.5 py-3 ring-1 ring-amber-300/45">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0 animate-pulse text-amber-300" />
                  <div>
                    <p className="text-[13px] font-extrabold leading-snug text-amber-100">Keep this tab open</p>
                    <p className="mt-0.5 text-[12px] font-medium leading-snug text-amber-100/85">
                      Your video is recording in real time. Don’t switch tabs or minimise this window until it finishes — or it won’t be saved fully.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {ready && results.some((r) => !r.hadVoice) && (
            <p className="text-center text-[11px] text-amber-300/80">Isaac’s voice wasn’t available for {multi ? "one of these clips" : "this clip"}.</p>
          )}

          {/* AI caption generator — a ready-to-paste title + caption + hashtags. */}
          {ready && captionContext && (
            <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
              {!cap ? (
                <button
                  onClick={generateCaption}
                  disabled={capLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 py-2.5 text-sm font-extrabold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {capLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {capLoading ? "Writing your caption…" : "Generate title, caption & hashtags"}
                </button>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-white/55">Ready to post — copy &amp; paste</p>
                    <button onClick={copyCaption} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white transition hover:bg-white/20">
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy all"}
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl bg-black/30 p-3 text-sm leading-relaxed">
                    <p className="font-extrabold text-white">{cap.title}</p>
                    <p className="mt-1.5 text-white/85">{cap.caption}</p>
                    <p className="mt-1.5 font-semibold text-sky-300/90">{cap.hashtags.join(" ")}</p>
                  </div>
                  <button onClick={generateCaption} disabled={capLoading} className="mt-1.5 text-[11px] text-white/45 underline transition hover:text-white/70">
                    {capLoading ? "Regenerating…" : "Regenerate"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Post-to-platform shortcuts — open the app (or web) so it's easy to post. */}
          {ready && (
            <div>
              <p className="mb-2 text-center text-xs font-semibold text-white/55">Post to</p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {platforms.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => postTo(p.href)}
                    aria-label={`Post to ${p.label}`}
                    title={`Save the video & open ${p.label}`}
                    className="grid h-11 w-11 place-items-center rounded-full text-white shadow-md ring-1 ring-white/15 transition hover:scale-110"
                    style={{ backgroundColor: p.color }}
                  >
                    <p.Icon size={20} />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] text-white/45">We’ll save the video — attach in the app.</p>
            </div>
          )}
        </div>

        {/* actions */}
        <div className="flex gap-2 border-t border-white/10 p-4">
          {ready ? (
            multi ? (
              <p className="flex-1 py-1 text-center text-xs font-medium leading-snug text-white/55">
                Tap <span className="font-bold text-white/80">Save</span> on each size above to download it.
              </p>
            ) : (
              <>
                <button onClick={() => download(results[0])} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3 font-extrabold text-white transition hover:bg-white/20">
                  <Download size={18} /> Download
                </button>
                <button onClick={() => share(results[0])} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 font-extrabold text-black transition hover:bg-white/90">
                  <Share2 size={18} /> Share
                </button>
              </>
            )
          ) : (
            <button
              onClick={generate}
              disabled={status === "rendering" || status === "unsupported"}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 font-extrabold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {status === "rendering" ? <Loader2 size={18} className="animate-spin" /> : <Film size={18} />}
              {status === "rendering" ? "Creating…" : aspect === "both" ? "Create both videos" : "Create video"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
