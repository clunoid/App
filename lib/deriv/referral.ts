"use client";

/**
 * Ask the server whether the connected Deriv account is our referral (gates MT5).
 * Server-side check (allowlist + optional MyAffiliates); fail-safe → false.
 */
export async function checkDerivReferral(accessToken: string): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const res = await fetch("/api/deriv/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    if (!res.ok) return false;
    const j = (await res.json().catch(() => ({ referred: false }))) as { referred?: boolean };
    return !!j.referred;
  } catch {
    return false;
  }
}
