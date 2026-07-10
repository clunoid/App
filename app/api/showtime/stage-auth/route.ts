import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { signStageKey } from "@/lib/showtime/server/sign";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * Admin-only: mint the server signature for a stage key. The console calls this once
 * and embeds key+signature in the OBS URL fragment; the sessionless stage presents
 * the pair to the other /api/showtime routes as its credential.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const k = String((((await req.json().catch(() => ({}))) as { k?: string }).k || "")).trim();
  if (!/^[a-f0-9]{16,64}$/.test(k)) return NextResponse.json({ error: "bad key" }, { status: 400 });

  const s = signStageKey(k);
  if (!s) return NextResponse.json({ error: "unconfigured" }, { status: 501 });
  return NextResponse.json({ s });
}
