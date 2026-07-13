"use client";

/**
 * VLAB — the PILOT console for prompt → stylized-3D animated short (admin-only).
 *
 * Purpose: let the owner judge, on ~$5 of API spend per attempt, the real
 * quality ceiling of a fully-automated Zack-D-Films-STYLE pipeline (research
 * verdict on record: exact Zack quality = human Blender artists; this is the
 * closest honest approximation). The browser orchestrates the steps so no
 * serverless call runs long: Opus plan → Flux keyframes (style+seed locked) →
 * Kling 3 Pro image-to-video per shot → Isaac narration → ffmpeg compose.
 * All vendor calls go through /api/vlab/* (admin-gated; FAL_KEY stays server-side).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Download, Film, Image as ImageIcon, Loader2, Mic, Play, ShieldAlert, Sparkles, Wand2, KeyRound } from "lucide-react";
import { STYLE_BLOCK, type VlabPlan } from "@/lib/vlab/plan";

const C = {
  bg: "#0d0b08",
  panel: "rgba(255,255,255,0.03)",
  panelHi: "rgba(255,255,255,0.06)",
  line: "rgba(255,255,255,0.1)",
  text: "#f5f1ea",
  muted: "#a89f92",
  faint: "#6e675c",
  accent: "#f2a341", // director's amber
  accentDim: "rgba(242,163,65,0.14)",
  good: "#4ade80",
  bad: "#f87171",
};
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;

const FAL_MODELS = {
  image: "fal-ai/flux/dev",
  video: "fal-ai/kling-video/v3/pro/image-to-video",
  compose: "fal-ai/ffmpeg-api/compose",
} as const;

type ShotState = { imageUrl?: string; clipUrl?: string; imageBusy?: boolean; clipBusy?: boolean; error?: string };
type Stage = "idle" | "planning" | "keyframes" | "clips" | "narration" | "compose" | "done" | "error";

const EXAMPLES = [
  "What happens inside your throat when you swallow gum",
  "Why airplane windows are always round",
  "What would happen if you fell into a black hole",
];

async function falRun(model: string, input: unknown, onTick?: () => void): Promise<Record<string, unknown>> {
  const sub = await fetch("/api/vlab/fal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, input }) });
  const s = (await sub.json()) as { statusUrl?: string; responseUrl?: string; error?: string };
  if (!sub.ok || !s.statusUrl || !s.responseUrl) throw new Error(s.error || `submit failed (${sub.status})`);
  // poll until COMPLETED (Kling clips can take minutes)
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, i < 10 ? 2500 : 5000));
    onTick?.();
    const st = await fetch(`/api/vlab/fal?url=${encodeURIComponent(s.statusUrl)}`);
    const d = (await st.json()) as { status?: string; error?: string };
    if (d.status === "COMPLETED") break;
    if (d.status === "FAILED" || st.status >= 400) throw new Error(d.error || `generation ${d.status || st.status}`);
    if (i === 239) throw new Error("timed out waiting for generation");
  }
  const res = await fetch(`/api/vlab/fal?url=${encodeURIComponent(s.responseUrl)}`);
  const out = (await res.json()) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(out.error || "result fetch failed");
  return out;
}

export function VlabConsole() {
  const [topic, setTopic] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<VlabPlan | null>(null);
  const [shots, setShots] = useState<ShotState[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const running = useRef(false);

  const say = useCallback((m: string) => setLog((l) => [...l.slice(-30), m]), []);
  const setShot = useCallback((i: number, patch: ShotState) => setShots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s))), []);

  /* on-load gate probe so key/access state shows before any click */
  useEffect(() => {
    let dead = false;
    void fetch("/api/vlab/plan").then((r) => {
      if (dead || r.ok) return;
      setGateMsg(r.status === 401 ? "signin" : r.status === 403 ? "restricted" : r.status === 501 ? "unconfigured" : null);
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setGateMsg(null);
    setPlan(null);
    setShots([]);
    setAudioUrl(null);
    setFinalUrl(null);
    setLog([]);
    try {
      /* 1 — the plan (Opus) */
      setStage("planning");
      say("Opus is writing the script and shot list…");
      const pr = await fetch("/api/vlab/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic }) });
      if (pr.status === 401) { setGateMsg("signin"); setStage("idle"); return; }
      if (pr.status === 403) { setGateMsg("restricted"); setStage("idle"); return; }
      if (pr.status === 501) { setGateMsg("unconfigured"); setStage("idle"); return; }
      const pd = (await pr.json()) as { plan?: VlabPlan; error?: string };
      if (!pr.ok || !pd.plan) throw new Error(pd.error || "planning failed");
      const p = pd.plan;
      setPlan(p);
      setShots(p.shots.map(() => ({})));
      say(`Plan ready: “${p.title}” — ${p.shots.length} shots.`);

      /* 2 — keyframes (Flux, style + seed locked, parallel) */
      setStage("keyframes");
      const seed = Math.floor(Math.random() * 1_000_000); // one seed for the whole video = consistent look
      say(`Generating ${p.shots.length} style-locked keyframes (seed ${seed})…`);
      const imageUrls = await Promise.all(
        p.shots.map(async (shot, i) => {
          setShot(i, { imageBusy: true });
          try {
            const out = await falRun(FAL_MODELS.image, {
              prompt: `${shot.imagePrompt}, ${STYLE_BLOCK}`,
              image_size: "portrait_16_9",
              seed,
              num_images: 1,
              output_format: "jpeg",
            });
            const url = (out.images as { url?: string }[] | undefined)?.[0]?.url;
            if (!url) throw new Error("no image returned");
            setShot(i, { imageBusy: false, imageUrl: url });
            return url;
          } catch (e) {
            setShot(i, { imageBusy: false, error: e instanceof Error ? e.message : "image failed" });
            throw e;
          }
        })
      );

      /* 3 — clips (Kling 3 Pro image-to-video, parallel; the slow, costly step) */
      setStage("clips");
      say("Animating each keyframe with Kling 3 Pro (this takes a few minutes)…");
      const clipUrls = await Promise.all(
        p.shots.map(async (shot, i) => {
          setShot(i, { clipBusy: true });
          try {
            const out = await falRun(FAL_MODELS.video, {
              start_image_url: imageUrls[i],
              prompt: `${shot.motionPrompt}. Smooth, cinematic, stylized 3D animation.`,
              duration: String(Math.min(8, Math.max(5, Math.round(shot.seconds)))),
              generate_audio: false,
              negative_prompt: "blur, distortion, low quality, text, watermark, morphing, extra limbs",
            });
            const url = (out.video as { url?: string } | undefined)?.url;
            if (!url) throw new Error("no clip returned");
            setShot(i, { clipBusy: false, clipUrl: url });
            return url;
          } catch (e) {
            setShot(i, { clipBusy: false, error: e instanceof Error ? e.message : "clip failed" });
            throw e;
          }
        })
      );

      /* 4 — narration (Isaac) */
      setStage("narration");
      say("Isaac is recording the narration…");
      const script = p.shots.map((s) => s.line).join(" ");
      const nr = await fetch("/api/vlab/narrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: script }) });
      const nd = (await nr.json()) as { audioUrl?: string; seconds?: number; error?: string };
      if (!nr.ok || !nd.audioUrl) throw new Error(nd.error || "narration failed");
      setAudioUrl(nd.audioUrl);
      say(`Narration: ${nd.seconds}s of audio.`);

      /* 5 — compose (ffmpeg: clips back-to-back + narration on top) */
      setStage("compose");
      say("Stitching the final video…");
      let t = 0;
      const videoKeyframes = p.shots.map((s, i) => {
        const durMs = Math.min(8, Math.max(5, Math.round(s.seconds))) * 1000;
        const kf = { timestamp: t, duration: durMs, url: clipUrls[i] };
        t += durMs;
        return kf;
      });
      const out = await falRun(FAL_MODELS.compose, {
        tracks: [
          { id: "video", type: "video", keyframes: videoKeyframes },
          { id: "vo", type: "audio", keyframes: [{ timestamp: 0, duration: Math.round((nd.seconds || t / 1000) * 1000), url: nd.audioUrl }] },
        ],
      });
      const final = (out.video_url as string | undefined) || (out.video as { url?: string } | undefined)?.url;
      if (!final) throw new Error("compose returned no video");
      setFinalUrl(final);
      setStage("done");
      say("Done. Judge it honestly — that's the point of the pilot.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "pipeline failed");
      setStage("error");
    } finally {
      running.current = false;
    }
  };

  const busy = stage !== "idle" && stage !== "done" && stage !== "error";

  return (
    <div className="min-h-dvh" style={{ background: C.bg }}>
      <header className="sticky top-0 z-20 border-b backdrop-blur-md" style={{ borderColor: C.line, background: "rgba(13,11,8,0.85)" }}>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-1.5 text-[13px] font-medium hover:opacity-80" style={{ color: C.muted }}>
            <ArrowLeft size={15} /> Clunoid
          </Link>
          <span className="h-4 w-px" style={{ background: C.line }} />
          <span className="flex items-center gap-2 text-[13px] font-bold tracking-[0.22em]" style={{ color: C.text }}>
            <Clapperboard size={15} style={{ color: C.accent }} /> VLAB <span className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider" style={{ background: C.accentDim, color: C.accent }}>PILOT</span>
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* gate states */}
        {gateMsg === "signin" && <Gate icon={ShieldAlert} title="Sign in to use VLAB" body="Sign in from the Clunoid home page, then come back." />}
        {gateMsg === "restricted" && <Gate icon={ShieldAlert} title="VLAB is restricted" body="This pilot isn't available on your account." />}
        {gateMsg === "unconfigured" && (
          <Gate icon={KeyRound} title="Add the fal.ai key to start" body="Create an account at fal.ai, add a small credit, create an API key, and set FAL_KEY in the environment (local .env and Vercel). Then generate your first test video here." />
        )}

        {/* intake */}
        <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.line, background: C.panel }}>
          <h1 className="mb-1 text-[17px] font-bold" style={{ color: C.text }}>Prompt → 3D-animated short</h1>
          <p className="mb-3 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
            Quality pilot: Opus directs, Flux draws the keyframes, Kling 3 Pro animates, Isaac narrates. ~$4–6 per attempt.
            The goal is an honest verdict on the ceiling — not a promise.
          </p>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="e.g. What happens inside your throat when you swallow gum"
            className="w-full resize-y rounded-xl border bg-transparent p-3 text-[13.5px] leading-relaxed outline-none focus:border-white/25"
            style={{ borderColor: C.line, color: C.text }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {EXAMPLES.map((x) => (
              <button key={x} onClick={() => setTopic(x)} className="rounded-full border px-2.5 py-1 text-[11px] hover:bg-white/5" style={{ borderColor: C.line, color: C.faint }}>
                {x}
              </button>
            ))}
            <button
              onClick={() => void run()}
              disabled={busy || topic.trim().length < 8}
              className="ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-semibold hover:opacity-90 disabled:opacity-50"
              style={{ background: C.accent, color: "#0d0b08" }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} {busy ? "Producing…" : "Generate test video"}
            </button>
          </div>
        </section>

        {/* pipeline progress */}
        {stage !== "idle" && (
          <section className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.line, background: C.panel }}>
            <div className="mb-3 flex flex-wrap gap-2">
              {([["planning", "Script", Sparkles], ["keyframes", "Keyframes", ImageIcon], ["clips", "Animation", Film], ["narration", "Narration", Mic], ["compose", "Final cut", Play]] as const).map(([key, label, I]) => {
                const order = ["planning", "keyframes", "clips", "narration", "compose", "done"];
                const active = stage === key;
                const passed = order.indexOf(stage) > order.indexOf(key);
                return (
                  <span key={key} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium" style={{ background: active ? C.accentDim : "transparent", color: passed ? C.good : active ? C.accent : C.faint }}>
                    {active ? <Loader2 size={12} className="animate-spin" /> : <I size={12} />} {label}
                  </span>
                );
              })}
            </div>

            {plan && (
              <div className="mb-3 rounded-xl border p-3" style={{ borderColor: C.line }}>
                <div className="text-[14px] font-bold" style={{ color: C.text }}>{plan.title}</div>
                {plan.characterNote && <div className="mt-0.5 text-[11.5px]" style={{ color: C.faint }}>Recurring character: {plan.characterNote}</div>}
              </div>
            )}

            {plan && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {plan.shots.map((s, i) => {
                  const st = shots[i] || {};
                  return (
                    <div key={i} className="overflow-hidden rounded-xl border" style={{ borderColor: st.error ? C.bad : C.line, background: C.panelHi }}>
                      <div className="relative aspect-[9/16] w-full" style={{ background: "rgba(255,255,255,0.03)" }}>
                        {st.clipUrl ? (
                          <video src={st.clipUrl} muted loop playsInline autoPlay className="h-full w-full object-cover" />
                        ) : st.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={st.imageUrl} alt={`shot ${i + 1}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center">
                            {st.imageBusy || st.clipBusy ? <Loader2 size={16} className="animate-spin" style={{ color: C.accent }} /> : <span className="text-[11px]" style={{ color: C.faint }}>shot {i + 1}</span>}
                          </div>
                        )}
                        {st.clipBusy && st.imageUrl && (
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1 text-[10px]" style={{ color: C.accent }}>
                            <Loader2 size={10} className="animate-spin" /> animating
                          </span>
                        )}
                      </div>
                      <div className="px-2 py-1.5 text-[10.5px] leading-snug" style={{ color: C.muted }}>{s.line}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {audioUrl && (
              <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: C.muted }}>
                <Mic size={13} style={{ color: C.accent }} /> Narration ready <audio src={audioUrl} controls className="h-8 max-w-[260px]" />
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.08)", color: C.bad }}>
                {error} — generations you already paid for stay visible above; run again to retry.
              </div>
            )}

            <div className="mt-3 space-y-0.5">
              {log.slice(-4).map((l, i) => (
                <div key={i} className="text-[11px]" style={{ ...mono, color: C.faint }}>{l}</div>
              ))}
            </div>
          </section>
        )}

        {/* the final video */}
        {finalUrl && (
          <section className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.accent, background: C.panel }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[14px] font-bold" style={{ color: C.text }}>
                <Play size={15} style={{ color: C.accent }} /> The verdict video
              </h2>
              <a href={finalUrl} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium hover:bg-white/5" style={{ borderColor: C.line, color: C.muted }}>
                <Download size={13} /> Download MP4
              </a>
            </div>
            <video src={finalUrl} controls playsInline className="mx-auto aspect-[9/16] w-full max-w-[320px] rounded-xl border" style={{ borderColor: C.line, background: "#000" }} />
          </section>
        )}
      </div>
    </div>
  );
}

function Gate({ icon: I, title, body }: { icon: typeof ShieldAlert; title: string; body: string }) {
  return (
    <div className="mb-4 rounded-2xl border p-4" style={{ borderColor: "rgba(242,163,65,0.4)", background: "rgba(242,163,65,0.07)" }}>
      <div className="flex items-start gap-3">
        <I size={18} style={{ color: C.accent }} className="mt-0.5 shrink-0" />
        <div>
          <div className="text-[13.5px] font-semibold" style={{ color: C.text }}>{title}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>{body}</p>
        </div>
      </div>
    </div>
  );
}
