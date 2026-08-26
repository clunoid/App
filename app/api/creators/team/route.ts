import { NextRequest, NextResponse } from "next/server";
import { db, findCreator, trim } from "@/lib/creators/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CREATOR TEAM — linking two creators up by code.
 *
 * The link handles most of it, but people forget: someone joins on their own
 * and only afterwards remembers a friend sent them. So either of them can enter
 * the other's code and say which way round it goes.
 *
 * Which way matters — it decides who gets paid — so the caller has to state it
 * rather than us guessing. Both directions do the same thing: write referred_by
 * on the person who was brought in.
 *
 * Rules, in the order they are checked:
 *   · The code must belong to somebody, and not to you.
 *   · Whoever is being credited must not already have a referrer. A referral is
 *     recorded once and cannot be reassigned, or the first person to notice
 *     could take a team member off someone else.
 *   · No loops. If they are already under you, you cannot also go under them.
 */

type Body = {
  token?: string;
  /** The Deriv token this browser holds. Without it, a device that has no
   *  valid access token of its own can load the dashboard (me/ accepts it) but
   *  every action here would fail with "no creator found" - which is exactly
   *  the dead end it was added to prevent. */
  derivAccess?: string;
  code?: string;
  /** "they_referred_me" — the code owner brought me in.
   *  "i_referred_them" — I brought the code owner in. */
  direction?: "they_referred_me" | "i_referred_them";
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const admin = db();
  if (!admin) return NextResponse.json({ error: "Not available right now." }, { status: 503 });

  const me = await findCreator(admin, body.token, body.derivAccess);
  if (!me) return NextResponse.json({ error: "No creator found." }, { status: 404 });

  const direction = body.direction;
  if (direction !== "they_referred_me" && direction !== "i_referred_them") {
    return NextResponse.json({ error: "Say whether they referred you, or you referred them." }, { status: 400 });
  }

  const code = trim(body.code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (code.length < 4) return NextResponse.json({ error: "That code does not look right." }, { status: 400 });

  if (code === (me.referral_code ?? "")) {
    return NextResponse.json({ error: "That is your own code." }, { status: 400 });
  }

  const { data: other } = await admin
    .from("trading_creator_applications")
    .select("id, name, referred_by")
    .eq("referral_code", code)
    .maybeSingle();

  if (!other) return NextResponse.json({ error: "No creator has that code. Check it and try again." }, { status: 404 });
  if (other.id === me.id) return NextResponse.json({ error: "That is your own code." }, { status: 400 });

  // Who is being credited, and who is being recorded as brought in.
  const child = direction === "they_referred_me" ? { id: me.id, referred_by: me.referred_by } : other;
  const parentId = direction === "they_referred_me" ? other.id : me.id;

  if (child.referred_by) {
    return NextResponse.json(
      {
        error:
          direction === "they_referred_me"
            ? "You are already on someone's team. That cannot be changed."
            : "They are already on someone else's team.",
      },
      { status: 409 },
    );
  }

  // A two-person loop would have each crediting the other forever.
  if (direction === "i_referred_them" && me.referred_by === other.id) {
    return NextResponse.json({ error: "They already brought you in, so it cannot go both ways." }, { status: 409 });
  }

  const { error } = await admin
    .from("trading_creator_applications")
    .update({ referred_by: parentId })
    .eq("id", child.id)
    .is("referred_by", null); // last guard against two requests racing

  if (error) return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    direction,
    name: other.name,
  });
}
