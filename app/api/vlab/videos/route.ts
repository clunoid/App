import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { hasFal } from "@/lib/vlab/fal";
import { screenplay, critique } from "@/lib/vlab/plan";

export const runtime = "nodejs";
export const maxDuration = 300; // two full Opus passes (screenplay + ruthless critic)

/**
 * VLAB videos.
 * GET  — history (newest first).
 * POST { topic } — the THINKING step, where all the money is protected: Opus
 *   writes the complete story screenplay, then a second adversarial Opus pass
 *   corrects it (story completeness, factual mechanism, continuity, pacing).
 *   The result is persisted as a 'planned' video; production (the expensive
 *   part) is a separate explicit step in the studio.
 */

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  if (!hasFal()) return NextResponse.json({ error: "unconfigured" }, { status: 501 });
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from("vlab_videos").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "load failed" }, { status: 500 });
  return NextResponse.json({ videos: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  if (!hasFal()) return NextResponse.json({ error: "unconfigured" }, { status: 501 });

  const body = (await req.json().catch(() => ({}))) as { topic?: string };
  const topic = (body.topic || "").trim();
  if (topic.length < 8) return NextResponse.json({ error: "Describe the topic in a full sentence." }, { status: 400 });

  try {
    const draft = await screenplay(topic);
    const plan = await critique(topic, draft).catch(() => draft); // critic is best-effort — never lose the draft
    if (!plan.shots?.length) throw new Error("empty screenplay");
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
      .from("vlab_videos")
      .insert({ user_id: user.id, topic, title: plan.title, plan, status: "planned" })
      .select("*")
      .single();
    if (error || !data) throw new Error("save failed");
    return NextResponse.json({ video: data });
  } catch {
    return NextResponse.json({ error: "Screenwriting failed — try again." }, { status: 502 });
  }
}
