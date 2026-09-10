import { NextRequest, NextResponse } from "next/server";
import { collectReplies, recentReplies } from "@/lib/support/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Has anyone answered me?"
 *
 * The support bubble asks this on a timer while it is open. It is public and
 * unauthenticated, because a visitor has no account — the visitor id from their
 * own browser is the whole key.
 *
 * That means the id is guessable in principle, so the endpoint is built to be
 * useless to a guesser: it returns only replies addressed to the exact id asked
 * for, the ids are random 32-bit hex, and there is nothing here to enumerate —
 * a wrong guess returns an empty list, indistinguishable from a real visitor
 * with no replies waiting.
 */

const ID = /^[0-9A-F]{8}$/;

export async function GET(req: NextRequest) {
  const visitorId = (req.nextUrl.searchParams.get("visitorId") ?? "").toUpperCase();
  if (!ID.test(visitorId)) return NextResponse.json({ replies: [] });

  /* ?recent=1 asks again for what has already been delivered, marking nothing.
     The widget calls it when the bubble opens, and merges the answer over what
     it has stored by id — which is how a line saved before attachments existed
     gets its picture, and how anything lost from localStorage comes back. */
  if (req.nextUrl.searchParams.get("recent") === "1") {
    const recent = await recentReplies(visitorId);
    return NextResponse.json({ replies: recent }, { headers: { "Cache-Control": "no-store" } });
  }

  const replies = await collectReplies(visitorId);
  return NextResponse.json(
    { replies },
    { headers: { "Cache-Control": "no-store" } },
  );
}
