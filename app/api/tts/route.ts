import { NextRequest, NextResponse } from "next/server";

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
  try {
    ({ text } = await req.json());
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!key || !text?.trim()) return new Response(null, { status: 204 });

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
