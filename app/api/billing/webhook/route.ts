import { NextRequest } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { planForProduct, grantForPlan } from "@/lib/billing/polar";

export const runtime = "nodejs";

/** Defensive view of the order / subscription fields we read. */
type EventData = {
  id?: string;
  status?: string;
  productId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  currentPeriodEnd?: string | Date | null;
  cancelAtPeriodEnd?: boolean | null;
  canceledAt?: string | Date | null;
  customer?: { externalId?: string | null; email?: string | null };
  metadata?: Record<string, unknown> | null;
};

/** Resolve our user id: external id (set via externalCustomerId) → checkout
 *  metadata → look it up by the Polar customer id (stored on a prior event). */
async function resolveUser(admin: SupabaseClient, d: EventData): Promise<string | null> {
  const direct = d.customer?.externalId || (typeof d.metadata?.user_id === "string" ? (d.metadata!.user_id as string) : null);
  if (direct) return direct;
  if (d.customerId) {
    const { data } = await admin.from("subscriptions").select("user_id").eq("polar_customer_id", d.customerId).maybeSingle();
    return (data?.user_id as string) ?? null;
  }
  return null;
}

function periodEndIso(d: EventData): string | null {
  const v = d.currentPeriodEnd ?? null;
  if (!v) return null;
  const date = v instanceof Date ? v : new Date(v);
  return isNaN(date.getTime()) ? null : date.toISOString();
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
    const userId = await resolveUser(admin, d);

    switch (event.type) {
      // ── credits are granted ONLY for a confirmed PAID order (idempotent per order id) ──
      case "order.paid": {
        const plan = planForProduct(d.productId);
        if (!userId) console.warn("[webhook] order.paid: unresolved user", d.id);
        if (userId && plan) {
          await admin.rpc("grant_for_order", {
            p_order_id: d.id ?? null,
            p_user: userId,
            p_plan: plan,
            p_grant: grantForPlan(plan),
            p_polar_customer: d.customerId ?? null,
            p_polar_subscription: d.subscriptionId ?? null,
            p_period_end: periodEndIso(d),
          });
        }
        break;
      }

      // ── subscription lifecycle → sync plan/status meta only (NO credit change) ──
      case "subscription.created":
      case "subscription.active":
      case "subscription.updated":
      case "subscription.uncanceled":
      case "subscription.canceled": {
        const plan = planForProduct(d.productId);
        if (userId && plan) {
          const status = d.cancelAtPeriodEnd || d.canceledAt ? "canceled" : d.status || "active";
          await admin.rpc("sync_subscription", {
            p_user: userId,
            p_plan: plan,
            p_status: status,
            p_period_end: periodEndIso(d),
            p_polar_customer: d.customerId ?? null,
            p_polar_subscription: d.id ?? null,
          });
        }
        break;
      }

      // ── access ended → back to free ──
      case "subscription.revoked": {
        if (userId) await admin.rpc("downgrade_to_free", { p_user: userId });
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("[billing/webhook] handler error:", e);
    return new Response("error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
