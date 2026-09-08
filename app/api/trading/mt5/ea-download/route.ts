import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkCode, EA_FILE } from "@/lib/deriv/mt5/eaAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The General MT5 EA, to somebody holding a code that was issued to them.
 *
 * The file used to sit in public/ and was therefore a link anybody could share.
 * Gating the BUTTON would have changed nothing at all — the URL was the
 * download. It lives in content/mt5/ now, beside every other gated EA, and this
 * route is the only way to it.
 *
 * The code is checked against the browser that asked for it, not just against
 * the list of valid codes: an approved code that worked for whoever it was
 * forwarded to would put the file back where it started within a week.
 */

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { code?: unknown; visitorId?: unknown };
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";

  if (!code || !visitorId) {
    return NextResponse.json({ error: "Enter the code you were sent." }, { status: 400 });
  }

  const check = await checkCode(code, visitorId);
  if (!check.ok) {
    if (check.why === "unavailable") {
      return NextResponse.json({ error: "We could not check that code just now. Try again in a moment." }, { status: 503 });
    }
    if (check.why === "not-yours") {
      return NextResponse.json(
        { error: "That code was issued to a different browser. Open the support window on the device you asked from, or ask us for a new one." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "That code was not recognised. Check it and try again." }, { status: 403 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(process.cwd(), "content", "mt5", EA_FILE));
  } catch (e) {
    console.error("[ea] file read failed:", e);
    return NextResponse.json({ error: "The file is temporarily unavailable." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${EA_FILE}"`,
      "Cache-Control": "no-store",
    },
  });
}
