import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasFal } from "@/lib/vlab/fal";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * VLAB pilot — Isaac narrates the full script (one ElevenLabs call, timestamped),
 * and the mp3 is uploaded to a public Supabase Storage bucket so the fal ffmpeg
 * compose step can pull it by URL. Returns { audioUrl, seconds }.
 */
const VOICE = process.env.ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o"; // Isaac

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  if (!hasFal()) return NextResponse.json({ error: "unconfigured" }, { status: 501 });
  const key = process.env.ELEVENLABS_API_KEY;
  const admin = getSupabaseAdmin();
  if (!key || !admin) return NextResponse.json({ error: "voice/storage not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text || "").trim().slice(0, 2_500);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        // a touch slower + steadier than chat: documentary-narrator read
        voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true, speed: 0.96 },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return NextResponse.json({ error: `voice ${res.status}` }, { status: 502 });
    const d = (await res.json()) as { audio_base64?: string; alignment?: { character_end_times_seconds?: number[] } };
    if (!d.audio_base64) return NextResponse.json({ error: "no audio returned" }, { status: 502 });
    const ends = d.alignment?.character_end_times_seconds;
    const seconds = ends?.length ? ends[ends.length - 1] : 0;

    // public bucket for pilot artifacts (idempotent create; tiny mp3s only)
    await admin.storage.createBucket("vlab", { public: true }).catch(() => {});
    const path = `narration/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const { error: upErr } = await admin.storage.from("vlab").upload(path, Buffer.from(d.audio_base64, "base64"), { contentType: "audio/mpeg", upsert: true });
    if (upErr) return NextResponse.json({ error: "audio upload failed" }, { status: 502 });
    const { data: pub } = admin.storage.from("vlab").getPublicUrl(path);
    return NextResponse.json({ audioUrl: pub.publicUrl, seconds: Math.round(seconds * 10) / 10 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "narration failed" }, { status: 500 });
  }
}
