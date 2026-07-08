import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { upcomingFixtures } from "@/lib/edge/engine";
import { LEAGUES } from "@/lib/edge/leagues";

export const runtime = "nodejs";
export const maxDuration = 60; // fans out across all covered competitions in parallel

/** Upcoming fixtures across the covered leagues (real ESPN scoreboard data), with
 *  embedded market odds where the book has posted them. Free to browse for any
 *  signed-in user (a teaser); running a prediction/video on one is the paid part. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const league = req.nextUrl.searchParams.get("league") || undefined;
  try {
    const groups = await upcomingFixtures(league || undefined);
    return NextResponse.json({
      leagues: LEAGUES.map((l) => ({ id: l.id, name: l.name, emoji: l.emoji, sport: l.sport })),
      groups,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fixtures failed" }, { status: 500 });
  }
}
