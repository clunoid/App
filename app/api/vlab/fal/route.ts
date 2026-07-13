import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { falFollow, falSubmit, hasFal } from "@/lib/vlab/fal";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * VLAB pilot — the fal.ai queue proxy. POST submits to a WHITELISTED model;
 * GET ?url= follows a queue.fal.run status/response URL. The key stays server-
 * side; admin-only; model + URL allow-lists live in lib/vlab/fal.ts.
 */

async function gate() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  if (!hasFal()) return NextResponse.json({ error: "unconfigured" }, { status: 501 });
  return null;
}

export async function POST(req: NextRequest) {
  const denied = await gate();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { model?: string; input?: unknown };
  if (!body.model || body.input === undefined) return NextResponse.json({ error: "model and input required" }, { status: 400 });
  try {
    return NextResponse.json(await falSubmit(body.model, body.input));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "submit failed" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const denied = await gate();
  if (denied) return denied;
  const url = req.nextUrl.searchParams.get("url") || "";
  try {
    const { status, body } = await falFollow(url);
    return NextResponse.json(body as Record<string, unknown>, { status: status === 200 ? 200 : status === 202 ? 200 : status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "poll failed" }, { status: 502 });
  }
}
