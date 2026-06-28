import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import { polarClient, productFor, upgradeDiscountId, type Interval } from "@/lib/billing/polar";

export const runtime = "nodejs";

/**
 * Start a Polar hosted checkout for a plan + interval. We never touch card data —
 * Polar collects payment (Merchant of Record). The buyer is tagged with our user
 * id so the webhook can resolve them. A Pro→Max upgrade gets the incentive
 * discount applied automatically (server-verified — never trusts the client's
 * claimed current plan).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  let body: { plan?: string; interval?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const plan = body.plan === "max" ? "max" : body.plan === "pro" ? "pro" : null;
  if (!plan) return NextResponse.json({ error: "bad-plan" }, { status: 400 });
  const interval: Interval = body.interval === "annual" ? "annual" : "monthly";

  const productId = productFor(plan, interval);
  const polar = polarClient();
  if (!polar || !productId) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  // Upgrade incentive: only a CURRENT Pro subscriber buying Max gets the discount.
  let discountId: string | undefined;
  if (plan === "max") {
    const supabase = await getSupabaseServer();
    const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
    if (sub?.plan === "pro") discountId = upgradeDiscountId();
  }

  const origin = new URL(req.url).origin;
  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${origin}/pricing?upgraded=1`,
      externalCustomerId: user.id,
      customerEmail: user.email ?? undefined,
      metadata: { user_id: user.id, plan },
      ...(discountId ? { discountId } : {}),
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("[billing/checkout] failed:", e);
    return NextResponse.json({ error: "checkout-failed" }, { status: 502 });
  }
}
