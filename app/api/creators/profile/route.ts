import { NextRequest, NextResponse } from "next/server";
import { db, findCreator, normaliseHandle, isPayoutMethod, trim } from "@/lib/creators/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CREATOR PROGRAM — update the things a creator is allowed to change.
 *
 * Handles and payout rail only. Name, email, country and the dates are set at
 * registration and by us; letting the browser rewrite them would let someone
 * move their own start date.
 *
 * Handles are unique across the programme, so the same account cannot be used to
 * hold two seats — a clash comes back as a plain 409, not a database error.
 */

type Body = {
  token?: string;
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  payoutMethod?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const admin = db();
  if (!admin) return NextResponse.json({ error: "Not available right now." }, { status: 503 });

  const creator = await findCreator(admin, body.token);
  if (!creator) return NextResponse.json({ error: "No creator found." }, { status: 404 });

  const patch: Record<string, string | null> = {};

  // Only touch a field the caller actually sent, so saving one thing does not
  // blank another.
  for (const key of ["tiktok", "instagram", "youtube"] as const) {
    if (body[key] === undefined) continue;
    patch[key] = normaliseHandle(body[key]);
  }

  if (body.payoutMethod !== undefined) {
    const m = trim(body.payoutMethod).toLowerCase();
    if (!isPayoutMethod(m)) return NextResponse.json({ error: "Pick one of the payout methods listed." }, { status: 400 });
    patch.payout_method = m;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await admin.from("trading_creator_applications").update(patch).eq("id", creator.id);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That account is already registered by another creator." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
