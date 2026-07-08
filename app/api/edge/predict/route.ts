import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { predict, predictMany, isBulkPrompt } from "@/lib/edge/engine";

export const runtime = "nodejs";
export const maxDuration = 120; // provider fetches + web research + Opus (bulk analyses several)

/**
 * EDGE — natural-language sports prediction. Admin-only while the platform
 * matures (same allow-list as the Trading Desk). Real data only: the engine
 * resolves a live fixture, gathers verified stats/odds/injuries + web research,
 * runs the explainable model, and Opus interprets — nothing is fabricated.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { question?: string };
  const question = (body.question || "").trim();
  if (!question) return NextResponse.json({ error: "ask a question" }, { status: 400 });
  if (question.length > 500) return NextResponse.json({ error: "question too long" }, { status: 400 });

  try {
    // Broad prompts ("all remaining World Cup fixtures", "today's NBA games",
    // or several matchups at once) return a LIST; a single named match returns
    // one deep report.
    if (isBulkPrompt(question)) {
      const reports = await predictMany(question, new Date(), 10);
      if (!reports.length) return NextResponse.json({ error: "couldn't resolve any fixtures for that — try naming the competition (e.g. 'World Cup') or two teams." }, { status: 422 });
      return NextResponse.json({ reports });
    }
    const report = await predict(question);
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "prediction failed" }, { status: 500 });
  }
}
