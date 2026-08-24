"use client";

/**
 * CREATOR PROGRAM — the nudge to hit record.
 *
 * The bot runs for a couple of minutes and then it is over. People open it,
 * watch the whole thing, and only then think "I should have been recording".
 * So it asks first.
 *
 * On what it can and cannot do: a web page cannot press the record button on
 * somebody's phone — no browser gives a site that power, and pretending
 * otherwise would just waste the creator's time. What it does instead is offer
 * the one thing browsers do allow, a real screen capture on desktop, and give
 * exact instructions for the built-in recorder everywhere else.
 */

import { useEffect, useRef, useState } from "react";
import { Video, X, Check, Smartphone, Monitor, Square, Download } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { GOOD, A } from "./content";

type Platform = "ios" | "android" | "desktop";

function detect(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

const HOW: Record<Platform, { icon: typeof Smartphone; title: string; steps: string[] }> = {
  ios: {
    icon: Smartphone,
    title: "On iPhone or iPad",
    steps: [
      "Swipe down from the top-right corner to open Control Centre.",
      "Tap the record button — the circle inside a circle.",
      "Wait for the 3-second countdown, then come back here.",
      "When you are done, tap the red time in the corner and stop.",
    ],
  },
  android: {
    icon: Smartphone,
    title: "On Android",
    steps: [
      "Swipe down twice from the top to open Quick Settings.",
      "Tap Screen record. Choose to record audio if you want to talk over it live.",
      "Tap Start, then come back here.",
      "Stop it from the notification shade when you are done.",
    ],
  },
  desktop: {
    icon: Monitor,
    title: "On a computer",
    steps: [
      "Use the button below to record this tab right here in the browser.",
      "Or use your own recorder — Windows: Win + Alt + R. Mac: Shift + Cmd + 5.",
      "Pick this tab or window when the browser asks what to share.",
    ],
  },
};

export function ScreenRecordPrompt({ onClose }: { onClose: () => void }) {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [recording, setRecording] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => setPlatform(detect()), []);

  // Only desktop browsers will hand a page a screen capture. Everywhere else the
  // instructions are the answer.
  const canCapture =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* already stopped */ } }, []);

  async function startCapture() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || "video/webm" });
        setSaved(URL.createObjectURL(blob));
        setRecording(false);
      };
      // If they stop sharing from the browser's own bar, wrap up properly.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { try { rec.stop(); } catch { /* done */ } });

      rec.start();
      setRecording(true);
      onClose();
    } catch {
      setErr("Your browser would not share the screen. Use your own recorder instead.");
    }
  }

  function stopCapture() {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }

  // Recording in progress: get out of the way, leave one small stop control.
  if (recording) {
    return (
      <button type="button" onClick={stopCapture}
        className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2.5 text-[13px] font-bold shadow-2xl"
        style={{ background: "#f2607d", color: "#fff" }}>
        <span className="inline-flex items-center gap-2"><Square size={13} /> Stop recording</span>
      </button>
    );
  }

  if (saved) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 shadow-2xl"
        style={{ background: "#0f2a20", boxShadow: `0 10px 34px rgba(0,0,0,.55), inset 0 0 0 1px ${GOOD}66` }}>
        <Check size={15} style={{ color: GOOD }} />
        <span className="text-[12.5px]" style={{ color: TC.text }}>Recording ready.</span>
        <a href={saved} download={`clunoid-practice-${Math.random().toString(36).slice(2, 8)}.webm`}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"
          style={{ background: GOOD, color: "#06231a" }}>
          <Download size={13} /> Save it
        </a>
        <button type="button" onClick={() => setSaved(null)} aria-label="Dismiss" className="rounded-lg p-1" style={{ color: TC.faint }}>
          <X size={14} />
        </button>
      </div>
    );
  }

  const how = HOW[platform];
  const Icon = how.icon;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rec-title"
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: "rgba(4,10,20,0.74)", backdropFilter: "blur(3px)" }}>
      <div className="relative w-full max-w-[440px] rounded-2xl border p-5"
        style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-lg p-1 transition hover:bg-white/10" style={{ color: TC.faint }}>
          <X size={16} />
        </button>

        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${A}22` }}>
          <Video size={20} style={{ color: A }} />
        </span>
        <h3 id="rec-title" className="mt-3 text-[20px] font-bold tracking-tight">Recording this?</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Start your screen recorder <b style={{ color: TC.text }}>before</b> you press Start on the bot. The run
          only lasts a couple of minutes, and there is no way to get it back afterwards.
        </p>

        <div className="mt-3.5 rounded-xl border p-3" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: A }}>
            <Icon size={13} /> {how.title}
          </div>
          <ol className="mt-2 space-y-1.5">
            {how.steps.map((t, i) => (
              <li key={t} className="flex gap-2 text-[12px] leading-snug" style={{ color: TC.muted }}>
                <span className="shrink-0 font-bold" style={{ color: TC.faint }}>{i + 1}.</span> {t}
              </li>
            ))}
          </ol>
        </div>

        {err && <p className="mt-3 text-[12px] font-medium" style={{ color: "#f2607d" }}>{err}</p>}

        <div className="mt-4 grid gap-2">
          {canCapture && (
            <button type="button" onClick={startCapture}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90"
              style={{ background: GOOD, color: "#06231a" }}>
              <Video size={15} /> Record this tab for me
            </button>
          )}
          <button type="button" onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-white/5"
            style={{ background: canCapture ? "rgba(255,255,255,0.07)" : GOOD, color: canCapture ? TC.text : "#06231a" }}>
            <Check size={15} /> My recorder is running
          </button>
          <button type="button" onClick={onClose}
            className="text-[12px] font-medium transition hover:opacity-80" style={{ color: TC.faint }}>
            Not recording — just having a look
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          A website cannot press record on your phone for you, so on mobile the steps above are the way. On a
          computer the green button captures this tab and hands you the file.
        </p>
      </div>
    </div>
  );
}
