import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { careerUser } from "@/lib/career/access";
import { matchResume } from "@/lib/career/match";
import { rowToApplication } from "@/lib/career/store";
import { APPLICATION_STATUSES, type ApplicationStatus, type JobRequirements, type ResumeDoc } from "@/lib/career/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One tracked application.
 * PATCH — { status?, notes?, rescore? }: tracker updates are free; rescore re-runs
 *         the DETERMINISTIC matcher against the current master resume (no AI call,
 *         so also free) — used after the user updates their resume.
 * DELETE — remove the application. RLS guarantees owner-only on every query.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await careerUser();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from("career_applications").select("*").eq("id", id).eq("user_id", gate.user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ application: rowToApplication(data) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await careerUser();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string; notes?: string; rescore?: boolean };

  const supabase = await getSupabaseServer();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    if (!APPLICATION_STATUSES.includes(body.status as ApplicationStatus)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    patch.status = body.status;
  }
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 8_000);

  if (body.rescore) {
    const [{ data: app }, { data: prof }] = await Promise.all([
      supabase.from("career_applications").select("requirements").eq("id", id).eq("user_id", gate.user.id).maybeSingle(),
      supabase.from("career_profiles").select("resume, resume_text").eq("user_id", gate.user.id).maybeSingle(),
    ]);
    if (!app?.requirements || !prof) return NextResponse.json({ error: "Nothing to rescore." }, { status: 400 });
    patch.match = matchResume(prof.resume as ResumeDoc, (prof.resume_text as string) || "", app.requirements as JobRequirements);
  }

  const { data, error } = await supabase.from("career_applications").update(patch).eq("id", id).eq("user_id", gate.user.id).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Update failed." }, { status: 500 });
  return NextResponse.json({ application: rowToApplication(data) });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const gate = await careerUser();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("career_applications").delete().eq("id", id).eq("user_id", gate.user.id);
  if (error) return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
