import { NextRequest, NextResponse } from "next/server";
import { chargeCredits, chargeError, refund } from "@/lib/billing/meter";
import { ttsCost, INPUT_CAPS } from "@/lib/billing/costs";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * A fallback voice (Groq TTS) so the recap VIDEO is never silent when ElevenLabs
 * is absent or out of credits. Returns base64 audio bytes (no caption timestamps —
 * the renderer decodes the bytes and doesn't need alignment). Best-effort: null on
 * any failure, so the caller stays silent rather than erroring. Used ONLY for the
 * video — the live game / search fall back to the browser voice / paced text on
 * the client. Model/voice are env-overridable for the operator's Groq account.
 */
async function groqFallbackTts(text: string): Promise<string | null> {
  const k = process.env.GROQ_API_KEY;
  if (!k) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.CLUNOID_TTS_FALLBACK_MODEL || "canopylabs/orpheus-v1-english",
        input: text,
        voice: process.env.CLUNOID_TTS_FALLBACK_VOICE || "austin",
        response_format: "wav",
      }),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

/**
 * Isaac's voice via ElevenLabs, WITH character timestamps so the caption can
 * highlight in sync with the audio. Returns JSON { audio (base64), chars, times }.
 * When ElevenLabs is unavailable, the VIDEO recap falls back to Groq TTS so it's
 * never silent; otherwise returns 204 (the client uses its own fallback).
 */
export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o";

  let text = "";
  let feature = "";
  try {
    ({ text, feature = "" } = await req.json());
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!text?.trim()) return new Response(null, { status: 204 });
  // No ElevenLabs key: only the VIDEO bothers with a fallback voice (so the recap
  // isn't silent); live game / search fall back on the client, so don't even charge.
  if (!key && feature !== "video") return new Response(null, { status: 204 });
  if (text.length > INPUT_CAPS.ttsChars) text = text.slice(0, INPUT_CAPS.ttsChars);

  // Free-tier Isaac trial gate (cost control): subscribers and the video recap
  // narration always pass; a free user gets Isaac only inside an open trial window
  // for this feature. When denied we return 204 (no charge) so the client falls
  // back to the browser voice / paced text — same as "no key".
  const supabase = await getSupabaseServer();
  const { data: voiceOk } = await supabase.rpc("isaac_voice_ok", { p_feature: feature });
  if (voiceOk === false) return new Response(null, { status: 204 });

  // Meter: signed-in + pay per ~100 chars (one credit RPC; auth enforced in-DB via
  // auth.uid()). 401/402 here just means "no audio" to the client — voice is optional.
  const charge = await chargeCredits("tts", ttsCost(text.length), { chars: text.length });
  if (!charge.ok) return chargeError(charge);

  // 1) ElevenLabs — Isaac's premium voice, with caption-sync timestamps.
  if (key) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.35, // more dynamic / expressive
          similarity_boost: 0.8,
          style: 0.5, // livelier
          use_speaker_boost: true,
          speed: 1.08, // a touch quicker — not slow
        },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[] } };
      return NextResponse.json({
        audio: data.audio_base64,
        chars: data.alignment?.characters ?? null,
        times: data.alignment?.character_start_times_seconds ?? null,
      });
    }
    // ElevenLabs depleted / errored → fall through to the fallback below.
  }

  // 2) Fallback voice so the VIDEO recap is never silent when ElevenLabs is out.
  if (feature === "video") {
    const audio = await groqFallbackTts(text);
    if (audio) return NextResponse.json({ audio, chars: null, times: null });
  }

  // 3) No audio produced — refund the credit we charged and report "no audio".
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await refund(user.id, ttsCost(text.length), "tts");
  return new Response(null, { status: 204 });
}
