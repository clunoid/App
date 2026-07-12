import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { chargeCredits, refundSplit } from "@/lib/billing/meter";
import { ACTION_COSTS } from "@/lib/billing/costs";
import { careerUser } from "@/lib/career/access";
import { extractRequirements } from "@/lib/career/ai";
import { matchResume } from "@/lib/career/match";
import { rowToApplication } from "@/lib/career/store";
import type { ResumeDoc } from "@/lib/career/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET  — the tracker: every application, newest first.
 * POST — { jd } analyze a job posting: Claude extracts the requirements, then the
 *        DETERMINISTIC matcher (lib/career/match.ts) scores the stored master
 *        resume against them — the score is computed in code, never by a model.
 */

export async function GET() {
  const gate = await careerUser();
  if ("error" in gate) return gate.error;
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from("career_applications").select("*").eq("user_id", gate.user.id).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "Couldn't load applications." }, { status: 500 });
  return NextResponse.json({ applications: (data || []).map(rowToApplication) });
}

export async function POST(req: NextRequest) {
  const gate = await careerUser();
  if ("error" in gate) return gate.error;

  const body = (await req.json().catch(() => ({}))) as { jd?: string };
  const jd = (body.jd || "").trim();
  if (jd.length < 80) return NextResponse.json({ error: "Paste the full job description (it looks too short to analyze)." }, { status: 400 });
  if (jd.length > 60_000) return NextResponse.json({ error: "That posting is too long." }, { status: 400 });

  const supabase = await getSupabaseServer();
  const { data: prof } = await supabase.from("career_profiles").select("resume, resume_text").eq("user_id", gate.user.id).maybeSingle();
  if (!prof) return NextResponse.json({ error: "profile" }, { status: 409 }); // set up the master resume first

  const charge = await chargeCredits("career_analyze", ACTION_COSTS.career_analyze, {}, gate.user);
  if (!charge.ok) return NextResponse.json({ error: charge.status === 429 ? "rate" : "credits" }, { status: charge.status });

  try {
    const requirements = await extractRequirements(jd);
    const match = matchResume(prof.resume as ResumeDoc, (prof.resume_text as string) || "", requirements);
    const { data, error } = await supabase
      .from("career_applications")
      .insert({ user_id: gate.user.id, company: requirements.company, role: requirements.title, jd_text: jd, requirements, match })
      .select("*")
      .single();
    if (error || !data) throw new Error("Couldn't save the application.");
    return NextResponse.json({ application: rowToApplication(data) });
  } catch (e) {
    await refundSplit(gate.user.id, charge.fromBalance, charge.fromPurchased, "career_analyze");
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analysis failed." }, { status: 422 });
  }
}
