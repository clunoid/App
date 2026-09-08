import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The ARDE Pine source, served to whoever asks.
 *
 * Reached by double-clicking the TradingView logo on /trading/tradingview.
 *
 * This route used to require an admin account — matched against a single
 * Supabase user id — and answered everyone else with a 404. That locked the
 * owner out of it too on any session signed in as anything else, which is why
 * the gate is gone. The double-click is now the only thing standing in front of
 * the file: undiscoverable, not protected. Anybody who knows the gesture, or
 * simply requests /api/trading/pine, gets the strategy.
 */

const FILE = "ClunoidARDE.pine";

export async function GET() {
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
