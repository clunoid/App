import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { polarClient } from "@/lib/billing/polar";
import { paidMt5, isPaidMt5 } from "@/lib/deriv/mt5/products";
import { ensurePurchaseToken } from "@/lib/deriv/mt5/purchaseToken";

export const runtime = "nodejs";

/**
 * Start a Polar checkout for a paid MT5 automation. We never touch card data —
 * Polar is Merchant of Record. The buyer is tied to the order by externalCustomerId:
 *   - signed in  → their auth user id (purchase binds straight to the account).
 *   - guest      → a device token in a first-party cookie (bound to the account
 *                  later, when they sign up — "pay then sign up").
 * Either way the order.paid webhook records it, and the download route checks it.
 */
export async function POST(req: NextRequest) {
  let body: { botId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const botId = body.botId ?? "";
  if (!isPaidMt5(botId)) return NextResponse.json({ error: "not-a-paid-bot" }, { status: 400 });

  const prod = paidMt5(botId);
  const polar = polarClient();
  if (!polar || !prod?.productId) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const user = await requireUser();
  const externalCustomerId = user ? user.id : await ensurePurchaseToken();

  const origin = new URL(req.url).origin;
  try {
    const checkout = await polar.checkouts.create({
      products: [prod.productId],
      externalCustomerId,
      customerEmail: user?.email ?? undefined,
      successUrl: `${origin}/trading/${prod.section === "mt5" ? "mt5" : "deriv/mt5"}/${botId}?purchased=1`,
      metadata: { bot_id: botId },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("[mt5/checkout] failed:", e);
    return NextResponse.json({ error: "checkout-failed" }, { status: 502 });
  }
}
