import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CREATOR TEAM — a creator's own share link.
 *
 * clunoid.com/r/AB12CD → remember who sent them, then show them clunoid.com.
 *
 * It deliberately lands on the product, not the creator programme: someone
 * arriving from a video should meet the bots, not a recruitment page. If they
 * later decide to become a creator themselves, the cookie is still there and
 * the referral is recorded at that point.
 *
 * No lookup happens here. Checking the code against the database would tell an
 * anonymous visitor which codes exist, and the registration route validates it
 * properly anyway — a bad cookie simply results in no referrer.
 */

/** Long enough that someone can go away and come back before deciding. */
const NINETY_DAYS = 60 * 60 * 24 * 90;

// Not exported: Next only allows its own named exports from a route file. The
// sign-up form reads this same name from document.cookie.
const REFERRAL_COOKIE = "cln_ref";

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;

  const clean = (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

  const home = new URL("/", req.nextUrl.origin);
  const res = NextResponse.redirect(home);

  if (clean.length >= 4) {
    res.cookies.set(REFERRAL_COOKIE, clean, {
      maxAge: NINETY_DAYS,
      path: "/",
      sameSite: "lax",
      httpOnly: false, // the sign-up form reads it in the browser
      secure: process.env.NODE_ENV === "production",
    });
  }

  return res;
}
