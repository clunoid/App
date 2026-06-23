import { NextRequest, NextResponse } from "next/server";
import { orchestrate } from "@/lib/brain/orchestrate";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { BrainRequest, BrainContext } from "@/lib/brain/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: BrainRequest;
  try {
    body = (await req.json()) as BrainRequest;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const ctx: BrainContext = {
    user: body.user ?? { isAuthed: false },
    // Accurate time/locale from the browser (so Isaac never gets the date wrong).
    now: body.client?.now ?? new Date().toISOString(),
    timezone: body.client?.timezone,
    locale: body.client?.locale,
  };

  // Coarse location hint for personalization (best-effort; raw IP is never stored —
  // we only use presence of a forwarded address to decide to set the timezone hint).
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd && !fwd.startsWith("127.") && fwd !== "::1") ctx.location = body.client?.timezone;

  // Enrich context from Supabase when the user is signed in (RLS-scoped; never
  // service-role). Best-effort — never blocks the answer.
  try {
    const supabase = await getSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      ctx.user = {
        name: (user.user_metadata?.name as string) || (user.user_metadata?.full_name as string) || body.user?.name,
        email: user.email,
        createdAt: user.created_at,
        isAuthed: true,
      };
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.display_name) ctx.user.name = profile.display_name;
    }
  } catch {
    // Not signed in, or DB unreachable — continue with minimal context.
  }

  try {
    const scene = await orchestrate(body, ctx);
    return NextResponse.json(scene);
  } catch (err) {
    console.error("brain error:", err);
    return NextResponse.json({
      say: "Sorry — my thoughts tangled for a second there. Could you say that again?",
      expectsInput: "voice",
    });
  }
}
