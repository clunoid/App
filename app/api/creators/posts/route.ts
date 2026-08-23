import { NextRequest, NextResponse } from "next/server";
import { db, findCreator, hasAllHandles, loadHandles } from "@/lib/creators/account";
import { computeProgress, dayKey, daysBetween, requiredOn, type PostRow } from "@/lib/creators/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CREATOR PROGRAM — log a post, or take one back.
 *
 * The first log is special: it is what STARTS the 30 days, so it also stamps
 * first_post_at and requires every handle to be on file. Every log after
 * that just records the day's work.
 *
 * Slots stop double-logging: the unique index is (application, day, slot), and
 * the programme never asks for more than two videos in a day.
 *
 * Which platforms count is per creator: they pick three, and a post counts when
 * it is live on all three of theirs — not on a fixed list everyone shares.
 *
 * There are two ways in. "log" is today's post with the platforms ticked. "day"
 * is the calendar: tap a date and it fills in that day's videos against the
 * platforms already on file. That exists because creators post for a week
 * without opening the dashboard, and making them re-enter platforms for each
 * missed day would guarantee nobody bothers.
 */

type Body = {
  token?: string;
  platforms?: string[];
  link?: string;
  action?: "log" | "undo" | "day";
  id?: string;
  /** For action "day": which date, and whether it should end up done or clear. */
  date?: string;
  done?: boolean;
};

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

  // ── ticking a whole day off the calendar ─────────────────────────────────
  if (body.action === "day") {
    if (!creator.first_post_at) {
      return NextResponse.json(
        { error: "Confirm your first post before using the calendar." },
        { status: 400 },
      );
    }

    const date = typeof body.date === "string" ? body.date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "That is not a date we recognise." }, { status: 400 });
    }

    const today = dayKey(new Date());
    const start = dayKey(creator.first_post_at);
    if (daysBetween(date, today) < 0) {
      return NextResponse.json({ error: "That day has not happened yet." }, { status: 400 });
    }
    if (daysBetween(start, date) < 0) {
      return NextResponse.json({ error: "That is before you started." }, { status: 400 });
    }

    // Clearing is the simple half.
    if (body.done === false) {
      await admin.from("trading_creator_posts").delete().eq("application_id", creator.id).eq("posted_on", date);
      return NextResponse.json({ ok: true, date, done: false });
    }

    // Filling it in: how many that day needs depends on where it sits in the
    // run, so ask the same engine the dashboard uses rather than guessing.
    const { data: allRows } = await admin
      .from("trading_creator_posts")
      .select("posted_on, slot, platforms, link")
      .eq("application_id", creator.id);

    const progress = computeProgress(creator.first_post_at, (allRows ?? []) as PostRow[]);
    const slot = progress.days.find((d) => d.date === date);
    const need = slot ? slot.required : 1;

    const used = new Set(
      ((allRows ?? []) as PostRow[]).filter((r) => r.posted_on.slice(0, 10) === date).map((r) => r.slot),
    );

    const mine = (await loadHandles(admin, creator.id)).map((h) => h.platform);
    const rows = [];
    for (let n = 1; n <= need; n++) {
      if (used.has(n)) continue;
      rows.push({ application_id: creator.id, posted_on: date, slot: n, platforms: mine, link: null });
    }

    if (rows.length > 0) {
      const { error } = await admin.from("trading_creator_posts").insert(rows);
      if (error && error.code !== "23505") {
        return NextResponse.json({ error: "Could not save that day. Please try again." }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, date, done: true, added: rows.length });
  }

  // ── logging ──────────────────────────────────────────────────────────────
  const chosen = await loadHandles(admin, creator.id);
  const mine = new Set(chosen.map((h) => h.platform));

  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.filter((p): p is string => typeof p === "string" && mine.has(p)))]
    : [];

  if (platforms.length < mine.size) {
    return NextResponse.json(
      { error: "A post counts when it is up on all three platforms you chose." },
      { status: 400 },
    );
  }

  const first = !creator.first_post_at;
  if (first && !hasAllHandles(chosen)) {
    return NextResponse.json(
      { error: "Add the handle for each of your three platforms before you start — that is what we check your posts against." },
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

  // How many today asks for depends on which POSTED day this is, so the engine
  // has to see every row, not an empty list.
  const startsAt = first ? new Date().toISOString() : creator.first_post_at!;
  const { data: existingAll } = first
    ? { data: [] as PostRow[] }
    : await admin.from("trading_creator_posts").select("posted_on, slot, platforms, link").eq("application_id", creator.id);
  const { day } = computeProgress(startsAt, (existingAll ?? []) as PostRow[]);
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
