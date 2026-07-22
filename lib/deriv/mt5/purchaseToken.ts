import "server-only";
import { cookies } from "next/headers";

/**
 * The device purchase token — the "exact device" a guest paid on.
 *
 * A guest can buy before they have an account. We mint a random token, keep it
 * in a first-party httpOnly cookie, and use it as the Polar externalCustomerId
 * so the paid order is recorded against this browser. When the buyer signs up,
 * the claim step matches this exact token and binds those purchases to their
 * account — after which the account is the source of truth, so it works on any
 * device once signed in.
 */
const COOKIE = "clunoid_mt5_pt";
const TWO_YEARS = 60 * 60 * 24 * 730;

/** Read the current device token, or null. */
export async function readPurchaseToken(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE)?.value ?? null;
}

/** Read the token, minting + persisting one if this device doesn't have it yet. */
export async function ensurePurchaseToken(): Promise<string> {
  const c = await cookies();
  const existing = c.get(COOKIE)?.value;
  if (existing) return existing;
  const token = "dev_" + crypto.randomUUID();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TWO_YEARS,
  });
  return token;
}
