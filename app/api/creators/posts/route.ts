import { NextRequest, NextResponse } from "next/server";
import { db, findCreator, hasAllHandles } from "@/lib/creators/account";
import { computeProgress, dayKey, requiredOn, PLATFORMS, type PostRow } from "@/lib/creators/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CREATOR PROGRAM — log a post, or take one back.
 *
 * The first log is special: it is what STARTS the 30 days, so it also stamps
 * first_post_at and requires all three handles to be on file. Every log after
 * that just records the day's work.
 *
 * Slots stop double-logging: the unique index is (application, day, slot), and
 * the programme never asks for more than two videos in a day.
 */

type Body = { token?: string; platforms?: string[]; link?: string; action?: "log" | "undo"; id?: string };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const admin = db();
  if (!admin) return NextResponse.json({ error: "Not available right now." }, { status: 503 });

  const creator = await findCreator(admin, body.token);
  if (!creator) return NextResponse.json({ error: "No creator found." }, { status: 404 });

  // ── taking one back (mislogged) ──────────────────────────────────────────
  if (body.action === "undo") {
    if (!body.id) return NextResponse.json({ error: "Nothing to undo." }, { status: 400 });
    // Scoped to their own row, so an id belonging to someone else matches nothing.
    // Selecting the deleted rows back lets us say so rather than reporting a
    // success that did not happen.
    const { data, error } = await admin
      .from("trading_creator_posts")
      .delete()
      .eq("id", body.id)
      .eq("application_id", creator.id)
      .select("id");
    if (error) return NextResponse.json({ error: "Could not undo that." }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ error: "That entry is not yours." }, { status: 404 });

    // Undoing the only post means the first one was logged by mistake, so the
    // clock should not be left running against a month with nothing in it.
    const { count } = await admin
      .from("trading_creator_posts")
      .select("id", { count: "exact", head: true })
      .eq("application_id", creator.id);
    if (!count) {
      await admin.from("trading_creator_applications").update({ first_post_at: null }).eq("id", creator.id);
    }

    return NextResponse.json({ ok: true, restarted: !count });
  }

  // ── logging ──────────────────────────────────────────────────────────────
  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.filter((p): p is string => typeof p === "string" && (PLATFORMS as readonly string[]).includes(p)))]
    : [];

  if (platforms.length < PLATFORMS.length) {
    return NextResponse.json(
      { error: "A post counts when it is up on all three: TikTok, Instagram and YouTube." },
      { status: 400 },
    );
  }

  const first = !creator.first_post_at;
  if (first && !hasAllHandles(creator)) {
    return NextResponse.json(
      { error: "Add all three account handles before you start — that is what we check your posts against." },
      { status: 400 },
    );
  }

  const today = dayKey(new Date());
  const link = typeof body.link === "string" ? body.link.trim().slice(0, 500) : "";

  // How many are already down for today, and how many today is asking for.
  const { data: existing } = await admin
    .from("trading_creator_posts")
    .select("slot")
    .eq("application_id", creator.id)
    .eq("posted_on", today);

  const usedSlots = new Set((existing ?? []).map((r) => r.slot as number));

  // Day number is computed from the start the clock will have after this call,
  // so the very first log is day 1 and asks for one video.
  const startsAt = first ? new Date().toISOString() : creator.first_post_at!;
  const { day } = computeProgress(startsAt, [] as PostRow[]);
  const allowedToday = Math.max(1, requiredOn(day));

  if (usedSlots.size >= allowedToday) {
    return NextResponse.json(
      {
        error:
          allowedToday === 1
            ? "Today is already logged. Day 1–14 is one video a day."
            : "Both of today's videos are already logged.",
      },
      { status: 409 },
    );
  }

  const slot = usedSlots.has(1) ? 2 : 1;

  const { error } = await admin.from("trading_creator_posts").insert({
    application_id: creator.id,
    posted_on: today,
    slot,
    platforms,
    link: link || null,
  });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That one is already logged." }, { status: 409 });
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }

  // First post starts the clock — and only now, so a failed insert never
  // starts a 30-day run the creator did not actually begin.
  if (first) {
    await admin
      .from("trading_creator_applications")
      .update({ first_post_at: startsAt })
      .eq("id", creator.id)
      .is("first_post_at", null);
  }

  return NextResponse.json({ ok: true, started: first });
}
