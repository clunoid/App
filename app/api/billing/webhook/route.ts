import { NextRequest } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { planForProduct, grantForPlan, isCreditsProduct } from "@/lib/billing/polar";
import { creditsForCents, MAX_TOPUP_CENTS } from "@/lib/billing/costs";
import { botForProduct } from "@/lib/deriv/mt5/products";

export const runtime = "nodejs";

/** Defensive view of the order / subscription fields we read. */
type EventData = {
  id?: string;
  status?: string;
  netAmount?: number | null; // paid amount in cents (after discount, before tax) — for credit top-ups
  productId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  currentPeriodEnd?: string | Date | null;
  cancelAtPeriodEnd?: boolean | null;
  canceledAt?: string | Date | null;
  customer?: { externalId?: string | null; email?: string | null };
  metadata?: Record<string, unknown> | null;
};

/** Resolve our user id from a SIGNATURE-VERIFIED order. externalCustomerId (which
 *  we set to the authenticated user.id at every checkout) is the authoritative
 *  identity; we deliberately do NOT trust event metadata as a user id (hardening
 *  against any future buyer-settable metadata). Fallback: the Polar customer id we
 *  stored on a prior event. */
async function resolveUser(admin: SupabaseClient, d: EventData): Promise<string | null> {
  if (d.customer?.externalId) return d.customer.externalId;
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
        // A paid MT5 automation (one-time EA). Its identity is the checkout's
        // external id — a user id for a signed-in buyer, or a "dev_" device token
        // for a guest who will sign up later. Recorded ahead of the user guard
        // because a guest purchase has no resolved user yet. Idempotent on order id.
        const mt5Bot = botForProduct(d.productId);
        if (mt5Bot && d.id) {
          const ext = d.customer?.externalId ?? (typeof userId === "string" ? userId : null);
          const isDeviceToken = typeof ext === "string" && ext.startsWith("dev_");
          // ignoreDuplicates → ON CONFLICT DO NOTHING. order.paid is terminal and
          // Polar delivers at-least-once; a redelivery must NOT overwrite the row,
          // or it would reset a guest's user_id back to null AFTER the claim linked
          // it, silently revoking a paid user's access.
          await admin.from("mt5_purchases").upsert(
            {
              order_id: d.id,
              bot_id: mt5Bot,
              purchase_token: isDeviceToken ? ext : null,
              user_id: isDeviceToken ? null : ext,
              email: d.customer?.email ?? null,
            },
            { onConflict: "order_id", ignoreDuplicates: true },
          );
          break;
        }

        if (!userId) {
          console.warn("[webhook] order.paid: unresolved user", d.id);
          break;
        }
        const plan = planForProduct(d.productId);
        if (plan) {
          // subscription / plan order → grant the plan's monthly allowance
          await admin.rpc("grant_for_order", {
            p_order_id: d.id ?? null,
            p_user: userId,
            p_plan: plan,
            p_grant: grantForPlan(plan),
            p_polar_customer: d.customerId ?? null,
            p_polar_subscription: d.subscriptionId ?? null,
            p_period_end: periodEndIso(d),
          });
        } else if (isCreditsProduct(d.productId)) {
          // one-time credit top-up (manual or auto-reload) → add purchased credits.
          // Bound netAmount to [0, MAX_TOPUP_CENTS] so a misconfigured product price
          // can never mint unbounded credits (checkout already caps at $10k).
          const net = typeof d.netAmount === "number" ? d.netAmount : 0;
          const credits = creditsForCents(Math.min(Math.max(0, net), MAX_TOPUP_CENTS));
          if (credits > 0 && d.id) {
            await admin.rpc("grant_topup", {
              p_order_id: d.id,
              p_user: userId,
              p_credits: credits,
              p_polar_customer: d.customerId ?? null,
            });
          }
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
