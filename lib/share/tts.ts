"use client";

import { getVoicePref } from "@/lib/voice/preference";

/**
 * Fetch the host voice for a line of narration as raw audio bytes (MP3 or WAV),
 * ready to be decoded with AudioContext.decodeAudioData (format-agnostic) and
 * scheduled onto the video's recorded audio track. Uses the SAME endpoint as the
 * live game (POST /api/tts) and the user's chosen voice.
 *
 * Returns null when there's no voice available (204) — the renderer then produces
 * the video silently rather than failing. (For "isaac", when ElevenLabs is out of
 * credits the server substitutes a studio voice so the recap is never silent.)
 */
export async function fetchNarrationBytes(text: string): Promise<Uint8Array | null> {
  const t = (text || "").trim();
  if (!t) return null;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // feature: "video" — recap-video narration is never gated by the free trial.
      body: JSON.stringify({ text: t, feature: "video", voice: getVoicePref() }),
    });
    if (!res.ok || res.status === 204) return null;
    const data = (await res.json()) as { audio?: string };
    if (!data.audio) return null;
    const bin = atob(data.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
