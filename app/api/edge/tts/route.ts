import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { chargeCredits, chargeError, refundSplit } from "@/lib/billing/meter";
import { ttsCost, INPUT_CAPS } from "@/lib/billing/costs";
import { edgeDenied } from "@/lib/edge/access";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Edge video narration — the TWO premium ElevenLabs voices that converse in a
 * prediction video, with caption-sync timestamps. A Pro/Max feature, metered
 * separately from the shared /api/tts (its own dual-voice route, so it doesn't
 * interfere): every line is plan-gated + rate-limited + billed by length
 * ("edge_tts", ttsCost) so this premium-voice endpoint can't be abused as a free
 * TTS proxy. Speaker "a" is Isaac (the asker); speaker "b" is Cluno — our owned,
 * smooth female analyst voice. Because both aspect ratios encode from ONE fetched
 * audio buffer client-side, each line is spoken (and billed) once.
 */
const VOICE_A = process.env.ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o"; // Isaac
const VOICE_B = process.env.ELEVENLABS_VOICE_ID_FEMALE || "XrExE9yKIg1WjnnlVkGX"; // Cluno — smooth, warm female analyst

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const denied = await edgeDenied(user);
  if (denied) return denied;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "voice not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; speaker?: string };
  const text = (body.text || "").trim().slice(0, INPUT_CAPS.ttsChars);
  if (!text) return new Response(null, { status: 204 });
  const voiceId = body.speaker === "b" ? VOICE_B : VOICE_A;

  // bill this line by length before we call the paid vendor; refund if it fails
  const charge = await chargeCredits("edge_tts", ttsCost(text.length), { chars: text.length, spk: body.speaker === "b" ? "b" : "a" }, user);
  if (!charge.ok) return chargeError(charge);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        // smoother, steadier read (less style wobble) so the female analyst voice
        // reads as clean and premium as Isaac
        voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true, speed: 1.0 },
      }),
    });
    if (!res.ok) {
      await refundSplit(user.id, charge.fromBalance, charge.fromPurchased, "edge_tts");
      return NextResponse.json({ error: `voice ${res.status}` }, { status: 502 });
    }
    const d = (await res.json()) as { audio_base64?: string; alignment?: { characters: string[]; character_start_times_seconds: number[] } };
    if (!d.audio_base64) {
      await refundSplit(user.id, charge.fromBalance, charge.fromPurchased, "edge_tts");
      return new Response(null, { status: 204 });
    }
    return NextResponse.json({ audio: d.audio_base64, chars: d.alignment?.characters ?? null, times: d.alignment?.character_start_times_seconds ?? null, format: "mp3" });
  } catch (e) {
    await refundSplit(user.id, charge.fromBalance, charge.fromPurchased, "edge_tts");
    return NextResponse.json({ error: e instanceof Error ? e.message : "tts failed" }, { status: 500 });
  }
}
