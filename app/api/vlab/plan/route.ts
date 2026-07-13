import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { planShort } from "@/lib/vlab/plan";
import { hasFal } from "@/lib/vlab/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

/** VLAB pilot — Opus writes the Zack-style production plan for ANY topic.
 *  Admin-only (pilot; no billing wiring — it lives or dies on the quality verdict). */

/** Gate probe for the console's on-load state: 401 / 403 / 501 / {ok:true}. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  if (!hasFal()) return NextResponse.json({ error: "unconfigured" }, { status: 501 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  if (!hasFal()) return NextResponse.json({ error: "unconfigured" }, { status: 501 });

  const body = (await req.json().catch(() => ({}))) as { topic?: string };
  const topic = (body.topic || "").trim();
  if (topic.length < 8) return NextResponse.json({ error: "Describe the topic in a full sentence." }, { status: 400 });

  try {
    const plan = await planShort(topic);
    if (!plan.shots.length) throw new Error("empty plan");
    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ error: "Planning failed — try again." }, { status: 502 });
  }
}
