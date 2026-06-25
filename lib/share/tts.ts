"use client";

/**
 * Fetch Isaac's voice for a line of narration as raw MP3 bytes, ready to be
 * decoded with AudioContext.decodeAudioData and scheduled onto the video's
 * recorded audio track. Uses the SAME endpoint as the live game (POST /api/tts).
 *
 * Returns null when there's no voice available (204 = no ElevenLabs key, or any
 * error) — the renderer then produces the video silently rather than failing.
 */
export async function fetchNarrationBytes(text: string): Promise<Uint8Array | null> {
  const t = (text || "").trim();
  if (!t) return null;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: t }),
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
