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

/** Our paid plan id → Polar product id. */
export const PLAN_PRODUCT: Record<Exclude<PlanId, "free">, string | undefined> = {
  pro: process.env.POLAR_PRODUCT_PRO,
  max: process.env.POLAR_PRODUCT_MAX,
};

/** Polar product id → our plan id (used by the webhook). */
export function planForProduct(productId: string | null | undefined): PlanId | null {
  if (!productId) return null;
  if (productId === process.env.POLAR_PRODUCT_PRO) return "pro";
  if (productId === process.env.POLAR_PRODUCT_MAX) return "max";
  return null;
}

export const grantForPlan = (plan: PlanId): number => PLAN_GRANTS[plan];
