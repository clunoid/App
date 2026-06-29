import { Polar } from "@polar-sh/sdk";
import { PLAN_GRANTS, type PlanId } from "./costs";

/** Which Polar environment our token/products live in (set in .env / Vercel). */
export const polarServer: "sandbox" | "production" = process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production";

/** Server-only Polar API client. Returns null until POLAR_ACCESS_TOKEN is set. */
export function polarClient(): Polar | null {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new Polar({ accessToken, server: polarServer });
}

export type Interval = "monthly" | "annual";
export type PaidPlan = "pro" | "max";

/** plan + interval → Polar product id. */
export function productFor(plan: PaidPlan, interval: Interval): string | undefined {
  if (plan === "pro") return interval === "annual" ? process.env.POLAR_PRODUCT_PRO_ANNUAL : process.env.POLAR_PRODUCT_PRO;
  return interval === "annual" ? process.env.POLAR_PRODUCT_MAX_ANNUAL : process.env.POLAR_PRODUCT_MAX;
}

/** Polar product id → our plan id (covers BOTH monthly and annual products). */
export function planForProduct(productId: string | null | undefined): PlanId | null {
  if (!productId) return null;
  if (productId === process.env.POLAR_PRODUCT_PRO || productId === process.env.POLAR_PRODUCT_PRO_ANNUAL) return "pro";
  if (productId === process.env.POLAR_PRODUCT_MAX || productId === process.env.POLAR_PRODUCT_MAX_ANNUAL) return "max";
  return null;
}

export const grantForPlan = (plan: PlanId): number => PLAN_GRANTS[plan];

/** Discount id for the Pro→Max upgrade incentive (set per environment; optional). */
export const upgradeDiscountId = (): string | undefined => process.env.POLAR_DISCOUNT_UPGRADE || undefined;

// ── Credit top-ups ─────────────────────────────────────────────────────────────
/** The pay-what-you-want one-time "Credits" product, for user-present top-up checkouts. */
export const creditsProductId = (): string | undefined => process.env.POLAR_PRODUCT_CREDITS || undefined;
/** A fixed/free one-time product used for OFF-SESSION auto-reload charges (ordersCreate
 *  requires a fixed/free product; we override the amount). Falls back to the PWYW one. */
export const creditsAutoProductId = (): string | undefined =>
  process.env.POLAR_PRODUCT_CREDITS_AUTO || process.env.POLAR_PRODUCT_CREDITS || undefined;

/** True if a Polar product id is one of our credit (top-up / auto-reload) products. */
export function isCreditsProduct(productId: string | null | undefined): boolean {
  if (!productId) return false;
  return productId === process.env.POLAR_PRODUCT_CREDITS || productId === process.env.POLAR_PRODUCT_CREDITS_AUTO;
}
