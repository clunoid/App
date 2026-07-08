import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Edge video narration — the TWO premium ElevenLabs voices that converse in a
 * prediction video, with caption-sync timestamps. Admin-only (so it's free of the
 * shared /api/tts billing/gating and completely separate from it — no
 * interference). Speaker "a" is Isaac (the asker); speaker "b" is the second
 * premium voice, Sarah (the analyst) — a clear, smooth female voice chosen to
 * match Isaac's quality. Because both aspect ratios encode from ONE fetched
 * audio buffer client-side, each line is spoken (and billed to ElevenLabs) once.
 */
const VOICE_A = process.env.ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o"; // Isaac
const VOICE_B = process.env.ELEVENLABS_VOICE_ID_FEMALE || "EXAVITQu4vr4xnSDxMaL"; // Sarah

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "voice not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; speaker?: string };
  const text = (body.text || "").trim().slice(0, 500);
  if (!text) return new Response(null, { status: 204 });
  const voiceId = body.speaker === "b" ? VOICE_B : VOICE_A;

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.45, use_speaker_boost: true, speed: 1.05 },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `voice ${res.status}` }, { status: 502 });
    const d = (await res.json()) as { audio_base64?: string; alignment?: { characters: string[]; character_start_times_seconds: number[] } };
    if (!d.audio_base64) return new Response(null, { status: 204 });
    return NextResponse.json({ audio: d.audio_base64, chars: d.alignment?.characters ?? null, times: d.alignment?.character_start_times_seconds ?? null, format: "mp3" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "tts failed" }, { status: 500 });
  }
}
