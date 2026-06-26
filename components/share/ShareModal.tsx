"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Download, Share2, X, Film, Loader2, Smartphone, Monitor, Instagram, Youtube, Facebook, Sparkles, Copy, Check } from "lucide-react";
import { canRecordVideo, type ReelAspect, type ReelSpec } from "@/lib/share/reel";
import { renderReel } from "@/lib/share/renderer";
import { TikTokIcon, XIcon, WhatsAppIcon } from "./SocialIcons";

type Status = "idle" | "rendering" | "ready" | "unsupported" | "error";

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
  makeSpec?: (aspect: ReelAspect) => ReelSpec;
  // Optional custom renderer (e.g. the Stat Battle race). Defaults to renderReel(makeSpec).
  render?: (aspect: ReelAspect, opts: { host: HTMLElement | null; signal: AbortSignal; onProgress: (p: number, l: string) => void }) => Promise<{ blob: Blob; ext: string; mime: string; hadVoice: boolean }>;
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
  const [aspect, setAspect] = useState<ReelAspect>("9:16");
  const [status, setStatus] = useState<Status>("idle");
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState("");
  const [hadVoice, setHadVoice] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [fileExt, setFileExt] = useState("mp4");
  const [mime, setMime] = useState("video/mp4");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const cleanupUrl = useCallback(() => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    if (open && !canRecordVideo()) setStatus("unsupported");
  }, [open]);

  // Reset everything when closing.
  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    cleanupUrl();
    setStatus(canRecordVideo() ? "idle" : "unsupported");
    setPct(0);
    setUrl(null);
    blobRef.current = null;
    setCap(null);
    setCapLoading(false);
    onClose();
  }, [cleanupUrl, onClose]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = useCallback(async () => {
    if (!canRecordVideo()) {
      setStatus("unsupported");
      return;
    }
    cleanupUrl();
    setUrl(null);
    setPct(0);
    setStatus("rendering");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // let the "rendering" view (host div) mount before we draw into it
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const onProgress = (p: number, l: string) => {
        setPct(p);
        setLabel(l);
      };
      const res = render
        ? await render(aspect, { host: hostRef.current, signal: ac.signal, onProgress })
        : await renderReel(makeSpec!(aspect), { host: hostRef.current, signal: ac.signal, onProgress });
      if (ac.signal.aborted) return;
      blobRef.current = res.blob;
      setFileExt(res.ext);
      setMime(res.mime);
      setHadVoice(res.hadVoice);
      setUrl(URL.createObjectURL(res.blob));
      setStatus("ready");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      console.error("reel render failed", e);
      setStatus("error");
    }
  }, [aspect, cleanupUrl, makeSpec, render]);

  const download = useCallback(() => {
    const blob = blobRef.current;
    if (!blob) return;
    const a = document.createElement("a");
    const u = URL.createObjectURL(blob);
    a.href = u;
    a.download = `${fileName}.${fileExt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }, [fileExt, fileName]);

  const share = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    try {
      const file = new File([blob], `${fileName}.${fileExt}`, { type: mime });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: heading, text: caption });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    download(); // no file-share support (most desktops) → download instead
  }, [download, fileExt, fileName, mime, caption, heading]);

  // Open a specific platform: save the video first, then open the app (its https
  // link routes to the installed app on the device, else the web) so the user can
  // attach the just-saved clip / post the link.
  const postTo = useCallback(
    (href: string) => {
      try {
        window.open(href, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
      download();
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
          {/* aspect toggle */}
          <div className="flex items-center justify-center gap-2">
            {([
              { v: "9:16", label: "Vertical", Icon: Smartphone },
              { v: "16:9", label: "Wide", Icon: Monitor },
            ] as const).map(({ v, label: l, Icon }) => (
              <button
                key={v}
                disabled={status === "rendering"}
                onClick={() => {
                  if (v === aspect) return;
                  setAspect(v);
                  cleanupUrl();
                  setUrl(null);
                  if (status === "ready") setStatus("idle");
                }}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
                  aspect === v ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"
                }`}
              >
                <Icon size={15} /> {l} <span className="opacity-60">{v}</span>
              </button>
            ))}
          </div>

          {/* preview area */}
          <div className="flex items-center justify-center rounded-2xl bg-black/40" style={{ height: "48dvh" }}>
            {status === "unsupported" ? (
              <p className="px-6 text-center text-sm text-white/70">
                Video creation isn’t supported in this browser. Try Chrome on desktop or Android.
              </p>
            ) : status === "error" ? (
              <p className="px-6 text-center text-sm text-white/70">Something went wrong creating the video. Please try again.</p>
            ) : status === "ready" && url ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={url} controls playsInline autoPlay loop className="max-h-full max-w-full rounded-xl" />
            ) : (
              <div ref={hostRef} className="flex h-full w-full items-center justify-center p-2">
                {status === "idle" && <p className="px-6 text-center text-sm text-white/55">{idleHint || `Create a ${aspect} video of your game, narrated by Isaac.`}</p>}
              </div>
            )}
          </div>

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
              <p className="mt-1.5 text-center text-[11px] text-white/45">Recording in real time — hang tight.</p>
            </div>
          )}

          {status === "ready" && !hadVoice && (
            <p className="text-center text-[11px] text-amber-300/80">Isaac’s voice wasn’t available for this clip.</p>
          )}

          {/* AI caption generator — a ready-to-paste title + caption + hashtags. */}
          {status === "ready" && captionContext && (
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
          {status === "ready" && (
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
              <p className="mt-2 text-center text-[11px] text-white/45">We’ll save the video — attach it in the app.</p>
            </div>
          )}
        </div>

        {/* actions */}
        <div className="flex gap-2 border-t border-white/10 p-4">
          {status === "ready" ? (
            <>
              <button onClick={download} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3 font-extrabold text-white transition hover:bg-white/20">
                <Download size={18} /> Download
              </button>
              <button onClick={share} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 font-extrabold text-black transition hover:bg-white/90">
                <Share2 size={18} /> Share
              </button>
            </>
          ) : (
            <button
              onClick={generate}
              disabled={status === "rendering" || status === "unsupported"}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 font-extrabold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {status === "rendering" ? <Loader2 size={18} className="animate-spin" /> : <Film size={18} />}
              {status === "rendering" ? "Creating…" : "Create video"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
