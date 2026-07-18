import { NextResponse } from "next/server";
import { DERIV_CLIENT_ID } from "@/lib/deriv/config";

/**
 * Is the connected Deriv user OUR referral? (Gates the MT5 EA download.)
 *
 * Feasibility note: Deriv exposes NO real-time API for a third-party app to confirm
 * a specific connected user is a given affiliate's referral — referral reporting is
 * dashboard-only, with up to a 24h delay (the only programmatic route is the
 * MyAffiliates API, which needs the OWNER's API credentials). So verification here is:
 *
 *   1. ALLOWLIST — `DERIV_MT5_REFERRALS` env: comma-separated Deriv account ids the
 *      owner grants MT5 (their own + confirmed referrals). Reliable, owner-controlled.
 *   2. MYAFFILIATES (optional) — if the owner sets MYAFFILIATES_HOST/USER/PASS +
 *      DERIV_AFFILIATE_ID, we also check their referred-customers feed. Best-effort,
 *      fail-safe (errors → not referred). Left off until credentials are provided.
 *
 * Spoof-proof: the client sends its access token; the SERVER derives the real login
 * ids from Deriv before checking, so a user can't claim someone else's account.
 * Fail-safe: anything unexpected → { referred: false } (they just see the create CTA).
 */

const ALLOWLIST = (process.env.DERIV_MT5_REFERRALS || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function loginidsFor(accessToken: string): Promise<string[]> {
  try {
    const res = await fetch("https://api.derivws.com/trading/v1/options/accounts", {
      headers: { Authorization: `Bearer ${accessToken}`, "Deriv-App-ID": DERIV_CLIENT_ID },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as { data?: Array<{ account_id?: string }> } | null;
    return Array.isArray(json?.data) ? json!.data.map((a) => String(a.account_id || "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Optional MyAffiliates referred-customers check — only runs when the owner has
 *  configured credentials. Best-effort + fail-safe. */
async function viaMyAffiliates(loginids: string[]): Promise<boolean> {
  const host = process.env.MYAFFILIATES_HOST, user = process.env.MYAFFILIATES_USER, pass = process.env.MYAFFILIATES_PASS, affId = process.env.DERIV_AFFILIATE_ID;
  if (!host || !user || !pass || !affId || !loginids.length) return false;
  try {
    const auth = Buffer.from(`${user}:${pass}`).toString("base64");
    const res = await fetch(`${host.replace(/\/$/, "")}/feeds.php?FEED_ID=customers&AFFILIATE_ID=${encodeURIComponent(affId)}`, {
      headers: { Authorization: `Basic ${auth}` }, cache: "no-store",
    });
    if (!res.ok) return false;
    const feed = (await res.text()).toLowerCase();
    return loginids.some((l) => feed.includes(l.toLowerCase()));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { accessToken?: string };
    const token = typeof body.accessToken === "string" ? body.accessToken : "";
    if (!token) return NextResponse.json({ referred: false });

    const loginids = await loginidsFor(token);
    if (!loginids.length) return NextResponse.json({ referred: false });

    const allowed = loginids.some((l) => ALLOWLIST.includes(l.toLowerCase()));
    const referred = allowed || (await viaMyAffiliates(loginids));
    return NextResponse.json({ referred });
  } catch {
    return NextResponse.json({ referred: false });
  }
}
