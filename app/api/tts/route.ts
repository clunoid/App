import { NextRequest, NextResponse } from "next/server";
import { chargeCredits, chargeError } from "@/lib/billing/meter";
import { ttsCost, INPUT_CAPS } from "@/lib/billing/costs";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Isaac's voice via ElevenLabs, WITH character timestamps so the caption can
 * highlight in sync with the audio. Returns JSON { audio (base64), chars, times }.
 * Falls back to 204 when no key is set (app still works, silently, no audio).
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
  if (!key || !text?.trim()) return new Response(null, { status: 204 });
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

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "content-type": "application/json",
        accept: "application/json",
      },
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
    }
  );

  if (!res.ok) return new Response(null, { status: 502 });

  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: {
      characters: string[];
      character_start_times_seconds: number[];
    };
  };

  return NextResponse.json({
    audio: data.audio_base64,
    chars: data.alignment?.characters ?? null,
    times: data.alignment?.character_start_times_seconds ?? null,
  });
}
