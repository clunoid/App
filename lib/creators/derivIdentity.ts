import { DERIV_CLIENT_ID } from "@/lib/deriv/config";

/**
 * CREATOR PROGRAM — proving who someone is by their Deriv account.
 *
 * A creator on a new phone has no token, and their email is already taken, so
 * without this they are stuck. The way out is the one thing that follows them
 * between devices: the Deriv account they connected.
 *
 * The important part is that the browser is never believed. It sends its own
 * Deriv ACCESS TOKEN, and we ask Deriv which accounts that token belongs to.
 * Anyone can type an account id; only the real owner has a working token for it.
 * So this is authentication, not a lookup.
 */

const REST_BASE = "https://api.derivws.com";

/** Every options account id this access token can actually reach, lowercased. */
export async function derivAccountIds(accessToken: string): Promise<string[]> {
  const token = typeof accessToken === "string" ? accessToken.trim() : "";
  // Deriv's own tokens are ory_at_… — anything else is not worth a round trip.
  if (!token.startsWith("ory_at_") || token.length < 20) return [];

  try {
    const res = await fetch(`${REST_BASE}/trading/v1/options/accounts`, {
      headers: { Authorization: `Bearer ${token}`, "Deriv-App-ID": DERIV_CLIENT_ID },
      // Never serve a cached answer for something being used as identity.
      cache: "no-store",
    });
    if (!res.ok) return [];

    const json = (await res.json().catch(() => null)) as { data?: Array<{ account_id?: string; account_type?: string }> } | null;
    const rows = json?.data ?? [];

    return rows
      // Demo accounts are handed out freely and prove nothing about a person.
      .filter((a) => !/demo|virtual/i.test(a.account_type ?? "") && !/^vr/i.test(a.account_id ?? ""))
      .map((a) => (a.account_id ?? "").trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** The one we store against a creator: their first real options account. */
export async function primaryDerivId(accessToken: string): Promise<string | null> {
  const ids = await derivAccountIds(accessToken);
  return ids[0] ?? null;
}
