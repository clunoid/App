import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth/requireUser";
import { paidMt5, isPaidMt5, userOwnsMt5 } from "@/lib/deriv/mt5/products";

export const runtime = "nodejs";

/**
 * Serve a paid automation's .mq5 file — but ONLY to a signed-in user who owns it.
 * The paid files live in content/mt5/ (outside public/), so this route is the
 * only way to reach them; the free general EA stays a public static download and
 * never touches this route.
 *
 * 401 → not signed in (client asks them to sign in / sign up).
 * 402 → signed in but hasn't bought it (client shows the purchase popup).
 */
type Ctx = { params: Promise<{ botId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { botId } = await params;
  if (!isPaidMt5(botId)) return new NextResponse("not found", { status: 404 });

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const owned = await userOwnsMt5(user.id, botId);
  if (!owned) return NextResponse.json({ error: "not-owned" }, { status: 402 });

  const prod = paidMt5(botId)!;
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(process.cwd(), "content", "mt5", prod.file));
  } catch (e) {
    console.error("[mt5/download] file read failed:", prod.file, e);
    return new NextResponse("unavailable", { status: 500 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${prod.file}"`,
      "Cache-Control": "no-store",
    },
  });
}
