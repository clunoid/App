import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasFal } from "@/lib/vlab/fal";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * VLAB — Isaac narrates the whole script in ONE take (natural flow between
 * lines, like a real narrator), and the character-level timestamps are mapped
 * back to the per-shot lines so every clip can be CUT to its exact spoken
 * window. Returns { audioUrl, seconds, lines: [{ start, end }] } — the timing
 * source of truth for the final edit. Audio is stored in the public `vlab`
 * bucket so the compose step can pull it by URL.
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

  const body = (await req.json().catch(() => ({}))) as { lines?: string[] };
  const lines = (body.lines || []).map((l) => String(l || "").trim()).filter(Boolean);
  if (!lines.length) return NextResponse.json({ error: "lines required" }, { status: 400 });
  const text = lines.join(" ").slice(0, 3_000);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        // documentary-narrator read: steady, warm, a touch slower than chat
        voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true, speed: 0.96 },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return NextResponse.json({ error: `voice ${res.status}` }, { status: 502 });
    const d = (await res.json()) as {
      audio_base64?: string;
      alignment?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] };
    };
    const al = d.alignment;
    if (!d.audio_base64 || !al?.characters?.length || !al.character_start_times_seconds || !al.character_end_times_seconds) {
      return NextResponse.json({ error: "no timed audio returned" }, { status: 502 });
    }

    // Map each line to its [start, end] in the spoken audio by walking the
    // character alignment along the exact joined text we sent.
    const timings: { start: number; end: number }[] = [];
    let cursor = 0; // index into the alignment characters (mirrors `text`)
    for (let li = 0; li < lines.length; li++) {
      const lineLen = lines[li].length;
      const startIdx = cursor;
      const endIdx = Math.min(cursor + lineLen - 1, al.characters.length - 1);
      timings.push({
        start: Math.round((al.character_start_times_seconds[startIdx] ?? 0) * 1000) / 1000,
        end: Math.round((al.character_end_times_seconds[endIdx] ?? 0) * 1000) / 1000,
      });
      cursor = endIdx + 1 + 1; // +1 past line end, +1 for the joining space
    }
    const ends = al.character_end_times_seconds;
    const seconds = Math.round(ends[ends.length - 1] * 100) / 100;

    await admin.storage.createBucket("vlab", { public: true }).catch(() => {});
    const path = `narration/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const { error: upErr } = await admin.storage.from("vlab").upload(path, Buffer.from(d.audio_base64, "base64"), { contentType: "audio/mpeg", upsert: true });
    if (upErr) return NextResponse.json({ error: "audio upload failed" }, { status: 502 });
    const { data: pub } = admin.storage.from("vlab").getPublicUrl(path);
    return NextResponse.json({ audioUrl: pub.publicUrl, seconds, lines: timings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "narration failed" }, { status: 500 });
  }
}
