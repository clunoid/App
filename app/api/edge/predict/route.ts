import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { chargeCredits, chargeError, refundSplit } from "@/lib/billing/meter";
import { ACTION_COSTS } from "@/lib/billing/costs";
import { edgeDenied } from "@/lib/edge/access";
import { predict, predictMany, isBulkPrompt } from "@/lib/edge/engine";

export const runtime = "nodejs";
export const maxDuration = 120; // provider fetches + web research + Opus (bulk analyses several)

/**
 * EDGE — natural-language sports prediction. A Pro/Max feature: any subscriber (or
 * a user holding purchased credits) may use it, charged per analysis; admins are
 * free. Real data only: the engine resolves a live fixture, gathers verified
 * stats/odds/injuries + web research, runs the explainable model, and Opus
 * interprets — nothing is fabricated. Gating is server-authoritative (can't be
 * bypassed) and the charge is refunded if nothing resolves.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const denied = await edgeDenied(user);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { question?: string };
  const question = (body.question || "").trim();
  if (!question) return NextResponse.json({ error: "ask a question" }, { status: 400 });
  if (question.length > 500) return NextResponse.json({ error: "question too long" }, { status: 400 });

  const bulk = isBulkPrompt(question);
  const charge = await chargeCredits("edge_analyze", ACTION_COSTS.edge_analyze, { q: question.slice(0, 80), bulk }, user);
  if (!charge.ok) return chargeError(charge);

  try {
    // Broad prompts ("all remaining World Cup fixtures", "today's NBA games",
    // or several matchups at once) return a LIST; a single named match returns
    // one deep report.
    if (bulk) {
      const reports = await predictMany(question, new Date(), 10);
      if (!reports.length) {
        await refundSplit(user.id, charge.fromBalance, charge.fromPurchased, "edge_analyze");
        return NextResponse.json({ error: "couldn't resolve any fixtures for that — try naming the competition (e.g. 'World Cup') or two teams." }, { status: 422 });
      }
      return NextResponse.json({ reports });
    }
    // NB: do NOT refund the single "no fixture resolved" case — that path still runs
    // a paid Tavily advanced web search (real vendor spend), so a full refund would
    // let an entitled user pull free paid searches at net-zero credits. It's charged.
    // (The bulk path IS refunded above because its no-resolve path does no web search.)
    const report = await predict(question);
    return NextResponse.json({ report });
  } catch (e) {
    await refundSplit(user.id, charge.fromBalance, charge.fromPurchased, "edge_analyze");
    return NextResponse.json({ error: e instanceof Error ? e.message : "prediction failed" }, { status: 500 });
  }
}
