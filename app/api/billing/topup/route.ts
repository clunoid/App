import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { polarClient, creditsProductId } from "@/lib/billing/polar";
import { MIN_TOPUP_CENTS } from "@/lib/billing/costs";

export const runtime = "nodejs";

const MAX_TOPUP_CENTS = 1_000_000; // $10,000 sanity cap (guards a fat-finger amount)

/**
 * Start a custom-amount ("pay what you want", min $5) Polar checkout to BUY CREDITS.
 * Polar is Merchant of Record — we never touch card data; it also saves the card so
 * auto-reload can charge off-session later. Credits are granted by the
 * signature-verified `order.paid` webhook (grant_topup, idempotent per order id).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  let body: { amountCents?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body → falls to the min check below */
  }
  let amountCents = Math.round(Number(body.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < MIN_TOPUP_CENTS) {
    return NextResponse.json({ error: "min", minCents: MIN_TOPUP_CENTS }, { status: 400 });
  }
  amountCents = Math.min(amountCents, MAX_TOPUP_CENTS);

  const productId = creditsProductId();
  const polar = polarClient();
  if (!polar || !productId) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const origin = new URL(req.url).origin;
  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      amount: amountCents, // override the PWYW product price with the chosen amount
      successUrl: `${origin}/pricing?topup=1`,
      externalCustomerId: user.id,
      customerEmail: user.email ?? undefined,
      metadata: { user_id: user.id, kind: "topup" },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("[billing/topup] failed:", e);
    return NextResponse.json({ error: "checkout-failed" }, { status: 502 });
  }
}
