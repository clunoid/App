import { NextRequest, NextResponse } from "next/server";
import { chargeCredits, chargeError, refund } from "@/lib/billing/meter";
import { ttsCost, INPUT_CAPS } from "@/lib/billing/costs";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/* ── Clunoid Voices ──────────────────────────────────────────────────────────
 * The user-facing ids (from lib/voice/preference.ts) map to real studio voices
 * here, server-side ONLY — the provider/voice names are never exposed to the
 * client. These voices are affordable and available to everyone (no trial gate). */
const CLUNOID_VOICE_MAP: Record<string, string> = {
  atlas: "austin",
  titan: "troy",
  dash: "daniel",
  aria: "autumn",
  nova: "diana",
  luna: "hannah",
};
const FALLBACK_MODEL = process.env.CLUNOID_TTS_FALLBACK_MODEL || "canopylabs/orpheus-v1-english";
// Voice used to keep the recap VIDEO from going silent when Isaac (ElevenLabs)
// is unavailable. Env-overridable; defaults to "Atlas".
const FALLBACK_VOICE = process.env.CLUNOID_TTS_FALLBACK_VOICE || "austin";
const ORPHEUS_MAX = 200; // hard per-request input limit for the studio voice

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Split text into <=max-char pieces on word boundaries (the studio voice caps
 *  each request at 200 chars; most game lines are one piece). */
function chunkText(text: string, max: number): string[] {
  const t = text.trim();
  if (t.length <= max) return [t];
  const out: string[] = [];
  let cur = "";
  for (const word of t.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > max) {
      if (cur) out.push(cur);
      cur = word;
      while (cur.length > max) {
        out.push(cur.slice(0, max));
        cur = cur.slice(max);
      }
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Concatenate same-format WAV buffers into one playable WAV (PCM merge). */
function concatWavs(parts: Buffer[]): Buffer {
  if (parts.length === 1) return parts[0];
  const dataOf = (b: Buffer) => {
    let o = 12; // skip "RIFF"<size>"WAVE"
    while (o + 8 <= b.length) {
      const id = b.toString("ascii", o, o + 4);
      const size = b.readUInt32LE(o + 4);
      if (id === "data") return { start: o + 8, size: Math.min(size, b.length - o - 8) };
      o += 8 + size + (size & 1);
    }
    return { start: 44, size: b.length - 44 };
  };
  const first = dataOf(parts[0]);
  const header = Buffer.from(parts[0].subarray(0, first.start)); // header up to PCM
  const pcm = Buffer.concat(parts.map((p) => p.subarray(dataOf(p).start)));
  const out = Buffer.concat([header, pcm]);
  out.writeUInt32LE(out.length - 8, 4); // RIFF chunk size
  out.writeUInt32LE(pcm.length, first.start - 4); // data chunk size
  return out;
}

/** One studio-voice request, retrying transient rate-limit / server errors so a
 *  line never silently drops. Returns WAV bytes or null. */
async function groqOne(key: string, text: string, voice: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: FALLBACK_MODEL, input: text, voice, response_format: "wav" }),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        // The studio voice has a hard daily cap; once hit, retry-after is huge
        // (minutes). Don't hang the render waiting it out — give up fast so the
        // line degrades to silence immediately instead of stalling.
        if (ra > 8) return null;
        await sleep(ra > 0 ? ra * 1000 : 450 + attempt * 650);
        continue;
      }
      return null; // 4xx (bad voice / terms not accepted) — won't fix on retry
    } catch {
      await sleep(450 + attempt * 650);
    }
  }
  return null;
}

/** Speak a full line in a studio (Clunoid) voice — chunked to the 200-char limit,
 *  retried, and merged into one WAV. Returns base64 WAV or null (best effort). */
async function groqSpeak(text: string, voice: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const chunks = chunkText(text, ORPHEUS_MAX);
  const parts: Buffer[] = [];
  for (const c of chunks) {
    const wav = await groqOne(key, c, voice);
    if (!wav) return null; // any piece fails → whole line fails (caller retries)
    parts.push(wav);
  }
  return concatWavs(parts).toString("base64");
}

/**
 * The host voice for a line of text. Two paths:
 *  - A Clunoid Voice (cheap, ungated, everyone) → studio voice (WAV).
 *  - Isaac (premium) → ElevenLabs with caption-sync timestamps; for the VIDEO
 *    only, falls back to a studio voice so the recap is never silent when
 *    ElevenLabs is out of credits.
 * Returns { audio (base64), chars, times, format } or 204 when there's no audio.
 */
export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o";

  let text = "";
  let feature = "";
  let voice = "";
  try {
    ({ text, feature = "", voice = "" } = await req.json());
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!text?.trim()) return new Response(null, { status: 204 });
  if (text.length > INPUT_CAPS.ttsChars) text = text.slice(0, INPUT_CAPS.ttsChars);

  const clunoidVoice = CLUNOID_VOICE_MAP[voice.toLowerCase()];
  const supabase = await getSupabaseServer();

  // ── Clunoid Voice path: studio voice, available to everyone, no trial gate. ──
  if (clunoidVoice) {
    const charge = await chargeCredits("tts", ttsCost(text.length), { chars: text.length, voice });
    if (!charge.ok) return chargeError(charge);
    const audio = await groqSpeak(text, clunoidVoice);
    if (audio) return NextResponse.json({ audio, chars: null, times: null, format: "wav" });
    // Produced nothing → refund and report "no audio".
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await refund(user.id, ttsCost(text.length), "tts");
    return new Response(null, { status: 204 });
  }

  // ── Isaac (premium) path. ──
  // No ElevenLabs key: only the VIDEO bothers with a studio fallback (so the
  // recap isn't silent); live game / search fall back on the client.
  if (!key && feature !== "video") return new Response(null, { status: 204 });

  // Free-tier Isaac trial gate (cost control): subscribers and the video recap
  // always pass; a free user gets Isaac only inside an open trial window for the
  // live game / search. Denied → 204 (no charge) → client uses its own fallback.
  if (feature !== "video" && feature !== "preview") {
    const { data: voiceOk } = await supabase.rpc("isaac_voice_ok", { p_feature: feature });
    if (voiceOk === false) return new Response(null, { status: 204 });
  }

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
      const data = (await res.json()) as {
        audio_base64: string;
        alignment?: { characters: string[]; character_start_times_seconds: number[] };
      };
      return NextResponse.json({
        audio: data.audio_base64,
        chars: data.alignment?.characters ?? null,
        times: data.alignment?.character_start_times_seconds ?? null,
        format: "mp3",
      });
    }
    // ElevenLabs depleted / errored → fall through to the studio fallback below.
  }

  // 2) Studio fallback so the VIDEO recap is never silent when ElevenLabs is out.
  if (feature === "video") {
    const audio = await groqSpeak(text, FALLBACK_VOICE);
    if (audio) return NextResponse.json({ audio, chars: null, times: null, format: "wav" });
  }

  // 3) No audio produced — refund the credit we charged and report "no audio".
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await refund(user.id, ttsCost(text.length), "tts");
  return new Response(null, { status: 204 });
}
