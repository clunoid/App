import { NextRequest, NextResponse } from "next/server";
import { db, findCreator, hasAllHandles, loadHandles, type CreatorRow, type HandleRow } from "@/lib/creators/account";
import { computeProgress, baseForMonth, type PostRow } from "@/lib/creators/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CREATOR PROGRAM — everything the dashboard needs, in one call.
 *
 * The creator's own row, their posting record, their payout history, and the
 * derived state (which day they are on, what they owe today, when they get paid).
 * Progress is computed here as well as in the browser from the same module, so
 * the page can render correctly on first paint and then keep its own countdown
 * ticking without asking again.
 */

export type MeResponse = {
  creator: CreatorRow & { handlesComplete: boolean; platforms: string[]; handles: HandleRow[] };
  posts: PostRow[];
  payouts: Payout[];
  totals: { paidUsd: number; pendingUsd: number; monthsPaid: number };
  nextPayout: { month: number; baseUsd: number; bonusPossibleUsd: number } | null;
  progress: ReturnType<typeof computeProgress>;
  serverTime: string;
};

type Payout = {
  id: string;
  month_number: number;
  period_start: string;
  period_end: string;
  base_usd: number;
  bonus_usd: number;
  status: string;
  requested_at: string | null;
  paid_at: string | null;
  method: string | null;
  reference: string | null;
};

export async function POST(req: NextRequest) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };

  const admin = db();
  if (!admin) return NextResponse.json({ error: "Not available right now." }, { status: 503 });

  const creator = await findCreator(admin, token);
  // 404, not 401: the browser uses this to decide "show the registration page".
  if (!creator) return NextResponse.json({ error: "No creator found." }, { status: 404 });

  const [handleRows, { data: postRows }, { data: payoutRows }] = await Promise.all([
    loadHandles(admin, creator.id),
    admin
      .from("trading_creator_posts")
      .select("id, posted_on, slot, platforms, link, created_at")
      .eq("application_id", creator.id)
      .order("posted_on", { ascending: false })
      .order("slot", { ascending: true }),
    admin
      .from("trading_creator_payouts")
      .select("id, month_number, period_start, period_end, base_usd, bonus_usd, status, requested_at, paid_at, method, reference")
      .eq("application_id", creator.id)
      .order("month_number", { ascending: false }),
  ]);

  const posts = (postRows ?? []) as (PostRow & { id: string; created_at: string })[];
  const payouts = (payoutRows ?? []) as Payout[];

  const paidUsd = payouts
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.base_usd) + Number(p.bonus_usd), 0);
  const pendingUsd = payouts
    .filter((p) => p.status === "requested" || p.status === "approved")
    .reduce((sum, p) => sum + Number(p.base_usd) + Number(p.bonus_usd), 0);
  const monthsPaid = payouts.filter((p) => p.status === "paid").length;

  const progress = computeProgress(creator.first_post_at, posts);

  // The month they are working towards right now.
  const month = monthsPaid + 1;
  const nextPayout = { month, baseUsd: baseForMonth(month, creator.new_accounts), bonusPossibleUsd: 500 };

  const body: MeResponse = {
    creator: {
      ...creator,
      handlesComplete: hasAllHandles(handleRows),
      platforms: handleRows.map((h) => h.platform),
      handles: handleRows,
    },
    posts,
    payouts,
    totals: { paidUsd, pendingUsd, monthsPaid },
    nextPayout,
    progress,
    serverTime: new Date().toISOString(),
  };

  return NextResponse.json(body);
}
