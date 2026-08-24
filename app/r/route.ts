import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CREATOR TEAM — /r with no code.
 *
 * Nobody should ever land here, but a link can lose its tail to a bad copy, a
 * line break in a bio, or a platform trimming it. The entire point of these
 * links is that they always reach clunoid.com, so this exists purely so that
 * even a broken one does.
 */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/", req.nextUrl.origin));
}
