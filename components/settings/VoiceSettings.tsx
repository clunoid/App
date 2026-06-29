"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Pause, Loader2, Check, Crown, Mic, ChevronDown, AlertTriangle } from "lucide-react";
import {
  CLUNOID_VOICES,
  ISAAC_VOICE,
  BROWSER_VOICE,
  MUTE_VOICE,
  getVoicePref,
  setVoicePref,
  type VoiceEntry,
} from "@/lib/voice/preference";
import { useVoicePreview } from "@/lib/voice/usePreview";
import { cn } from "@/lib/utils";

/**
 * Choose the voice that hosts your games + search. Isaac (premium) sits on top;
 * the free studio voices live in a collapsible "Free voices" group with a clear
 * "can be unreliable" warning. Plus a basic always-works browser voice and a
 * no-voice option. Saved on this device.
 */
export function VoiceSettings() {
  const [selected, setSelected] = useState<string>(ISAAC_VOICE.id);
  const [freeOpen, setFreeOpen] = useState(false);
  const { preview, stop, loadingId, playingId, note } = useVoicePreview();

  useEffect(() => {
    const cur = getVoicePref();
    setSelected(cur);
    if (CLUNOID_VOICES.some((v) => v.id === cur)) setFreeOpen(true); // reveal the group if a free voice is active
  }, []);

  function choose(id: string) {
    setVoicePref(id);
    setSelected(id);
  }

  const row = (v: VoiceEntry, opts?: { tag?: "premium" | "free" | "plain" }) => {
    const isSel = selected === v.id;
    const isLoading = loadingId === v.id;
    const isPlaying = playingId === v.id;
    const canPreview = v.kind === "isaac" || v.kind === "clunoid" || v.kind === "browser";
    const tag = opts?.tag ?? (v.kind === "isaac" ? "premium" : v.kind === "clunoid" ? "free" : "plain");
    return (
      <button
        key={v.id}
        type="button"
        onClick={() => choose(v.id)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border bg-surface p-3.5 text-left transition",
          isSel ? "border-clay ring-1 ring-clay/40" : "border-border hover:bg-surface-2"
        )}
      >
        <span
          role={canPreview ? "button" : undefined}
          tabIndex={canPreview ? 0 : -1}
          onClick={(e) => {
            if (!canPreview) return;
            e.stopPropagation();
            void preview(v.id, v.name);
          }}
          onKeyDown={(e) => {
            if (!canPreview) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              void preview(v.id, v.name);
            }
          }}
          aria-label={canPreview ? `Preview ${v.name}` : undefined}
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full transition",
            canPreview ? "cursor-pointer bg-gradient-to-br from-clay/25 to-spark/15 text-clay hover:brightness-110" : "bg-surface-2 text-ink-faint"
          )}
        >
          {!canPreview ? <Mic size={16} className="opacity-40" /> : isLoading ? <Loader2 size={17} className="animate-spin" /> : isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-ink">{v.name}</span>
            {tag === "premium" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-spark/15 px-1.5 py-0.5 text-[10px] font-medium text-spark-soft">
                <Crown size={10} /> Premium
              </span>
            )}
            {tag === "free" && <span className="rounded-full bg-ok/15 px-1.5 py-0.5 text-[10px] font-medium text-ok">Free</span>}
          </div>
          <div className="truncate text-xs text-ink-muted">{v.desc}</div>
        </div>

        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border transition", isSel ? "border-clay bg-clay text-[#1F1E1C]" : "border-border text-transparent")}>
          <Check size={14} />
        </span>
      </button>
    );
  };

  const freeSelected = CLUNOID_VOICES.some((v) => v.id === selected);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link href="/home" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-faint transition hover:text-ink">
        <ArrowLeft size={15} /> Back to Clunoid
      </Link>

      <div className="mb-1 flex items-center gap-2">
        <Mic size={20} className="text-clay" />
        <h1 className="font-serif text-2xl text-ink sm:text-3xl">Voice</h1>
      </div>
      <p className="mb-6 max-w-lg text-sm text-ink-muted">
        Pick the voice that hosts your games &amp; search. Preview each one, then choose your favourite — it&apos;s saved on
        this device.
      </p>

      <div className="space-y-2.5">
        {/* Isaac — premium, on top */}
        {row(ISAAC_VOICE)}

        {/* Free voices — collapsible group with an unreliable warning */}
        <div className={cn("overflow-hidden rounded-2xl border transition", freeOpen || freeSelected ? "border-border" : "border-border")}>
          <button
            type="button"
            onClick={() => {
              if (freeOpen) stop();
              setFreeOpen((o) => !o);
            }}
            className="flex w-full items-center justify-between gap-2 bg-surface px-3.5 py-3 text-left transition hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <span className="font-medium text-ink">Free voices</span>
              <span className="rounded-full bg-ok/15 px-1.5 py-0.5 text-[10px] font-medium text-ok">Free</span>
              {freeSelected && <span className="text-xs text-ink-faint">· in use</span>}
            </span>
            <ChevronDown size={18} className={cn("text-ink-faint transition", freeOpen ? "rotate-180" : "")} />
          </button>

          {freeOpen && (
            <div className="space-y-2.5 border-t border-border bg-surface/60 p-2.5">
              <div className="flex items-start gap-2 rounded-xl bg-amber-400/10 px-3 py-2.5 ring-1 ring-amber-400/30">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <p className="text-[12px] leading-snug text-ink-muted">
                  <span className="font-semibold text-ink">Free, but unreliable.</span> These studio voices are shared and
                  rate-limited — they may be unavailable or drop out, <span className="font-medium">especially in videos</span>.
                  For dependable narration use Isaac or the basic voice.
                </p>
              </div>
              {CLUNOID_VOICES.map((v) => row(v, { tag: "free" }))}
            </div>
          )}
        </div>

        {/* Always-works alternatives */}
        {row(BROWSER_VOICE, { tag: "plain" })}
        {row(MUTE_VOICE, { tag: "plain" })}
      </div>

      {note && <p className="mt-3 text-center text-xs text-ink-faint">{note}</p>}
      <p className="mt-5 text-center text-xs text-ink-faint">
        Isaac is the premium voice (free trial, then included with Pro &amp; Max). Video narration is chosen separately when
        you create a video.
      </p>
    </div>
  );
}
