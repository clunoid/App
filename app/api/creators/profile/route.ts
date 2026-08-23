import { NextRequest, NextResponse } from "next/server";
import { db, findCreator, loadHandles, normaliseHandle, setPlatforms, isPayoutMethod, trim } from "@/lib/creators/account";
import { parsePlatformChoice, PLATFORMS_REQUIRED } from "@/lib/creators/platforms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CREATOR PROGRAM — update the things a creator is allowed to change.
 *
 * Platforms, handles, the payout rail, and whether the accounts are brand new.
 * Name, email, country and the dates are set at registration and by us; letting
 * the browser rewrite them would let someone move their own start date.
 *
 * Handles are unique across the programme, so the same account cannot be used to
 * hold two seats — a clash comes back as a plain 409, not a database error.
 */

type Body = {
  token?: string;
  platforms?: string[];
  handles?: Record<string, string>;
  newAccounts?: boolean;
  payoutMethod?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const admin = db();
  if (!admin) return NextResponse.json({ error: "Not available right now." }, { status: 503 });

  const creator = await findCreator(admin, body.token);
  if (!creator) return NextResponse.json({ error: "No creator found." }, { status: 404 });

  // ── which platforms they post on ─────────────────────────────────────────
  if (body.platforms !== undefined) {
    const picked = parsePlatformChoice(body.platforms);
    if (!picked) {
      return NextResponse.json(
        { error: `Choose exactly ${PLATFORMS_REQUIRED} platforms to post on.` },
        { status: 400 },
      );
    }
    await setPlatforms(admin, creator.id, picked);
  }

  // ── the handles themselves ───────────────────────────────────────────────
  if (body.handles) {
    const chosen = await loadHandles(admin, creator.id);
    const allowed = new Set(chosen.map((h) => h.platform));

    for (const [platform, raw] of Object.entries(body.handles)) {
      // Silently ignore a handle for a platform they are not posting on, rather
      // than storing something the dashboard will never show them.
      if (!allowed.has(platform)) continue;

      const { error } = await admin
        .from("trading_creator_handles")
        .upsert(
          { application_id: creator.id, platform, handle: normaliseHandle(raw) },
          { onConflict: "application_id,platform" },
        );

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json(
            { error: "That account is already registered by another creator." },
            { status: 409 },
          );
        }
        return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
      }
    }
  }

  const patch: Record<string, string | boolean | null> = {};

  // Brand-new accounts change the first month's rate. We verify it ourselves
  // before paying, so a creator correcting their own tick costs nothing.
  if (typeof body.newAccounts === "boolean") patch.new_accounts = body.newAccounts;

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
