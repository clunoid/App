"use client";

/**
 * Edge Video Studio — prompt one or more matchups, and two premium AI voices
 * (Isaac asks, Matilda answers) deliver the predictions in a short, media-rich
 * video. Both a vertical (9:16) and a wide (16:9) cut are encoded from ONE set of
 * voiced audio, so the premium voices are used once. Saved to history.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Clapperboard, Download, Sparkles, Film, Trash2, Play } from "lucide-react";
import { renderEdgeVideos } from "@/lib/edge/video";
import { saveEdgeVideo, listEdgeVideos, loadEdgeVideoBlobs, deleteEdgeVideo, type SavedEdgeVideo } from "@/lib/edge/video-store";
import type { VideoPlan } from "@/lib/edge/video-types";

const C = { line: "rgba(255,255,255,0.09)", panel: "rgba(255,255,255,0.026)", panelHi: "rgba(255,255,255,0.05)", text: "#f3f6f4", muted: "#9aa5a0", faint: "#626d68", accent: "#34d399", blue: "#7dd3fc", amber: "#fbbf24", red: "#f87171" };
const mono = { fontFamily: "var(--edge-mono), ui-monospace, monospace" } as const;

const EXAMPLES = ["France vs Morocco", "Argentina vs Brazil, and Spain vs Germany", "Who wins Lakers vs Celtics tonight", "Man City vs Arsenal + Real Madrid vs Barcelona"];

type Phase = "idle" | "planning" | "rendering" | "done" | "error";
type Vids = { portraitUrl?: string; landscapeUrl?: string };

export function EdgeVideoStudio({ onStatus }: { onStatus?: (s: { busy: boolean; pct: number; label: string }) => void } = {}) {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ pct: 0, label: "" });
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [vids, setVids] = useState<Vids>({});
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedEdgeVideo[]>([]);
  const urlsRef = useRef<string[]>([]);

  const revoke = () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); urlsRef.current = []; };
  useEffect(() => () => revoke(), []);
  useEffect(() => { void listEdgeVideos().then(setHistory); }, []);
  // report progress up so the render can keep running (and show a chip) even when
  // the user switches to Analyse mode — encoding continues in the background
  useEffect(() => {
    const busy = phase === "planning" || phase === "rendering";
    onStatus?.({ busy, pct: phase === "planning" ? 8 : progress.pct, label: progress.label || (phase === "planning" ? "Predicting…" : "Rendering…") });
  }, [phase, progress, onStatus]);

  const show = (portrait?: Blob, landscape?: Blob) => {
    revoke();
    const next: Vids = {};
    if (portrait) { const u = URL.createObjectURL(portrait); urlsRef.current.push(u); next.portraitUrl = u; }
    if (landscape) { const u = URL.createObjectURL(landscape); urlsRef.current.push(u); next.landscapeUrl = u; }
    setVids(next);
  };

  const generate = useCallback(async (p: string) => {
    const q = p.trim();
    if (!q || phase === "planning" || phase === "rendering") return;
    setPrompt(q);
    setErr(null);
    setVids({});
    setPlan(null);
    setPhase("planning");
    setProgress({ pct: 0, label: "Predicting the matches…" });
    try {
      const res = await fetch("/api/edge/video/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: q }) });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Couldn't plan the video."); setPhase("error"); return; }
      const pl = d.plan as VideoPlan;
      setPlan(pl);
      setPhase("rendering");
      const out = await renderEdgeVideos(pl, { onProgress: (pct, label) => setProgress({ pct, label }) });
      show(out.portrait, out.landscape);
      setPhase("done");
      const id = await saveEdgeVideo({ prompt: q, plan: pl }, { portrait: out.portrait, landscape: out.landscape });
      if (id) void listEdgeVideos().then(setHistory);
    } catch (e) {
      const msg = (e as Error)?.name === "FriendlyError" ? (e as Error).message : "Video generation failed — try again.";
      setErr(msg);
      setPhase("error");
    }
  }, [phase]);

  const openHistory = useCallback(async (v: SavedEdgeVideo) => {
    setPlan(v.data.plan);
    setPrompt(v.data.prompt);
    setErr(null);
    const blobs = await loadEdgeVideoBlobs(v.id);
    if (blobs?.portrait || blobs?.landscape) { show(blobs.portrait, blobs.landscape); setPhase("done"); }
    else { setErr("This video's files aren't cached on this device — regenerate to watch it here."); setVids({}); setPhase("idle"); }
  }, []);

  const busy = phase === "planning" || phase === "rendering";

  const dl = (url: string, name: string) => { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); };

  return (
    <div className="space-y-6">
      {/* composer */}
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
          <Clapperboard size={26} style={{ color: C.accent }} /> Prediction videos
        </h1>
        <p className="mt-2 max-w-2xl text-[14px]" style={{ color: C.muted }}>
          Name the matches. Two premium AI voices — Isaac asks, Matilda calls it — deliver the predictions over live sport media. You get a <b style={{ color: C.text }}>vertical</b> and a <b style={{ color: C.text }}>wide</b> cut, both from one voiced take.
        </p>
        <div className="mt-4 flex items-stretch gap-2.5">
          <div className="flex flex-1 items-center rounded-full border px-4" style={{ borderColor: C.line, background: C.panelHi }}>
            <Film size={17} className="shrink-0" style={{ color: C.accent }} />
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void generate(prompt); } }} placeholder="France vs Morocco, and Brazil vs Argentina…" disabled={busy} className="w-full bg-transparent px-3 py-3.5 text-[15px] outline-none placeholder:text-white/25 disabled:opacity-60" style={{ color: C.text }} />
          </div>
          <button type="button" onClick={() => void generate(prompt)} disabled={busy || !prompt.trim()} className="flex shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-bold transition hover:brightness-110 disabled:opacity-40" style={{ background: C.accent, color: "#0a0c0d" }}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}<span className="hidden sm:inline">Generate</span>
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => void generate(ex)} disabled={busy} className="rounded-full border px-3 py-1.5 text-[12px] transition hover:border-white/25 hover:text-white disabled:opacity-50" style={{ borderColor: C.line, color: C.muted }}>{ex}</button>)}
        </div>
      </div>

      {err && <p className="rounded-xl border px-4 py-2.5 text-[12.5px]" style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: C.red }}>{err}</p>}

      {/* progress */}
      {busy && (
        <div className="rounded-2xl border p-5" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex items-center gap-2.5 text-[13px]" style={{ color: C.text }}><Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />{progress.label || (phase === "planning" ? "Predicting…" : "Rendering…")}</div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${phase === "planning" ? 8 : progress.pct}%`, background: C.accent }} /></div>
          {plan && <div className="mt-3 flex flex-wrap gap-1.5">{plan.matches.map((m, i) => <span key={i} className="rounded-full px-2 py-0.5 text-[10.5px]" style={{ ...mono, color: C.muted, background: "rgba(255,255,255,0.05)" }}>{m.home} v {m.away} → {m.winner} {(m.winnerProb * 100).toFixed(0)}%</span>)}</div>}
          <p className="mt-3 text-[11px]" style={{ color: C.faint }}>Encoding both aspect ratios from one voiced take — the premium voices are used once.</p>
        </div>
      )}

      {/* results */}
      {phase === "done" && (vids.portraitUrl || vids.landscapeUrl) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {vids.portraitUrl && (
            <div className="rounded-2xl border p-4" style={{ borderColor: C.line, background: C.panel }}>
              <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}>Vertical · 9:16</span><button type="button" onClick={() => dl(vids.portraitUrl!, `${(plan?.title || "edge").replace(/\W+/g, "-")}-vertical.mp4`)} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:border-white/25" style={{ borderColor: C.line, color: C.accent }}><Download size={12} /> Save</button></div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={vids.portraitUrl} controls playsInline className="mx-auto max-h-[70vh] rounded-xl" style={{ aspectRatio: "9/16", background: "#000" }} />
            </div>
          )}
          {vids.landscapeUrl && (
            <div className="rounded-2xl border p-4" style={{ borderColor: C.line, background: C.panel }}>
              <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}>Wide · 16:9</span><button type="button" onClick={() => dl(vids.landscapeUrl!, `${(plan?.title || "edge").replace(/\W+/g, "-")}-wide.mp4`)} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:border-white/25" style={{ borderColor: C.line, color: C.accent }}><Download size={12} /> Save</button></div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={vids.landscapeUrl} controls playsInline className="w-full rounded-xl" style={{ aspectRatio: "16/9", background: "#000" }} />
            </div>
          )}
        </div>
      )}

      {/* history */}
      {history.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}><Film size={13} /> Your videos</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((v) => (
              <div key={v.id} className="flex items-center gap-2 rounded-xl border p-3" style={{ borderColor: C.line, background: C.panel }}>
                <button type="button" onClick={() => void openHistory(v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <Play size={15} className="shrink-0" style={{ color: C.accent }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: C.text }}>{v.title}</span>
                </button>
                <button type="button" onClick={async () => { await deleteEdgeVideo(v.id); void listEdgeVideos().then(setHistory); }} className="shrink-0 transition hover:text-red-400" style={{ color: C.faint }} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
