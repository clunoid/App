import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";

export const runtime = "nodejs";

/**
 * The VAPID PUBLIC key the browser needs to create a push subscription. Public
 * by design (it is the "application server key" the spec sends to the push
 * service), but still admin-gated so the endpoint's existence doesn't advertise
 * the feature. The private key is never exposed anywhere.
 */
export async function GET() {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "push not configured" }, { status: 503 });
  return NextResponse.json({ vapidPublicKey: key });
}
