import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { chargeCredits, refundSplit } from "@/lib/billing/meter";
import { ACTION_COSTS } from "@/lib/billing/costs";
import { careerUser } from "@/lib/career/access";
import { parseResume } from "@/lib/career/ai";
import type { CareerProfile, ResumeDoc } from "@/lib/career/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The master resume. GET returns it (or {profile:null} before first setup);
 * PUT accepts { text } and/or { pdfBase64 }, parses it into a structured
 * ResumeDoc with Claude (extraction only — nothing embellished) and stores both
 * the structure and the raw text (the raw text stays the grounding source of
 * truth for every later generation).
 */

export async function GET() {
  const gate = await careerUser();
  if ("error" in gate) return gate.error;
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from("career_profiles").select("resume, resume_text, updated_at").eq("user_id", gate.user.id).maybeSingle();
  if (!data) return NextResponse.json({ profile: null });
  const profile: CareerProfile = { resume: data.resume as ResumeDoc, resumeText: (data.resume_text as string) || "", updatedAt: String(data.updated_at) };
  return NextResponse.json({ profile });
}

export async function PUT(req: NextRequest) {
  const gate = await careerUser();
  if ("error" in gate) return gate.error;

  const body = (await req.json().catch(() => ({}))) as { text?: string; pdfBase64?: string };
  const text = (body.text || "").trim();
  const pdfBase64 = (body.pdfBase64 || "").trim();
  if (!text && !pdfBase64) return NextResponse.json({ error: "Paste your resume text or upload a PDF." }, { status: 400 });
  if (text.length > 60_000) return NextResponse.json({ error: "That resume text is too long." }, { status: 400 });
  // ~4MB binary ≈ 5.6MB base64 — a sane ceiling for a resume PDF
  if (pdfBase64.length > 6_000_000) return NextResponse.json({ error: "PDF too large — keep it under 4MB." }, { status: 400 });

  const charge = await chargeCredits("career_parse", ACTION_COSTS.career_parse, {}, gate.user);
  if (!charge.ok) return NextResponse.json({ error: charge.status === 429 ? "rate" : "credits" }, { status: charge.status });

  try {
    const resume = await parseResume({ text: text || undefined, pdfBase64: pdfBase64 || undefined });
    const supabase = await getSupabaseServer();
    // when a PDF was uploaded without pasted text, keep a text rendering of the
    // parsed structure as the raw grounding text
    const resumeText = text || resumeToText(resume);
    const { error } = await supabase.from("career_profiles").upsert({ user_id: gate.user.id, resume, resume_text: resumeText, updated_at: new Date().toISOString() });
    if (error) throw new Error("Couldn't save your profile — try again.");
    const profile: CareerProfile = { resume, resumeText, updatedAt: new Date().toISOString() };
    return NextResponse.json({ profile });
  } catch (e) {
    await refundSplit(gate.user.id, charge.fromBalance, charge.fromPurchased, "career_parse");
    return NextResponse.json({ error: e instanceof Error ? e.message : "Resume parsing failed." }, { status: 422 });
  }
}

/** Plain-text rendering of a structured resume (grounding text for PDF-only uploads). */
function resumeToText(r: ResumeDoc): string {
  const lines: string[] = [r.name, r.headline, [r.email, r.phone, r.location].filter(Boolean).join(" · "), ...r.links, "", "SUMMARY", r.summary, "", "SKILLS", r.skills.join(", ")];
  for (const e of r.experience) {
    lines.push("", `${e.title} — ${e.company} (${[e.start, e.end].filter(Boolean).join(" – ")})${e.location ? ` · ${e.location}` : ""}`);
    for (const b of e.bullets) lines.push(`• ${b}`);
  }
  if (r.education.length) lines.push("", "EDUCATION", ...r.education.map((e) => `${e.degree} — ${e.school}${e.year ? ` (${e.year})` : ""}`));
  if (r.certifications.length) lines.push("", "CERTIFICATIONS", ...r.certifications);
  if (r.extras.length) lines.push("", "ADDITIONAL", ...r.extras);
  return lines.join("\n");
}
