import { NextRequest } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { planForProduct, grantForPlan } from "@/lib/billing/polar";

export const runtime = "nodejs";

/** Minimal, defensive view of the subscription/order fields we need. */
type EventData = {
  id?: string;
  productId?: string | null;
  customerId?: string | null;
  currentPeriodEnd?: string | Date | null;
  customer?: { externalId?: string | null; email?: string | null };
  subscription?: { id?: string; currentPeriodEnd?: string | Date | null } | null;
  metadata?: Record<string, unknown> | null;
};

function resolveUserId(d: EventData): string | null {
  const fromCustomer = d.customer?.externalId;
  const fromMeta = typeof d.metadata?.user_id === "string" ? (d.metadata!.user_id as string) : null;
  return fromCustomer || fromMeta || null;
}

function periodEndIso(d: EventData): string | null {
  const v = d.currentPeriodEnd ?? d.subscription?.currentPeriodEnd ?? null;
  if (!v) return null;
  const date = v instanceof Date ? v : new Date(v);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** Set/refresh a paid plan + refill its monthly credit grant. */
async function activate(admin: SupabaseClient, d: EventData): Promise<void> {
  const userId = resolveUserId(d);
  const plan = planForProduct(d.productId);
  if (!userId || !plan) return;
  await admin.rpc("apply_subscription", {
    p_user: userId,
    p_plan: plan,
    p_status: "active",
    p_grant: grantForPlan(plan),
    p_polar_customer: d.customerId ?? null,
    p_polar_subscription: d.subscription?.id ?? d.id ?? null,
    p_period_end: periodEndIso(d),
  });
}

/** Subscription ended → back to the free plan + free grant. */
async function downgrade(admin: SupabaseClient, d: EventData): Promise<void> {
  const userId = resolveUserId(d);
  if (!userId) return;
  await admin.rpc("apply_subscription", {
    p_user: userId,
    p_plan: "free",
    p_status: "canceled",
    p_grant: grantForPlan("free"),
    p_polar_customer: d.customerId ?? null,
    p_polar_subscription: d.id ?? null,
    p_period_end: null,
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return new Response("unconfigured", { status: 503 });

  const body = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  let event;
  try {
    event = validateEvent(body, headers, secret);
  } catch (e) {
    if (e instanceof WebhookVerificationError) return new Response("invalid signature", { status: 403 });
    return new Response("bad request", { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return new Response("admin unavailable", { status: 503 });

  try {
    const d = event.data as unknown as EventData;
    switch (event.type) {
      // A payment landed (initial purchase OR a renewal) → grant the month's credits.
      case "order.paid":
      // Activation events also set/refresh the plan (idempotent — apply_subscription SETS, not adds).
      case "subscription.created":
      case "subscription.active":
      case "subscription.uncanceled":
        await activate(admin, d);
        break;
      // Subscription truly ended → drop to free. (canceled = scheduled-at-period-end,
      // past_due, updated → ignored; the user keeps access until it's revoked.)
      case "subscription.revoked":
        await downgrade(admin, d);
        break;
      default:
        break;
    }
  } catch (e) {
    console.error("[billing/webhook] handler error:", e);
    return new Response("error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
