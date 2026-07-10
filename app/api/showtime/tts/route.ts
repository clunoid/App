import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { verifyStageKey } from "@/lib/showtime/server/sign";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Stage voice line synthesis — Isaac + Cluno host the stream. Authorized by signed
 * stage credentials (or an admin session for console previews). This is the owner's
 * own admin-only stage, so no credit metering — cost control is the client-side
 * priority queue (pre-rendered stock lines + capped live name-reads) plus the
 * server caps here (text length + a per-instance rate backstop).
 */

const MAX_CHARS = 220;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30; // hard backstop; the client queue stays well under this
let winStart = 0;
let winCount = 0;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { k?: string; s?: string; text?: string; speaker?: string };

  let authorized = false;
  if (body.k && body.s && verifyStageKey(body.k, body.s)) authorized = true;
  if (!authorized) {
    const user = await requireUser();
    if (user && isAdmin(user)) authorized = true;
  }
  if (!authorized) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceIsaac = process.env.ELEVENLABS_VOICE_ID;
  const voiceCluno = process.env.ELEVENLABS_VOICE_ID_FEMALE;
  if (!apiKey || !voiceIsaac) return NextResponse.json({ error: "unconfigured" }, { status: 501 });

  const text = String(body.text || "").trim().slice(0, MAX_CHARS);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const voiceId = body.speaker === "cluno" && voiceCluno ? voiceCluno : voiceIsaac;

  const now = Date.now();
  if (now - winStart > WINDOW_MS) {
    winStart = now;
    winCount = 0;
  }
  if (++winCount > MAX_PER_WINDOW) return NextResponse.json({ error: "rate" }, { status: 429 });

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25 },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `tts ${res.status}` }, { status: 502 });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return NextResponse.json({ error: "empty audio" }, { status: 502 });
    return NextResponse.json({ audio: buf.toString("base64"), mime: "audio/mpeg" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "tts error" }, { status: 502 });
  }
}
