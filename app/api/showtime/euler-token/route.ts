import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * Mints a SHORT-LIVED Euler Stream JWT so the admin's browser can open the managed
 * TikTok LIVE WebSocket (wss://ws.eulerstream.com) WITHOUT ever seeing the API key.
 * Admin-only. Returns 501 {error:"unconfigured"} until EULER_API_KEY + EULER_ACCOUNT_ID
 * are set (so the rest of Showtime — Simulate, the OBS stage — still ships and works).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.EULER_API_KEY;
  const accountId = process.env.EULER_ACCOUNT_ID;
  if (!apiKey || !accountId) return NextResponse.json({ error: "unconfigured" }, { status: 501 });

  const room = (((await req.json().catch(() => ({}))) as { room?: string }).room || "").replace(/^@/, "").trim().toLowerCase().slice(0, 80);
  if (!room) return NextResponse.json({ error: "room required" }, { status: 400 });

  try {
    const mod = await import("tiktok-live-api-sdk");
    const EulerStreamApiClient = (mod as { default?: unknown }).default ?? mod;
    const client = new (EulerStreamApiClient as new (o: { apiKey: string }) => { authentication: { createJWT: (acct: string, opts: unknown) => Promise<{ data?: { token?: string } }> } })({ apiKey });
    const resp = await client.authentication.createJWT(accountId, {
      expireAfter: 120, // seconds — short-lived; the WS stays open once handshaked
      websockets: { allowedCreators: [room], maxWebSockets: 2 },
    });
    const token = resp?.data?.token;
    if (!token) return NextResponse.json({ error: "no token returned" }, { status: 502 });
    return NextResponse.json({ token, uniqueId: room });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "euler error" }, { status: 502 });
  }
}
