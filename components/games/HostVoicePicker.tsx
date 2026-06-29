"use client";

import { useEffect, useState } from "react";
import { Play, Pause, Loader2, Check, Crown, ChevronDown, AlertTriangle, VolumeX } from "lucide-react";
import {
  CLUNOID_VOICES,
  ISAAC_VOICE,
  BROWSER_VOICE,
  MUTE_VOICE,
  SILENT_VIDEO,
  getVoicePref,
  setVoicePref,
  getVideoVoicePref,
  setVideoVoicePref,
  isClunoidVoice,
  type VoiceEntry,
} from "@/lib/voice/preference";
import { useVoicePreview } from "@/lib/voice/usePreview";
import { isaacStatus, type IsaacStatus } from "@/lib/isaac/status";
import { useBilling } from "@/lib/billing/store";
import { cn } from "@/lib/utils";

/**
 * The voice chooser — a clean, card-free list that floats on the game's rays
 * background. Reused by the game-start "Choose your host" screen (mode="game")
 * and the create-video flow (mode="video"). Logic is unchanged; only chrome is
 * minimal: a play circle, a name, and a radio, with the selected row softly lit.
 */
export function HostVoicePicker({ mode, onPick }: { mode: "game" | "video"; onPick?: (id: string) => void }) {
  const live = mode === "game";
  const [selected, setSelected] = useState<string>(live ? getVoicePref() : getVideoVoicePref());
  const [freeOpen, setFreeOpen] = useState<boolean>(isClunoidVoice(live ? getVoicePref() : getVideoVoicePref()));
  const [status, setStatus] = useState<IsaacStatus | null>(null);
  const { preview, stop, loadingId, playingId, note } = useVoicePreview();
  const startCheckout = useBilling((s) => s.startCheckout);

  useEffect(() => {
    if (live) void isaacStatus("game").then(setStatus);
  }, [live]);

  const choose = (id: string) => {
    if (live) setVoicePref(id);
    else setVideoVoicePref(id);
    setSelected(id);
    onPick?.(id);
  };

  const isaacLocked = live && status != null && !status.available;
  const isaacTag = !live ? "Best quality" : status?.subscriber ? "Premium" : status?.available ? "Free trial" : "Premium";

  const Row = (v: VoiceEntry, opts?: { tag?: string; locked?: boolean; inset?: boolean }) => {
    const locked = !!opts?.locked;
    const isSel = selected === v.id && !locked;
    const isLoading = loadingId === v.id;
    const isPlaying = playingId === v.id;
    const canPreview = v.kind === "isaac" || v.kind === "clunoid" || v.kind === "browser";
    return (
      <div
        key={v.id}
        className={cn(
          "flex items-center gap-3 rounded-2xl px-2.5 py-2 transition",
          isSel ? "bg-white/15 ring-1 ring-[#FFD400]/60" : "hover:bg-white/[0.07]"
        )}
      >
        <button
          type="button"
          disabled={!canPreview}
          onClick={(e) => {
            e.stopPropagation();
            void preview(v.id, v.name);
          }}
          aria-label={canPreview ? `Preview ${v.name}` : undefined}
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full transition",
            isPlaying ? "bg-[#FFD400] text-black" : canPreview ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/5 text-white/30"
          )}
        >
          {!canPreview ? <VolumeX size={16} /> : isLoading ? <Loader2 size={16} className="animate-spin" /> : isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>

        <button type="button" onClick={() => (locked ? void startCheckout("pro") : choose(v.id))} className="flex min-w-0 flex-1 flex-col text-left">
          <span className="flex items-center gap-1.5">
            <span className="text-[15px] font-extrabold text-white">{v.name}</span>
            {opts?.tag && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/75">
                {v.kind === "isaac" && <Crown size={9} className="text-[#FFD400]" />} {opts.tag}
              </span>
            )}
          </span>
          <span className="truncate text-xs text-white/55">{v.desc}</span>
        </button>

        {locked ? (
          <button
            type="button"
            onClick={() => void startCheckout("pro")}
            className="shrink-0 rounded-full bg-[#FFD400] px-3.5 py-1.5 text-[11px] font-extrabold text-black transition hover:brightness-105"
          >
            Subscribe
          </button>
        ) : (
          <button
            type="button"
            onClick={() => choose(v.id)}
            aria-label={`Use ${v.name}`}
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition",
              isSel ? "border-[#FFD400] bg-[#FFD400] text-black" : "border-white/30 text-transparent hover:border-white/60"
            )}
          >
            <Check size={14} strokeWidth={3} />
          </button>
        )}
      </div>
    );
  };

  const freeSelected = isClunoidVoice(selected);

  return (
    <div className="w-full space-y-1">
      {Row(ISAAC_VOICE, { tag: isaacTag, locked: isaacLocked })}

      {/* Video: "Silent" sits right under Isaac, above the free voices. */}
      {!live ? Row(SILENT_VIDEO) : null}

      {/* Free voices — a clean collapsible group (no boxed card) */}
      <div>
        <button
          type="button"
          onClick={() => {
            if (freeOpen) stop();
            setFreeOpen((o) => !o);
          }}
          className="flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2.5 text-left transition hover:bg-white/[0.07]"
        >
          <span className="flex items-center gap-2 text-[15px] font-extrabold text-white">
            Free voices
            <span className="rounded-full bg-emerald-400/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200">Free</span>
            {freeSelected && <span className="text-[11px] font-medium text-white/55">· in use</span>}
          </span>
          <ChevronDown size={18} className={cn("text-white/60 transition", freeOpen ? "rotate-180" : "")} />
        </button>
        {freeOpen && (
          <div className="mt-0.5 space-y-1 pl-1">
            <div className="mx-1 mb-1 flex items-start gap-2 rounded-2xl bg-amber-400/15 px-3 py-2 text-amber-100/90">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
              <p className="text-[12px] leading-snug">
                <span className="font-bold text-amber-100">Free, but unreliable.</span> Shared &amp; rate-limited — they may
                drop out or go silent, {mode === "video" ? "often in videos" : "especially in videos"}.
              </p>
            </div>
            {CLUNOID_VOICES.map((v) => Row(v, { tag: "Free", inset: true }))}
          </div>
        )}
      </div>

      {live ? Row(BROWSER_VOICE, { tag: "Always works" }) : null}
      {live ? Row(MUTE_VOICE) : null}

      {note && <p className="px-2 pt-1 text-center text-[11px] text-white/55">{note}</p>}
    </div>
  );
}
