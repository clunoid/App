/**
 * PAID MT5 AUTOMATIONS — the map from a bot slug to its Polar product, price and
 * private EA file, plus the server-side ownership check.
 *
 * The general automation is FREE and is not in here — it downloads with no gate.
 * The five dedicated automations are one-time Polar purchases. Prices are the
 * source of truth for what the UI shows; the Polar product carries the real
 * charge (kept in sync by hand — if you change a price in Polar, change it here).
 */
import "server-only";
import { polarClient } from "@/lib/billing/polar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PaidMt5 = {
  botId: string;
  productId: string | undefined; // Polar product id (from env)
  priceUsd: number; // display price, tax handled by Polar (Merchant of Record)
  file: string; // the private .mq5 filename under content/mt5/
  section: "deriv" | "mt5"; // which platform the bot lives under (drives the success URL)
};

/**
 * Slug → paid product. Two families share the exact same pay-then-signup gate:
 *   - section "deriv" → the dedicated Deriv MT5 automations at /trading/deriv/mt5.
 *   - section "mt5"   → the standalone MetaTrader 5 platform automations at /trading/mt5.
 * The general (Deriv) and Aggressive (MT5-platform) automations are FREE and are
 * not in here — they download with no gate. Order matches each catalogue.
 */
export const PAID_MT5: Record<string, PaidMt5> = {
  // Deriv MT5 dedicated automations
  gold: { botId: "gold", productId: process.env.POLAR_PRODUCT_MT5_GOLD, priceUsd: 297, file: "ClunoidGoldMT5.mq5", section: "deriv" },
  crypto: { botId: "crypto", productId: process.env.POLAR_PRODUCT_MT5_CRYPTO, priceUsd: 197, file: "ClunoidCryptoMT5.mq5", section: "deriv" },
  forex: { botId: "forex", productId: process.env.POLAR_PRODUCT_MT5_FOREX, priceUsd: 147, file: "ClunoidForexMT5.mq5", section: "deriv" },
  indices: { botId: "indices", productId: process.env.POLAR_PRODUCT_MT5_INDICES, priceUsd: 127, file: "ClunoidIndicesMT5.mq5", section: "deriv" },
  volatility: { botId: "volatility", productId: process.env.POLAR_PRODUCT_MT5_VOLATILITY, priceUsd: 99, file: "ClunoidVolatilityMT5.mq5", section: "deriv" },

  // Standalone MetaTrader 5 platform automations (/trading/mt5)
  momentum: { botId: "momentum", productId: process.env.POLAR_PRODUCT_MT5P_MOMENTUM, priceUsd: 425, file: "ClunoidMomentumMT5.mq5", section: "mt5" },
  "crypto-momentum": { botId: "crypto-momentum", productId: process.env.POLAR_PRODUCT_MT5P_CRYPTOMOMO, priceUsd: 349, file: "ClunoidCryptoTrendMT5.mq5", section: "mt5" },
  "volatility-breakout": { botId: "volatility-breakout", productId: process.env.POLAR_PRODUCT_MT5P_VOLBREAK, priceUsd: 249, file: "ClunoidVolBreakoutMT5.mq5", section: "mt5" },
  "crypto-ls": { botId: "crypto-ls", productId: process.env.POLAR_PRODUCT_MT5P_CRYPTOLS, priceUsd: 199, file: "ClunoidCryptoLSMT5.mq5", section: "mt5" },
  "index-dip": { botId: "index-dip", productId: process.env.POLAR_PRODUCT_MT5P_INDEXDIP, priceUsd: 149, file: "ClunoidDipMT5.mq5", section: "mt5" },
  orb: { botId: "orb", productId: process.env.POLAR_PRODUCT_MT5P_ORB, priceUsd: 99, file: "ClunoidORBMT5.mq5", section: "mt5" },
};

export const isPaidMt5 = (botId: string): boolean => botId in PAID_MT5;
export const paidMt5 = (botId: string): PaidMt5 | undefined => PAID_MT5[botId];

/** Polar product id → our bot slug (for the webhook). */
export function botForProduct(productId: string | null | undefined): string | null {
  if (!productId) return null;
  for (const p of Object.values(PAID_MT5)) if (p.productId === productId) return p.botId;
  return null;
}

/**
 * Does this signed-in user own this automation? Two independent sources, either
 * is sufficient:
 *   1. Our ledger (mt5_purchases) — written by the webhook and the claim step.
 *   2. A live Polar order lookup by the user's external id — the safety net for
 *      the seconds before the webhook lands on a signed-in direct purchase.
 * Reads use the service-role client, so RLS never hides a row from us.
 */
export async function userOwnsMt5(userId: string, botId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data } = await admin
      .from("mt5_purchases")
      .select("order_id")
      .eq("user_id", userId)
      .eq("bot_id", botId)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }

  // Safety net: ask Polar directly whether this external customer has a paid
  // order for the product. Never throws out — a Polar hiccup just falls through
  // to "not owned yet", and the ledger still covers the normal case.
  const prod = PAID_MT5[botId];
  const polar = polarClient();
  if (!polar || !prod?.productId) return false;
  try {
    const res = await polar.orders.list({ externalCustomerId: userId, productId: prod.productId });
    for await (const page of res) {
      for (const o of page.result.items) {
        if (o.paid && o.productId === prod.productId) return true;
      }
    }
  } catch {
    /* ignore — treat as not owned */
  }
  return false;
}

/**
 * Has a GUEST already paid for this automation on this device? Checks the ledger
 * for a paid order recorded against the device token, whether or not it has been
 * claimed to an account yet. This is what stops a paid-but-not-yet-signed-up
 * visitor from being shown the buy button again (and charged twice) after a
 * reload — the proof of purchase lives in the cookie + ledger, not in the URL.
 */
export async function guestOwnsMt5(purchaseToken: string, botId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin
    .from("mt5_purchases")
    .select("order_id")
    .eq("purchase_token", purchaseToken)
    .eq("bot_id", botId)
    .limit(1)
    .maybeSingle();
  return !!data;
}
