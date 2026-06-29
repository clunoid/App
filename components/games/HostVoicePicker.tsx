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
 * Dark, self-contained host-voice picker reused by the game-start "building"
 * screen (mode="game") and the create-video flow (mode="video").
 *  - game:  Isaac (trial-aware → "Subscribe" when locked) · Free voices · Basic
 *           browser voice · No voice. Writes the LIVE pref.
 *  - video: Isaac · Free voices · Silent. Writes the VIDEO pref. (The browser
 *           voice can't be recorded, so it's not offered for videos.)
 */
export function HostVoicePicker({ mode, onPick }: { mode: "game" | "video"; onPick?: (id: string) => void }) {
  const live = mode === "game";
  const [selected, setSelected] = useState<string>(live ? getVoicePref() : getVideoVoicePref());
  const [freeOpen, setFreeOpen] = useState<boolean>(isClunoidVoice(live ? getVoicePref() : getVideoVoicePref()));
  const [status, setStatus] = useState<IsaacStatus | null>(null);
  const { preview, stop, loadingId, playingId, note } = useVoicePreview();
  const startCheckout = useBilling((s) => s.startCheckout);

  // Game only: is Isaac available (read-only — doesn't spend the trial)?
  useEffect(() => {
    if (live) void isaacStatus("game").then(setStatus);
  }, [live]);

  const choose = (id: string) => {
    if (live) setVoicePref(id);
    else setVideoVoicePref(id);
    setSelected(id);
    onPick?.(id);
  };

  // Isaac is locked only in the live game for a free user whose trial is used up.
  // (Video isn't trial-gated.)
  const isaacLocked = live && status != null && !status.available;
  const isaacTag = !live ? "Best quality" : status?.subscriber ? "Premium" : status?.available ? "Free trial" : "Premium";

  const Row = (v: VoiceEntry, opts?: { tag?: string; locked?: boolean }) => {
    const locked = !!opts?.locked;
    const isSel = selected === v.id && !locked;
    const isLoading = loadingId === v.id;
    const isPlaying = playingId === v.id;
    const canPreview = v.kind === "isaac" || v.kind === "clunoid" || v.kind === "browser";
    return (
      <div
        key={v.id}
        className={cn(
          "flex items-center gap-2.5 rounded-xl border p-2.5 transition",
          isSel ? "border-clay/70 bg-clay/10" : "border-white/10 bg-white/[0.03]"
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
            "grid h-9 w-9 shrink-0 place-items-center rounded-full transition",
            canPreview ? "bg-white/10 text-white hover:bg-white/20" : "bg-white/5 text-white/30"
          )}
        >
          {!canPreview ? <VolumeX size={15} /> : isLoading ? <Loader2 size={15} className="animate-spin" /> : isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </button>

        <button type="button" onClick={() => (locked ? void startCheckout("pro") : choose(v.id))} className="flex min-w-0 flex-1 flex-col text-left">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white">{v.name}</span>
            {opts?.tag && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/70">
                {v.kind === "isaac" && <Crown size={9} />} {opts.tag}
              </span>
            )}
          </span>
          <span className="truncate text-[11px] text-white/50">{v.desc}</span>
        </button>

        {locked ? (
          <button
            type="button"
            onClick={() => void startCheckout("pro")}
            className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:opacity-90"
          >
            Subscribe
          </button>
        ) : (
          <button
            type="button"
            onClick={() => choose(v.id)}
            aria-label={`Use ${v.name}`}
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition",
              isSel ? "border-clay bg-clay text-[#1F1E1C]" : "border-white/20 text-transparent hover:border-white/40"
            )}
          >
            <Check size={13} />
          </button>
        )}
      </div>
    );
  };

  const freeSelected = isClunoidVoice(selected);

  return (
    <div className="w-full space-y-2">
      {Row(ISAAC_VOICE, { tag: isaacTag, locked: isaacLocked })}

      {/* Free voices — collapsible, with the unreliable warning */}
      <div className="overflow-hidden rounded-xl border border-white/10">
        <button
          type="button"
          onClick={() => {
            if (freeOpen) stop();
            setFreeOpen((o) => !o);
          }}
          className="flex w-full items-center justify-between gap-2 bg-white/[0.03] px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            Free voices
            <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">Free</span>
            {freeSelected && <span className="text-[11px] font-medium text-white/50">· in use</span>}
          </span>
          <ChevronDown size={16} className={cn("text-white/50 transition", freeOpen ? "rotate-180" : "")} />
        </button>
        {freeOpen && (
          <div className="space-y-2 border-t border-white/10 bg-black/20 p-2">
            <div className="flex items-start gap-2 rounded-lg bg-amber-400/10 px-2.5 py-2 ring-1 ring-amber-400/30">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
              <p className="text-[11px] leading-snug text-amber-100/80">
                <span className="font-bold text-amber-100">Free, but unreliable.</span> Shared &amp; rate-limited — they may
                drop out or go silent, {mode === "video" ? "often in videos" : "especially in videos"}.
              </p>
            </div>
            {CLUNOID_VOICES.map((v) => Row(v, { tag: "Free" }))}
          </div>
        )}
      </div>

      {live ? Row(BROWSER_VOICE, { tag: "Always works" }) : null}
      {live ? Row(MUTE_VOICE) : Row(SILENT_VIDEO)}

      {note && <p className="px-1 pt-0.5 text-center text-[11px] text-white/45">{note}</p>}
    </div>
  );
}
