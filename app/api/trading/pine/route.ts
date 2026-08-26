import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The ARDE Pine source — for the owner, and nobody else.
 *
 * Reached by double-clicking the TradingView logo on /trading/tradingview. That
 * gesture is a convenience, NOT the protection: anybody can find a hidden
 * button, and the strategy is the same one the Deriv and MT5 bots run, so
 * handing it out would let people trade against our own signals.
 *
 * So the real gate is here, server-side, and it is an admin check. A visitor who
 * discovers the double-click gets exactly what a visitor should get: 404. Not
 * 401 or 403 — those would confirm a file exists and invite a second attempt.
 */

const FILE = "ClunoidARDE.pine";

export async function GET() {
  const user = await requireUser();
  if (!isAdmin(user)) return new NextResponse("not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(process.cwd(), "content", "pine", FILE));
  } catch (e) {
    console.error("[pine] file read failed:", e);
    return new NextResponse("unavailable", { status: 500 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILE}"`,
      "Cache-Control": "no-store",
    },
  });
}
