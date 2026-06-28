import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { polarClient, PLAN_PRODUCT } from "@/lib/billing/polar";

export const runtime = "nodejs";

/**
 * Start a Polar hosted checkout for a plan. We never touch card data — Polar
 * collects payment on its own page and is the Merchant of Record. We tag the
 * checkout with the user's id (externalCustomerId + metadata) so the webhook can
 * resolve our user on the resulting subscription.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  let body: { plan?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const plan = body.plan === "max" ? "max" : body.plan === "pro" ? "pro" : null;
  if (!plan) return NextResponse.json({ error: "bad-plan" }, { status: 400 });

  const productId = PLAN_PRODUCT[plan];
  const polar = polarClient();
  if (!polar || !productId) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const origin = new URL(req.url).origin;
  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${origin}/pricing?upgraded=1`,
      externalCustomerId: user.id,
      customerEmail: user.email ?? undefined,
      metadata: { user_id: user.id, plan },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("[billing/checkout] failed:", e);
    return NextResponse.json({ error: "checkout-failed" }, { status: 502 });
  }
}
