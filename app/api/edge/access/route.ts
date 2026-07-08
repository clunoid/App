import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { edgeEntitled } from "@/lib/edge/access";

export const runtime = "nodejs";

/**
 * On-open entitlement check for the Edge UI. Advisory — it drives whether the
 * console/studio ENABLE their inputs — but it shares `edgeEntitled` with the real
 * per-action gate (edgeDenied), so it can't disagree, and it never charges or runs
 * AI. The binding enforcement is still the atomic gate + charge on every
 * /api/edge/* action route, so a client that ignores this can't actually run
 * anything or spend a vendor call for free.
 */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ authed: false, entitled: false });
  return NextResponse.json({ authed: true, entitled: await edgeEntitled(user) });
}
