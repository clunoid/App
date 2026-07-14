"use client";

/**
 * VLAB STUDIO — prompt → story-complete, consistent, narration-timed 3D-animated
 * short (admin-only). Full-bleed studio in the Showtime/Edge mold.
 *
 * The design center is FIRST-TRY QUALITY (videos cost real money; users can't
 * afford retries), so everything cheap happens before anything expensive:
 *  1. THINK (tokens): Opus writes the complete story screenplay — real-world
 *     hook → true mechanism beat by beat → real-world payoff — with a reusable
 *     character sheet + world/lighting note; a second adversarial Opus pass
 *     corrects it. The user reviews the screenplay and sees the exact cost
 *     BEFORE production.
 *  2. PRODUCE (dollars): narration first (Isaac, character-timestamped) so
 *     every clip is cut to its exact spoken line; character sheet image; then
 *     each keyframe is EDITED from [sheet + previous frame] (nano-banana) so
 *     identity/world/lighting never drift; Kling animates each frame with the
 *     NEXT keyframe as end-frame when the camera should flow (hard cut only on
 *     scene changes); ffmpeg composes clips trimmed to the narration timeline.
 *  3. KEEP: every step persists to vlab_videos; the finished MP4 is copied to
 *     permanent storage. A transient failure retries; a refresh loses nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Clapperboard, Download, Film, Loader2, Mic, Play, Plus, RefreshCw,
  ShieldAlert, Sparkles, Trash2, Wand2, KeyRound, User, Globe2, ScrollText, CircleDollarSign, ChevronRight,
} from "lucide-react";
import { STYLE_BLOCK, type VlabPlan } from "@/lib/vlab/plan";
import { composeFinalCut } from "@/lib/vlab/compose";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/* ── studio palette (clean sky-blue on a cool near-black) ─────────────────── */
const C = {
  bg: "#08111c",
  rail: "#0a1522",
  panel: "rgba(255,255,255,0.03)",
  panelHi: "rgba(255,255,255,0.06)",
  line: "rgba(148,197,255,0.12)",
  text: "#eef4fb",
  muted: "#9db0c6",
  faint: "#5e708a",
  accent: "#38bdf8",
  accentDim: "rgba(56,189,248,0.14)",
  good: "#4ade80",
  bad: "#f87171",
  ink: "#08111c",
};
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;

/* a faint dotted grid that blends into the background — clean modern depth */
const DOT_GRID = {
  backgroundImage: "radial-gradient(rgba(125,211,252,0.09) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
  backgroundPosition: "-1px -1px",
} as const;

const FAL_MODELS = {
  sheet: "fal-ai/nano-banana",
  frame: "fal-ai/nano-banana/edit",
  video: "fal-ai/kling-video/v3/pro/image-to-video",
} as const;

/* pricing knobs for the on-screen estimate (fal list prices, July 2026) */
const PRICE = { image: 0.04, videoPerSec: 0.112, overhead: 0.15 };

type ShotAsset = { imageUrl?: string; clipUrl?: string };
type Narration = { audioUrl: string; seconds: number; lines: { start: number; end: number }[] };
type VideoRow = {
  id: string;
  topic: string;
  title: string;
  plan: VlabPlan | null;
  shots: ShotAsset[];
  narration: Narration | null;
  final_url: string;
  storage_url: string;
  status: "planned" | "producing" | "done" | "failed";
  created_at: string;
};

const EXAMPLES = [
  "What happens inside your throat when you swallow gum",
  "Why airplane windows are always round",
  "What happens to your body inside a falling elevator",
];

/* ── fal plumbing (server proxy; per-step retry — one flake can't waste a video) ── */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let a = 0; a < tries; a++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (a < tries - 1) await new Promise((r) => setTimeout(r, 2500 * (a + 1)));
    }
  }
  throw last;
}

async function falRun(model: string, input: unknown): Promise<Record<string, unknown>> {
  const sub = await fetch("/api/vlab/fal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, input }) });
  const s = (await sub.json()) as { statusUrl?: string; responseUrl?: string; error?: string };
  if (!sub.ok || !s.statusUrl || !s.responseUrl) throw new Error(s.error || `submit failed (${sub.status})`);
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, i < 10 ? 2500 : 5000));
    const st = await fetch(`/api/vlab/fal?url=${encodeURIComponent(s.statusUrl)}`);
    const d = (await st.json()) as { status?: string; error?: string };
    if (d.status === "COMPLETED") break;
    if (d.status === "FAILED" || st.status >= 400) throw new Error(d.error || `generation ${d.status || st.status}`);
    if (i === 239) throw new Error("generation timed out");
  }
  const res = await fetch(`/api/vlab/fal?url=${encodeURIComponent(s.responseUrl)}`);
  const out = (await res.json()) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(out.error || "result fetch failed");
  return out;
}

const clampDur = (sec: number) => Math.min(15, Math.max(3, Math.ceil(sec)));

/** A clean, filesystem-safe filename from the video title (so downloads are
 *  named "why-swallowed-gum-doesnt…​.mp4", never a random storage id). */
function safeFilename(title: string): string {
  const base = (title || "clunoid-video")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "") // drop punctuation/emoji/…
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "");
  return (base || "clunoid-video") + ".mp4";
}

/**
 * The finished film. The MP4 lives on Supabase Storage, which serves it
 * `Cache-Control: no-cache` — streaming it straight into a <video> made the
 * browser re-request segments (the "hangs and reloads" the owner saw). So we
 * fetch it ONCE into a local blob and play from that: instant seeking, zero
 * re-buffering, and the download button reuses the same blob so it saves with
 * the real title as the filename (cross-origin `download` names are ignored, a
 * same-origin blob URL is not). Retried, and cleaned up on unmount.
 */
function FilmPlayer({ src, title }: { src: string; title: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    let objUrl: string | null = null;
    setBlobUrl(null);
    setErr(null);
    setPct(0);
    (async () => {
      for (let attempt = 0; attempt < 3 && !dead; attempt++) {
        try {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`fetch ${res.status}`);
          const total = Number(res.headers.get("content-length")) || 0;
          const reader = res.body?.getReader();
          if (reader && total > 0) {
            const chunks: Uint8Array[] = [];
            let got = 0;
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (dead) return;
              chunks.push(value);
              got += value.length;
              setPct(Math.min(99, Math.round((got / total) * 100)));
            }
            objUrl = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "video/mp4" }));
          } else {
            objUrl = URL.createObjectURL(await res.blob());
          }
          if (dead) { URL.revokeObjectURL(objUrl); return; }
          setPct(100);
          setBlobUrl(objUrl);
          return;
        } catch (e) {
          if (attempt === 2) setErr(e instanceof Error ? e.message : "load failed");
          else await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    })();
    return () => {
      dead = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [src]);

  return (
    <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.accent, background: C.panel }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-bold" style={{ color: C.text }}><Play size={15} style={{ color: C.accent }} /> The film</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: C.panelHi, color: C.good }}>saved permanently</span>
          <a
            href={blobUrl || src}
            download={safeFilename(title)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium hover:bg-white/5"
            style={{ borderColor: C.line, color: blobUrl ? C.accent : C.faint, pointerEvents: blobUrl ? "auto" : "none" }}
            title={blobUrl ? `Download “${safeFilename(title)}”` : "Preparing download…"}
          >
            <Download size={13} /> Download MP4
          </a>
        </div>
      </div>
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-xl border" style={{ borderColor: C.line, background: "#000" }}>
        {blobUrl ? (
          <video src={blobUrl} controls autoPlay playsInline className="h-full w-full" />
        ) : (
          <div className="grid h-full w-full place-items-center gap-2 text-center">
            {err ? (
              <span className="px-4 text-[12.5px]" style={{ color: C.bad }}>Couldn&apos;t load the video ({err}).</span>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={20} className="animate-spin" style={{ color: C.accent }} />
                <span className="text-[12px]" style={{ color: C.muted }}>Loading video… {pct}%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function estimateCost(plan: VlabPlan): number {
  const clipSecs = plan.shots.reduce((s, x) => s + clampDur(x.seconds + 1), 0);
  return Math.round(((plan.shots.length + 1) * PRICE.image + clipSecs * PRICE.videoPerSec + PRICE.overhead) * 100) / 100;
}

/* ── the studio ───────────────────────────────────────────────────────────── */
type GateState = "loading" | "signin" | "restricted" | "unconfigured" | "ready";

export function VlabConsole() {
  const [gate, setGate] = useState<GateState>("loading");
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [writing, setWriting] = useState(false);
  const [producingId, setProducingId] = useState<string | null>(null);
  const [stageLabel, setStageLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  /* load history + gate on mount */
  useEffect(() => {
    let dead = false;
    void fetch("/api/vlab/videos").then(async (r) => {
      if (dead) return;
      if (r.status === 401) return setGate("signin");
      if (r.status === 403) return setGate("restricted");
      if (r.status === 501) return setGate("unconfigured");
      const d = (await r.json()) as { videos?: VideoRow[] };
      setVideos(d.videos || []);
      if (d.videos?.length) setSelectedId(d.videos[0].id);
      setGate("ready");
    }).catch(() => setGate("ready"));
    return () => { dead = true; };
  }, []);

  const selected = useMemo(() => videos.find((v) => v.id === selectedId) ?? null, [videos, selectedId]);
  const replaceVideo = useCallback((next: VideoRow) => setVideos((prev) => prev.map((v) => (v.id === next.id ? next : v))), []);

  const patchVideo = useCallback(async (id: string, body: Record<string, unknown>): Promise<VideoRow | null> => {
    const r = await fetch(`/api/vlab/videos/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json()) as { video?: VideoRow };
    if (r.ok && d.video) { replaceVideo(d.video); return d.video; }
    return null;
  }, [replaceVideo]);

  /* 1 — THINK: write (or rewrite) the screenplay */
  const writeScreenplay = async (forTopic: string) => {
    setWriting(true);
    setError(null);
    try {
      const r = await fetch("/api/vlab/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: forTopic }) });
      const d = (await r.json()) as { video?: VideoRow; error?: string };
      if (!r.ok || !d.video) throw new Error(d.error || "screenwriting failed");
      setVideos((prev) => [d.video!, ...prev]);
      setSelectedId(d.video.id);
      setTopic("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "screenwriting failed");
    } finally {
      setWriting(false);
    }
  };

  /* 2 — PRODUCE: the expensive run, persisted step by step */
  const produce = async (video: VideoRow) => {
    if (running.current || !video.plan) return;
    running.current = true;
    setProducingId(video.id);
    setError(null);
    const plan = video.plan;
    const shots: ShotAsset[] = plan.shots.map((_, i) => video.shots?.[i] || {});
    const save = (body: Record<string, unknown>) => patchVideo(video.id, body);
    try {
      await save({ status: "producing" });

      /* a) narration FIRST — its measured timings cut every clip */
      setStageLabel("Isaac is recording the narration…");
      let narration = video.narration;
      if (!narration) {
        const nr = await fetch("/api/vlab/narrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: plan.shots.map((s) => s.line) }) });
        const nd = (await nr.json()) as Narration & { error?: string };
        if (!nr.ok || !nd.audioUrl) throw new Error(nd.error || "narration failed");
        narration = { audioUrl: nd.audioUrl, seconds: nd.seconds, lines: nd.lines };
        await save({ narration });
      }

      /* b) the character sheet — the identity anchor for every frame. Skipped
            entirely on resume when every keyframe already exists. */
      let sheetUrl = "";
      if (plan.shots.some((_, i) => !shots[i].imageUrl)) {
        setStageLabel("Casting: generating the character sheet…");
        const sheetOut = await withRetry(() => falRun(FAL_MODELS.sheet, {
          prompt: `Full-body character reference of ${plan.characterSheet}, standing naturally, neutral background, ${STYLE_BLOCK}`,
          aspect_ratio: "9:16",
          num_images: 1,
          output_format: "jpeg",
        }));
        sheetUrl = (sheetOut.images as { url?: string }[] | undefined)?.[0]?.url || "";
        if (!sheetUrl) throw new Error("character sheet failed");
      }

      /* c) keyframes — SHOT-AWARE consistency chains. Character shots anchor to
            [sheet + last character frame] and must never carry an anatomical
            overlay; interior cutaways chain only from the last interior frame
            (or start fresh) and must never show the person or the room. This
            split is what keeps both worlds consistent WITHOUT bleeding into
            each other (the v2.0 test run's one visual defect). */
      let lastCharFrame: string | null = null;
      let lastInteriorFrame: string | null = null;
      for (let i = 0; i < plan.shots.length; i++) {
        const shot = plan.shots[i];
        const isChar = shot.showsCharacter !== false; // default true for older plans
        if (shots[i].imageUrl) {
          if (isChar) lastCharFrame = shots[i].imageUrl!;
          else lastInteriorFrame = shots[i].imageUrl!;
          continue; // resume support
        }
        setStageLabel(`Drawing keyframe ${i + 1}/${plan.shots.length}…`);
        let url: string | undefined;
        if (isChar) {
          const refs: string[] = [sheetUrl, ...(lastCharFrame ? [lastCharFrame] : [])].filter(Boolean);
          const out = await withRetry(() => falRun(FAL_MODELS.frame, {
            prompt: `${shot.keyframePrompt} Continuity: ${plan.worldNote}. Same character as the reference, shown normally from the outside — absolutely no anatomical cutaway, x-ray or see-through overlay. ${STYLE_BLOCK}`,
            image_urls: refs,
            aspect_ratio: "9:16",
            num_images: 1,
            output_format: "jpeg",
          }));
          url = (out.images as { url?: string }[] | undefined)?.[0]?.url;
        } else if (lastInteriorFrame) {
          const out = await withRetry(() => falRun(FAL_MODELS.frame, {
            prompt: `${shot.keyframePrompt} Full-frame stylized educational cutaway continuing the same interior style as the reference — no person visible, no room, no clothing. ${STYLE_BLOCK}`,
            image_urls: [lastInteriorFrame],
            aspect_ratio: "9:16",
            num_images: 1,
            output_format: "jpeg",
          }));
          url = (out.images as { url?: string }[] | undefined)?.[0]?.url;
        } else {
          // first interior shot — fresh text-to-image so it's a true full-frame cutaway
          const out = await withRetry(() => falRun(FAL_MODELS.sheet, {
            prompt: `${shot.keyframePrompt} Full-frame stylized educational cutaway illustration — no person visible, no room. ${STYLE_BLOCK}`,
            aspect_ratio: "9:16",
            num_images: 1,
            output_format: "jpeg",
          }));
          url = (out.images as { url?: string }[] | undefined)?.[0]?.url;
        }
        if (!url) throw new Error(`keyframe ${i + 1} failed`);
        if (isChar) lastCharFrame = url;
        else lastInteriorFrame = url;
        shots[i] = { ...shots[i], imageUrl: url };
        await save({ shots });
      }

      /* d) clips — parallel; duration covers the narration window; flowing
            shots get the NEXT keyframe as their end-frame */
      setStageLabel("Animating every shot (the slow, expensive part)…");
      const lineWindow = (i: number) => {
        const L = narration!.lines;
        const start = L[i]?.start ?? 0;
        const end = i + 1 < L.length ? L[i + 1].start : narration!.seconds + 0.5;
        return { start, end, dur: Math.max(0.8, end - start) };
      };
      await Promise.all(
        plan.shots.map(async (shot, i) => {
          if (shots[i].clipUrl) return;
          const flowsIntoNext = i + 1 < plan.shots.length && !plan.shots[i + 1].sceneChange && !!shots[i + 1].imageUrl;
          const out = await withRetry(() => falRun(FAL_MODELS.video, {
            start_image_url: shots[i].imageUrl,
            ...(flowsIntoNext ? { end_image_url: shots[i + 1].imageUrl } : {}),
            prompt: `${shot.motionPrompt}. Smooth cinematic camera, premium 3D animation, no morphing.`,
            duration: String(clampDur(lineWindow(i).dur + 1)),
            generate_audio: false,
            negative_prompt: "blur, distortion, low quality, text, watermark, morphing, extra limbs, flicker",
          }));
          const url = (out.video as { url?: string } | undefined)?.url;
          if (!url) throw new Error(`shot ${i + 1} animation failed`);
          shots[i] = { ...shots[i], clipUrl: url };
          await save({ shots });
        })
      );

      /* e) the FINAL CUT — rendered right here in the browser (WebCodecs), every
            clip cut to its exact narration window. No third-party render queue
            can stall the last step of a paid video. */
      setStageLabel("Final cut: rendering…");
      const blob = await composeFinalCut({
        clipUrls: plan.shots.map((_, i) => shots[i].clipUrl!),
        windows: plan.shots.map((_, i) => { const w = lineWindow(i); return { start: w.start, dur: w.dur }; }),
        audioUrl: narration.audioUrl,
        onProgress: (p, l) => setStageLabel(`Final cut: ${l} ${Math.round(p)}%`),
      });

      /* f) save the film permanently (direct browser → storage upload). Uploaded
            with a long cache-control so repeat views load from the browser cache
            instantly instead of re-downloading (Supabase otherwise serves
            no-cache). */
      setStageLabel("Saving the film…");
      const uu = await fetch("/api/vlab/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: video.id }) });
      const ud = (await uu.json()) as { token?: string; path?: string; publicUrl?: string; error?: string };
      if (!uu.ok || !ud.token || !ud.path || !ud.publicUrl) throw new Error(ud.error || "upload url failed");
      const { error: upErr } = await getSupabaseBrowser().storage.from("vlab").uploadToSignedUrl(ud.path, ud.token, blob, { contentType: "video/mp4", cacheControl: "31536000", upsert: true });
      if (upErr) throw new Error(`upload failed (${upErr.message})`);
      await save({ finalUrl: ud.publicUrl, storageUrl: ud.publicUrl, status: "done" });
      setStageLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "production failed");
      await save({ shots, status: "failed" }); // keep every paid asset
      setStageLabel("");
    } finally {
      running.current = false;
      setProducingId(null);
    }
  };

  const removeVideo = async (id: string) => {
    if (!confirm("Delete this video and its screenplay?")) return;
    const r = await fetch(`/api/vlab/videos/${id}`, { method: "DELETE" });
    if (r.ok) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
      if (selectedId === id) setSelectedId(null);
    }
  };

  /* ── gate screens ── */
  if (gate === "loading") {
    return <div className="grid min-h-dvh place-items-center" style={{ background: C.bg, ...DOT_GRID }}><span className="inline-flex items-center gap-2 text-[13px]" style={{ color: C.muted }}><Loader2 size={15} className="animate-spin" style={{ color: C.accent }} /> Opening the studio…</span></div>;
  }
  if (gate !== "ready") {
    const meta = {
      signin: { icon: ShieldAlert, title: "Sign in to use VLAB", body: "Sign in from the Clunoid home page, then come back." },
      restricted: { icon: ShieldAlert, title: "VLAB is restricted", body: "This studio isn't available on your account." },
      unconfigured: { icon: KeyRound, title: "Add the fal.ai key", body: "Set FAL_KEY in the environment to enable video production." },
    }[gate];
    const I = meta.icon;
    return (
      <div className="grid min-h-dvh place-items-center px-6" style={{ background: C.bg, ...DOT_GRID }}>
        <div className="max-w-md text-center">
          <I size={34} className="mx-auto mb-4" style={{ color: C.faint }} />
          <h1 className="text-[19px] font-semibold" style={{ color: C.text }}>{meta.title}</h1>
          <p className="mt-2 text-[13.5px]" style={{ color: C.muted }}>{meta.body}</p>
          <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-semibold" style={{ background: C.accent, color: C.ink }}>
            <ArrowLeft size={15} /> Back to Clunoid
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: C.bg, ...DOT_GRID }}>
      {/* header */}
      <header className="sticky top-0 z-20 border-b backdrop-blur-md" style={{ borderColor: C.line, background: "rgba(8,17,28,0.85)" }}>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-1.5 text-[13px] font-medium hover:opacity-80" style={{ color: C.muted }}>
            <ArrowLeft size={15} /> Clunoid
          </Link>
          <span className="h-4 w-px" style={{ background: C.line }} />
          <span className="flex items-center gap-2 text-[13px] font-bold tracking-[0.22em]" style={{ color: C.text }}>
            <Clapperboard size={15} style={{ color: C.accent }} /> VLAB STUDIO
          </span>
          {producingId && (
            <span className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11.5px] font-semibold" style={{ background: C.accentDim, color: C.accent }}>
              <Loader2 size={11} className="animate-spin" /> {stageLabel || "Producing…"}
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        {/* left rail — history */}
        <aside className="w-full shrink-0 space-y-3 lg:w-[300px]">
          <button
            onClick={() => setSelectedId(null)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold hover:opacity-90"
            style={{ background: selectedId === null ? C.accent : C.accentDim, color: selectedId === null ? C.ink : C.accent }}
          >
            <Plus size={15} /> New video
          </button>
          <div className="rounded-2xl border p-3" style={{ borderColor: C.line, background: C.rail }}>
            <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}>Your videos · {videos.length}</h3>
            {videos.length === 0 ? (
              <p className="px-1 pb-1 text-[12.5px]" style={{ color: C.faint }}>Write your first screenplay — production is a separate, priced step.</p>
            ) : (
              <div className="max-h-[30dvh] space-y-1 overflow-y-auto lg:max-h-[70dvh]">
                {videos.map((v) => {
                  const active = v.id === selectedId;
                  const sc = v.status === "done" ? C.good : v.status === "failed" ? C.bad : v.status === "producing" ? C.accent : C.muted;
                  return (
                    <button key={v.id} onClick={() => setSelectedId(v.id)} className="block w-full rounded-xl border p-2.5 text-left" style={{ borderColor: active ? C.accent : "transparent", background: active ? C.panelHi : "transparent" }}>
                      <span className="block truncate text-[13px] font-semibold" style={{ color: C.text }}>{v.title || v.topic}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: C.faint }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: sc }} /> {v.status} · {String(v.created_at).slice(0, 10)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1">
          {!selected ? (
            <NewVideo topic={topic} setTopic={setTopic} writing={writing} error={error} onWrite={() => void writeScreenplay(topic.trim())} />
          ) : (
            <VideoView
              video={selected}
              producing={producingId === selected.id}
              stageLabel={stageLabel}
              error={producingId === selected.id || selected.status === "failed" ? error : null}
              onProduce={() => void produce(selected)}
              onRewrite={() => void writeScreenplay(selected.topic)}
              writing={writing}
              onDelete={() => void removeVideo(selected.id)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── new-video hero ───────────────────────────────────────────────────────── */
function NewVideo({ topic, setTopic, writing, error, onWrite }: { topic: string; setTopic: (t: string) => void; writing: boolean; error: string | null; onWrite: () => void }) {
  return (
    <div className="mx-auto max-w-2xl pt-4 sm:pt-10">
      <div className="mb-6 text-center">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ borderColor: C.line, color: C.accent }}>
          <Sparkles size={12} /> story-complete · consistent · narration-timed
        </span>
        <h1 className="text-[26px] font-bold leading-tight sm:text-[32px]" style={{ color: C.text }}>What should the video explain?</h1>
        <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed" style={{ color: C.muted }}>
          Opus writes the complete story first — real-world opening, the true mechanism beat by beat, and the payoff —
          then a second pass corrects it. You review the screenplay and the exact price before a cent of video is generated.
        </p>
      </div>
      <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.line, background: C.panel }}>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={2}
          placeholder="e.g. What happens inside your throat when you swallow gum"
          className="w-full resize-y rounded-xl border bg-transparent p-3.5 text-[14px] leading-relaxed outline-none focus:border-white/25"
          style={{ borderColor: C.line, color: C.text }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {EXAMPLES.map((x) => (
            <button key={x} onClick={() => setTopic(x)} className="rounded-full border px-2.5 py-1 text-[11px] hover:bg-white/5" style={{ borderColor: C.line, color: C.faint }}>{x}</button>
          ))}
          <button onClick={onWrite} disabled={writing || topic.trim().length < 8} className="ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold hover:opacity-90 disabled:opacity-50" style={{ background: C.accent, color: C.ink }}>
            {writing ? <Loader2 size={15} className="animate-spin" /> : <ScrollText size={15} />} {writing ? "Writing + reviewing the screenplay…" : "Write the screenplay"}
          </button>
        </div>
        {error && <p className="mt-3 text-[12.5px]" style={{ color: C.bad }}>{error}</p>}
      </div>
    </div>
  );
}

/* ── one video: screenplay review → production → final film ─────────────── */
function VideoView({ video, producing, stageLabel, error, onProduce, onRewrite, writing, onDelete }: {
  video: VideoRow; producing: boolean; stageLabel: string; error: string | null;
  onProduce: () => void; onRewrite: () => void; writing: boolean; onDelete: () => void;
}) {
  const plan = video.plan;
  if (!plan) return <p className="p-8 text-[13px]" style={{ color: C.faint }}>No screenplay on this video.</p>;
  const cost = estimateCost(plan);
  const shots: ShotAsset[] = Array.isArray(video.shots) ? video.shots : [];
  const finalSrc = video.storage_url || video.final_url;

  return (
    <div className="space-y-4">
      {/* headline */}
      <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.line, background: C.panelHi }}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold leading-tight" style={{ color: C.text }}>{plan.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.muted }}>{plan.logline}</p>
          </div>
          <button onClick={onDelete} className="rounded-lg border p-2 hover:bg-white/5" style={{ borderColor: C.line, color: C.faint }} title="Delete video">
            <Trash2 size={14} />
          </button>
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl border p-3" style={{ borderColor: C.line }}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.faint }}><User size={11} style={{ color: C.accent }} /> Character sheet</div>
            <p className="text-[12.5px] leading-relaxed" style={{ color: C.muted }}>{plan.characterSheet}</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: C.line }}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.faint }}><Globe2 size={11} style={{ color: C.accent }} /> World &amp; light</div>
            <p className="text-[12.5px] leading-relaxed" style={{ color: C.muted }}>{plan.worldNote}</p>
          </div>
        </div>
      </section>

      {/* the finished film — fetched to a local blob for smooth playback + titled download */}
      {finalSrc && <FilmPlayer src={finalSrc} title={plan.title} />}

      {/* production CTA / progress */}
      {!finalSrc && (
        <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.line, background: C.panel }}>
          {producing ? (
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
              <div>
                <div className="text-[13.5px] font-semibold" style={{ color: C.text }}>{stageLabel || "Producing…"}</div>
                <div className="text-[12px]" style={{ color: C.faint }}>Everything is saved as it completes — a refresh loses nothing.</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: C.text }}>
                  <CircleDollarSign size={15} style={{ color: C.accent }} /> Estimated production cost: ~${cost.toFixed(2)}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: C.faint }}>
                  {plan.shots.length} shots · character sheet + consistency-chained keyframes · narration-timed clips · final cut.
                  {video.status === "failed" && " Finished assets from the failed run are kept — producing again resumes, not restarts."}
                </p>
              </div>
              <button onClick={onRewrite} disabled={writing} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-medium hover:bg-white/5 disabled:opacity-50" style={{ borderColor: C.line, color: C.muted }}>
                {writing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} New screenplay
              </button>
              <button onClick={onProduce} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold hover:opacity-90" style={{ background: C.accent, color: C.ink }}>
                <Wand2 size={15} /> {video.status === "failed" ? "Resume production" : "Produce the video"}
              </button>
            </div>
          )}
          {error && <p className="mt-3 text-[12.5px]" style={{ color: C.bad }}>{error}</p>}
        </section>
      )}

      {/* storyboard */}
      <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.line, background: C.panel }}>
        <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}>
          <Film size={12} style={{ color: C.accent }} /> Storyboard · {plan.shots.length} shots
        </h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {plan.shots.map((s, i) => {
            const a = shots[i] || {};
            return (
              <div key={i} className="overflow-hidden rounded-xl border" style={{ borderColor: C.line, background: C.panelHi }}>
                <div className="relative aspect-[9/16] w-full" style={{ background: "rgba(255,255,255,0.03)" }}>
                  {a.clipUrl ? (
                    <video src={a.clipUrl} muted loop playsInline autoPlay className="h-full w-full object-cover" />
                  ) : a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imageUrl} alt={`shot ${i + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[11px]" style={{ color: C.faint }}>shot {i + 1}</div>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ ...mono, background: "rgba(0,0,0,0.65)", color: C.accent }}>{i + 1}</span>
                  {!s.sceneChange && i > 0 && (
                    <span className="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(0,0,0,0.65)", color: C.faint }} title="flows from the previous shot">
                      <ChevronRight size={9} className="inline" /> flow
                    </span>
                  )}
                </div>
                <div className="space-y-1 px-2 py-2">
                  <div className="flex items-start gap-1 text-[11px] leading-snug" style={{ color: C.text }}>
                    <Mic size={10} className="mt-0.5 shrink-0" style={{ color: C.accent }} /> {s.line}
                  </div>
                  <div className="text-[10px] leading-snug" style={{ color: C.faint }}>{s.motionPrompt}</div>
                </div>
              </div>
            );
          })}
        </div>
        {video.narration?.audioUrl && (
          <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: C.muted }}>
            <Mic size={13} style={{ color: C.accent }} /> Narration · {video.narration.seconds}s
            <audio src={video.narration.audioUrl} controls className="h-8 max-w-[260px]" />
          </div>
        )}
      </section>
    </div>
  );
}
