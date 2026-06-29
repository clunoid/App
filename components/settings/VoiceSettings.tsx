"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Pause, Loader2, Check, Crown, Mic } from "lucide-react";
import { CLUNOID_VOICES, ISAAC_VOICE, getVoicePref, setVoicePref } from "@/lib/voice/preference";
import { useClunoid } from "@/lib/store/useClunoid";
import { cn } from "@/lib/utils";

type Entry = { id: string; name: string; desc: string; tone?: "male" | "female"; premium?: boolean };

const ENTRIES: Entry[] = [
  { id: ISAAC_VOICE.id, name: ISAAC_VOICE.name, desc: ISAAC_VOICE.desc, premium: true },
  ...CLUNOID_VOICES.map((v) => ({ id: v.id, name: v.name, desc: v.desc, tone: v.tone })),
];

const sample = (name: string) => `Hey, I'm ${name}. Let's play Clunoid — can you beat the high score?`;

/**
 * Choose the voice that hosts your games, search and recap videos. Isaac is the
 * premium voice; the Clunoid Voices are fast, free studio voices you can preview
 * and switch to any time. The choice is saved on this device.
 */
export function VoiceSettings() {
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const openAuth = useClunoid((s) => s.openAuth);
  const [selected, setSelected] = useState<string>(ISAAC_VOICE.id);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Read the current choice once on mount (localStorage-backed).
  useEffect(() => setSelected(getVoicePref()), []);
  useEffect(() => () => audioRef.current?.pause(), []); // stop audio on unmount

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  }

  function choose(id: string) {
    setVoicePref(id);
    setSelected(id);
  }

  async function preview(id: string, name: string) {
    setNote(null);
    if (playingId === id) return stopAudio(); // toggle off if already playing
    stopAudio();
    if (!isAuthed) {
      openAuth("login");
      return;
    }
    if (loadingId) return;
    setLoadingId(id);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: sample(name), feature: "preview", voice: id }),
      });
      if (!res.ok || res.status === 204) {
        setNote(id === ISAAC_VOICE.id ? "Isaac is unavailable to preview right now." : "Couldn't load that preview — try again.");
        return;
      }
      const data = (await res.json()) as { audio?: string; format?: string };
      if (!data.audio) {
        setNote("Couldn't load that preview — try again.");
        return;
      }
      const url = URL.createObjectURL(b64ToBlob(data.audio, data.format === "wav" ? "audio/wav" : "audio/mpeg"));
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingId(id);
      const done = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        setPlayingId((p) => (p === id ? null : p));
      };
      audio.onended = done;
      audio.onerror = done;
      await audio.play().catch(done);
    } catch {
      setNote("Couldn't load that preview — try again.");
    } finally {
      setLoadingId(null);
    }
  }

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
        Pick the voice that hosts your games, search and recap videos. Preview each one, then choose your favourite —
        it&apos;s saved on this device.
      </p>

      <div className="space-y-2.5">
        {ENTRIES.map((v) => {
          const isSel = selected === v.id;
          const isLoading = loadingId === v.id;
          const isPlaying = playingId === v.id;
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
              {/* Preview toggle */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  void preview(v.id, v.name);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    void preview(v.id, v.name);
                  }
                }}
                aria-label={`Preview ${v.name}`}
                className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-clay/25 to-spark/15 text-clay transition hover:brightness-110"
              >
                {isLoading ? <Loader2 size={17} className="animate-spin" /> : isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-ink">{v.name}</span>
                  {v.premium ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-spark/15 px-1.5 py-0.5 text-[10px] font-medium text-spark-soft">
                      <Crown size={10} /> Premium
                    </span>
                  ) : (
                    <span className="rounded-full bg-ok/15 px-1.5 py-0.5 text-[10px] font-medium text-ok">Free</span>
                  )}
                </div>
                <div className="truncate text-xs text-ink-muted">{v.desc}</div>
              </div>

              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition",
                  isSel ? "border-clay bg-clay text-[#1F1E1C]" : "border-border text-transparent"
                )}
              >
                <Check size={14} />
              </span>
            </button>
          );
        })}
      </div>

      {note && <p className="mt-3 text-center text-xs text-ink-faint">{note}</p>}
      <p className="mt-5 text-center text-xs text-ink-faint">
        Isaac is the premium voice (free trial, then included with Pro &amp; Max). Clunoid Voices are free for everyone.
      </p>
    </div>
  );
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
