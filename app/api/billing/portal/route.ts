import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { polarClient } from "@/lib/billing/polar";

export const runtime = "nodejs";

/**
 * Return a Polar customer-portal URL so the user can manage / cancel / update
 * their subscription and payment method. 404 if they've never subscribed (no
 * Polar customer exists yet).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const polar = polarClient();
  if (!polar) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  try {
    const session = await polar.customerSessions.create({ externalCustomerId: user.id });
    return NextResponse.json({ url: session.customerPortalUrl });
  } catch (e) {
    console.error("[billing/portal] failed:", e);
    return NextResponse.json({ error: "no-customer" }, { status: 404 });
  }
}
