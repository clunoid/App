"use client";

import { useEffect, useRef, useState } from "react";
import { useClunoid } from "@/lib/store/useClunoid";

/**
 * Shared "preview a voice" behaviour for the voice pickers (Settings, the
 * game-start host picker, the create-video picker). Plays a short sample:
 *  - Isaac / Clunoid voices → POST /api/tts (feature "preview", never trial-gated)
 *  - "browser" → the device SpeechSynthesis voice (no server)
 *  - "mute" / "silent" → nothing to play
 * Tracks which voice is loading / playing and surfaces a friendly note on failure
 * (e.g. the free voices being rate-limited).
 */
const sample = (name: string) => `Hey, I'm ${name}. Let's play Clunoid — can you beat the high score?`;

export function useVoicePreview() {
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const openAuth = useClunoid((s) => s.openAuth);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Guard against late audio/utterance callbacks firing after unmount.
  const mountedRef = useRef(true);
  const safeSetPlaying = (id: string | null) => {
    if (mountedRef.current) setPlayingId(id);
  };
  // Clear "playing" only if it's still this id, and only while mounted (late
  // audio/utterance end callbacks must not touch an unmounted component).
  const safeSetPlaying2 = (id: string) => {
    if (mountedRef.current) setPlayingId((p) => (p === id ? null : p));
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    safeSetPlaying(null);
  };

  // Stop any audio when the component using this hook unmounts.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function preview(id: string, name: string) {
    setNote(null);
    if (id === "mute" || id === "silent") {
      stop();
      return;
    }
    if (playingId === id) {
      stop();
      return; // tap again = stop
    }
    stop();

    // Browser voice → local SpeechSynthesis, no network.
    if (id === "browser") {
      try {
        const synth = window.speechSynthesis;
        if (!synth) {
          setNote("Your browser has no built-in voice.");
          return;
        }
        const u = new SpeechSynthesisUtterance(sample("the basic voice"));
        u.rate = 1.05;
        const v =
          synth.getVoices().find((x) => /en[-_]?US/i.test(x.lang) && /female|samantha|zira|google US/i.test(x.name)) ||
          synth.getVoices().find((x) => /^en/i.test(x.lang)) ||
          null;
        if (v) u.voice = v;
        setPlayingId(id);
        u.onend = () => safeSetPlaying2(id);
        u.onerror = () => safeSetPlaying2(id);
        synth.cancel();
        synth.speak(u);
      } catch {
        setNote("Couldn't play that preview.");
      }
      return;
    }

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
        setNote(id === "isaac" ? "Isaac is unavailable to preview right now." : "That voice is busy (rate-limited) — try again in a bit.");
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
        safeSetPlaying2(id);
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

  return { preview, stop, loadingId, playingId, note, setNote };
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
