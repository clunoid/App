import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { chargeCredits, refundSplit } from "@/lib/billing/meter";
import { ACTION_COSTS } from "@/lib/billing/costs";
import { careerUser } from "@/lib/career/access";
import { generateCoverLetter, generateInterviewPack, generateOutreach, generateTailoredResume } from "@/lib/career/ai";
import { rowToApplication } from "@/lib/career/store";
import { DOC_KINDS, type ApplicationDocs, type DocKind, type JobRequirements, type MatchReport, type ResumeDoc } from "@/lib/career/types";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * POST { kind: "resume" | "cover" | "outreach" | "interview" } — generate one
 * document for this application and store it in `docs`. Every generator runs
 * under the grounding contract (lib/career/ai.ts): nothing is ever invented;
 * ungroundable claims come back as warnings, not content. The tailored resume —
 * the money document — runs on Opus; the rest on Sonnet.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const gate = await careerUser();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind as DocKind;
  if (!DOC_KINDS.includes(kind)) return NextResponse.json({ error: "Bad document kind." }, { status: 400 });

  const supabase = await getSupabaseServer();
  const [{ data: app }, { data: prof }] = await Promise.all([
    supabase.from("career_applications").select("*").eq("id", id).eq("user_id", gate.user.id).maybeSingle(),
    supabase.from("career_profiles").select("resume, resume_text").eq("user_id", gate.user.id).maybeSingle(),
  ]);
  if (!app) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!prof) return NextResponse.json({ error: "profile" }, { status: 409 });
  if (!app.requirements || !app.match) return NextResponse.json({ error: "Analyze the posting first." }, { status: 400 });

  const charge = await chargeCredits("career_generate", ACTION_COSTS.career_generate, { kind }, gate.user);
  if (!charge.ok) return NextResponse.json({ error: charge.status === 429 ? "rate" : "credits" }, { status: charge.status });

  try {
    const doc = prof.resume as ResumeDoc;
    const raw = (prof.resume_text as string) || "";
    const requirements = app.requirements as JobRequirements;
    const match = app.match as MatchReport;

    const docs = ((app.docs as ApplicationDocs) || {}) as ApplicationDocs;
    if (kind === "resume") docs.resume = await generateTailoredResume(doc, raw, requirements, match);
    else if (kind === "cover") docs.cover = await generateCoverLetter(doc, raw, requirements, match);
    else if (kind === "outreach") docs.outreach = await generateOutreach(doc, raw, requirements, match);
    else docs.interview = await generateInterviewPack(doc, raw, requirements, match);

    const { data, error } = await supabase
      .from("career_applications")
      .update({ docs, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", gate.user.id)
      .select("*")
      .maybeSingle();
    if (error || !data) throw new Error("Couldn't save the document.");
    return NextResponse.json({ application: rowToApplication(data) });
  } catch (e) {
    await refundSplit(gate.user.id, charge.fromBalance, charge.fromPurchased, "career_generate");
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed." }, { status: 422 });
  }
}
