import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";

export const runtime = "nodejs";

/**
 * Switch the app between "trading" (default public face) and "classic" (the full
 * original Clunoid). Setting CLASSIC requires an admin session — so only the
 * owner can reveal the classic app; everyone else stays on the trading platform.
 * Clearing back to trading is open (it only re-hides already-public content).
 * Middleware reads the `clunoid_mode` cookie this sets.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const wantClassic = body.mode === "classic";

  if (wantClassic) {
    const user = await requireUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const res = NextResponse.json({ mode: wantClassic ? "classic" : "trading" });
  if (wantClassic) {
    res.cookies.set("clunoid_mode", "classic", { path: "/", maxAge: 60 * 60 * 24 * 90, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  } else {
    res.cookies.delete("clunoid_mode");
  }
  return res;
}
