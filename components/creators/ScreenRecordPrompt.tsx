"use client";

/**
 * CREATOR PROGRAM — the nudge to hit record.
 *
 * The bot runs for a couple of minutes and then it is over. People open it,
 * watch the whole thing, and only then think "I should have been recording".
 * So it asks first.
 *
 * It only tells them how. Every device already has a screen recorder that is
 * better than anything a web page could offer — the phone ones capture the whole
 * screen in one tap, and the desktop ones let you crop to just the part you want,
 * which is exactly what you need here. So this detects the device and gives the
 * shortcut for it, rather than putting a button in the way.
 */

import { useEffect, useState } from "react";
import { Video, X, Check, Smartphone, Monitor, Crop } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { GOOD, A } from "./content";

type Device = "ios" | "android" | "windows" | "mac" | "desktop";

function detect(): Device {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  return "desktop";
}

const HOW: Record<Device, { icon: typeof Smartphone; title: string; steps: string[]; tip?: string }> = {
  ios: {
    icon: Smartphone,
    title: "On iPhone or iPad",
    steps: [
      "Swipe down from the top-right corner for Control Centre.",
      "Tap the record button — the circle inside a circle.",
      "Wait for the 3-second countdown, then come straight back here.",
      "Tap the red time in the corner to stop when the run ends.",
    ],
    tip: "It records the whole screen. Crop it later in your editor — CapCut does this in two taps.",
  },
  android: {
    icon: Smartphone,
    title: "On Android",
    steps: [
      "Swipe down twice from the top for Quick Settings.",
      "Tap Screen record. Turn audio on if you want to talk over it live.",
      "Tap Start, then come straight back here.",
      "Stop it from the notification shade when the run ends.",
    ],
    tip: "It records the whole screen. Crop it later in your editor — CapCut does this in two taps.",
  },
  windows: {
    icon: Monitor,
    title: "On Windows",
    steps: [
      "Press Win + Shift + S, then choose the video option to record a region.",
      "Or press Win + Alt + R for the Game Bar recorder.",
      "Drag the box around just the bot — leave your bookmarks and tabs out of shot.",
      "Stop from the small bar when the run ends.",
    ],
    tip: "Recording only the region you need is the difference between a clean video and one that shows your whole desktop.",
  },
  mac: {
    icon: Monitor,
    title: "On a Mac",
    steps: [
      "Press Shift + Cmd + 5.",
      "Choose Record Selected Portion.",
      "Drag the box around just the bot — leave your browser bar and tabs out of shot.",
      "Stop from the menu bar when the run ends.",
    ],
    tip: "Recording only the region you need is the difference between a clean video and one that shows your whole desktop.",
  },
  desktop: {
    icon: Monitor,
    title: "On a computer",
    steps: [
      "Windows: Win + Shift + S for a region recording, or Win + Alt + R.",
      "Mac: Shift + Cmd + 5, then Record Selected Portion.",
      "Drag the box around just the bot — leave your bookmarks and tabs out of shot.",
      "Stop from the recording bar when the run ends.",
    ],
    tip: "Recording only the region you need is the difference between a clean video and one that shows your whole desktop.",
  },
};

export function ScreenRecordPrompt({ onClose }: { onClose: () => void }) {
  const [device, setDevice] = useState<Device>("desktop");

  useEffect(() => setDevice(detect()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const how = HOW[device];
  const Icon = how.icon;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rec-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5"
      style={{ background: "rgba(4,10,20,0.74)", backdropFilter: "blur(3px)" }}>
      <div className="relative w-full max-w-[440px] rounded-2xl border p-5"
        style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-lg p-1 transition hover:bg-white/10" style={{ color: TC.faint }}>
          <X size={16} />
        </button>

        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${A}22` }}>
          <Video size={20} style={{ color: A }} />
        </span>
        <h3 id="rec-title" className="mt-3 text-[20px] font-bold tracking-tight">Start recording first</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Turn your screen recorder on <b style={{ color: TC.text }}>before</b> you press Start on the bot. The run
          lasts a couple of minutes and there is no way to get it back afterwards.
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

        {how.tip && (
          <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
            <Crop size={13} className="mt-0.5 shrink-0" style={{ color: GOOD }} /> {how.tip}
          </p>
        )}

        <button type="button" onClick={onClose}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90"
          style={{ background: GOOD, color: "#06231a" }}>
          <Check size={15} /> Got it
        </button>
      </div>
    </div>
  );
}
