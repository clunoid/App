import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * At the start of a game or search, ask whether Isaac (the premium ElevenLabs
 * voice) should host this session. Free users get him for their FIRST game and
 * FIRST search, then it's off — fall back to the browser voice / paced text and
 * invite them to subscribe. Subscribers always get him. Server-authoritative:
 * the one-time trial can't be reset client-side, and /api/tts independently
 * enforces it per line.
 */
export async function POST(req: NextRequest) {
  let feature: unknown;
  try {
    ({ feature } = await req.json());
  } catch {
    return NextResponse.json({ isaac: false }, { status: 400 });
  }
  if (feature !== "game" && feature !== "search") return NextResponse.json({ isaac: false }, { status: 400 });

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("grant_isaac", { p_feature: feature });
  return NextResponse.json({ isaac: !error && data === true });
}
