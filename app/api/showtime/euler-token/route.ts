import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { verifyStageKey } from "@/lib/showtime/server/sign";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * Mints a SHORT-LIVED Euler Stream JWT so the STAGE (the page captured into TikTok
 * LIVE Studio) can open the managed TikTok LIVE WebSocket without ever seeing the
 * API key. Authorized by EITHER an admin session (console) OR signed stage
 * credentials (the sessionless stage presents {k, s} from its URL fragment).
 * Returns 501 {error:"unconfigured"} until EULER_API_KEY + EULER_ACCOUNT_ID are set
 * (so the simulator and the OBS stage still ship and work with no TikTok wiring).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { room?: string; k?: string; s?: string };

  let authorized = false;
  if (body.k && body.s && verifyStageKey(body.k, body.s)) authorized = true;
  if (!authorized) {
    const user = await requireUser();
    if (user && isAdmin(user)) authorized = true;
  }
  if (!authorized) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.EULER_API_KEY;
  const accountId = process.env.EULER_ACCOUNT_ID;
  if (!apiKey || !accountId) return NextResponse.json({ error: "unconfigured" }, { status: 501 });

  const room = (body.room || "").replace(/^@/, "").trim().toLowerCase().slice(0, 80);
  if (!room) return NextResponse.json({ error: "room required" }, { status: 400 });

  try {
    const mod = await import("tiktok-live-api-sdk");
    const EulerStreamApiClient = (mod as { default?: unknown }).default ?? mod;
    const client = new (EulerStreamApiClient as new (o: { apiKey: string }) => { authentication: { createJWT: (acct: string, opts: unknown) => Promise<{ data?: { token?: string } }> } })({ apiKey });
    const resp = await client.authentication.createJWT(accountId, {
      // The JWT lifetime bounds the WebSocket's max lifetime (Euler closes it with
      // 4555 MAX_LIFETIME_EXCEEDED at expiry). 1h keeps the live connection stable;
      // the feed reconnects seamlessly when it does expire.
      expireAfter: 3600, // seconds (1 hour)
      websockets: { allowedCreators: [room], maxWebSockets: 2 },
    });
    const token = resp?.data?.token;
    if (!token) return NextResponse.json({ error: "no token returned" }, { status: 502 });
    return NextResponse.json({ token, uniqueId: room });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "euler error" }, { status: 502 });
  }
}
