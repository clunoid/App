import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { polarClient, creditsAutoProductId } from "@/lib/billing/polar";

export const runtime = "nodejs";

/**
 * Off-session AUTO-RELOAD. If the user is eligible (auto-reload on, total credits
 * below their threshold, not already reloading, cooldown elapsed), atomically CLAIM
 * the reload (server-authoritative — one winner, so no double-charge) and charge
 * their saved card via Polar (ordersCreate → finalize). Credits are added by the
 * signature-verified `order.paid` webhook (grant_topup, idempotent per order id).
 *
 * The client pings this after credit-spending actions; it's a fast no-op when the
 * user isn't eligible. Requires the Polar org to have `off_session_charges_enabled`
 * and the user to have a saved card (from a prior checkout).
 */
export async function POST() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  // Atomic eligibility check + lock (keys on auth.uid()).
  const { data: claim } = await supabase.rpc("claim_auto_reload");
  const c = (claim ?? null) as { claim?: boolean; amount_cents?: number } | null;
  if (!c?.claim || !c.amount_cents) return NextResponse.json({ reloaded: false, reason: "not-eligible" });

  const amountCents = c.amount_cents;
  const admin = getSupabaseAdmin();
  const polar = polarClient();
  const productId = creditsAutoProductId();

  // Always release the in-flight lock (and start the cooldown), success or fail.
  const release = async () => {
    try {
      await admin?.rpc("finish_auto_reload", { p_user: user.id, p_mark_attempt: true });
    } catch {
      /* best effort */
    }
  };

  if (!polar || !productId || !admin) {
    await release();
    return NextResponse.json({ reloaded: false, reason: "unconfigured" });
  }

  try {
    // Resolve the Polar customer by our external id (set at the original checkout).
    const customer = await polar.customers.getExternal({ externalId: user.id });
    const order = await polar.orders.create({
      customerId: customer.id,
      productId,
      amount: amountCents, // override the (free) product's price with the reload amount
      metadata: { user_id: user.id, kind: "topup", source: "auto" },
    });
    // Synchronous off-session charge — throws (4xx) on decline / missing card / SCA.
    await polar.orders.finalize({ id: order.id });
    await release();
    // Credits land via the order.paid webhook (grant_topup).
    return NextResponse.json({ reloaded: true });
  } catch (e) {
    console.warn("[billing/auto-reload] off-session charge failed:", (e as Error)?.message);
    await release();
    return NextResponse.json({ reloaded: false, reason: "charge-failed" });
  }
}
