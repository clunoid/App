import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WHERE THE VISITOR IS — one header, nothing else.
 *
 * Vercel stamps the requester's country on every request. The phone field asks
 * for it once so the calling code is already right when the form opens; the
 * person can still change it. Nothing is stored; there is nothing here to store.
 */
export function GET(req: NextRequest) {
  const country = String(req.headers.get("x-vercel-ip-country") || "").toUpperCase().slice(0, 2);
  return NextResponse.json({ country: /^[A-Z]{2}$/.test(country) ? country : "" }, { headers: { "Cache-Control": "private, no-store" } });
}
