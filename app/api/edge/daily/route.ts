import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { chargeCredits, chargeError, refundSplit } from "@/lib/billing/meter";
import { ACTION_COSTS } from "@/lib/billing/costs";
import { edgeDenied } from "@/lib/edge/access";
import { dailyPredictions } from "@/lib/edge/engine";

export const runtime = "nodejs";
export const maxDuration = 120; // fans out across the covered competitions + 10 light analyses

/**
 * EDGE — "Today's Top 10 Predictions". A Pro/Max feature: the daily slate across the
 * most-watched competitions (Premier League, World Cup, La Liga, Champions League …),
 * each with its best-chance pick. Charged per generation from the user's credits;
 * gating is server-authoritative (can't be bypassed) and the charge is refunded if no
 * fixtures resolve.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const denied = await edgeDenied(user);
  if (denied) return denied;

  const charge = await chargeCredits("edge_daily", ACTION_COSTS.edge_daily, {}, user);
  if (!charge.ok) return chargeError(charge);

  try {
    const reports = await dailyPredictions(new Date(), 10);
    if (!reports.length) {
      await refundSplit(user.id, charge.fromBalance, charge.fromPurchased, "edge_daily");
      return NextResponse.json({ error: "No upcoming fixtures to predict right now — check back closer to matchday." }, { status: 422 });
    }
    return NextResponse.json({ reports });
  } catch (e) {
    await refundSplit(user.id, charge.fromBalance, charge.fromPurchased, "edge_daily");
    return NextResponse.json({ error: e instanceof Error ? e.message : "daily predictions failed" }, { status: 500 });
  }
}
