import { NextRequest, NextResponse } from "next/server";
import { db, findCreator, hasAllHandles, loadHandles, TEAM_BONUS_USD, type CreatorRow, type HandleRow } from "@/lib/creators/account";
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
  team: TeamMember[];
  teamTotals: { members: number; earning: number; earnedUsd: number; pendingUsd: number; perPersonUsd: number };
  progress: ReturnType<typeof computeProgress>;
  serverTime: string;
  /** Present when they were found by something other than their own token. */
  recoveredToken?: string;
};

export type TeamMember = {
  name: string;
  /** Their own share code — so a creator can help them, or check who is who. */
  code: string | null;
  country: string;
  joined: string;
  started: boolean;
  /** True once this member has been paid, which is what earns the bonus. */
  paid: boolean;
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
  const { token, derivAccess } = (await req.json().catch(() => ({}))) as { token?: string; derivAccess?: string };

  const admin = db();
  if (!admin) return NextResponse.json({ error: "Not available right now." }, { status: 503 });

  const creator = await findCreator(admin, token, derivAccess);
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

  // Record which Deriv account this is, so the same person is recognised on
  // their next device. Verified against Deriv rather than taken from the body.
  if (typeof derivAccess === "string" && derivAccess.length > 20 && !creator.deriv_loginid) {
    const { primaryDerivId } = await import("@/lib/creators/derivIdentity");
    const id = await primaryDerivId(derivAccess);
    if (id) {
      await admin
        .from("trading_creator_applications")
        .update({ deriv_loginid: id })
        .eq("id", creator.id)
        .is("deriv_loginid", null);
    }
  }

  // ── the team ─────────────────────────────────────────────────────────────
  // Everyone who registered through this creator's link, and whether they have
  // been paid yet — being paid is what turns a member into a bonus.
  const { data: broughtRows } = await admin
    .from("trading_creator_applications")
    .select("id, name, country, referral_code, applied_at, first_post_at")
    .eq("referred_by", creator.id)
    .order("applied_at", { ascending: false });

  const brought = (broughtRows ?? []) as {
    id: string; name: string; country: string; referral_code: string | null;
    applied_at: string; first_post_at: string | null;
  }[];

  let paidIds = new Set<string>();
  if (brought.length > 0) {
    const { data: theirPayouts } = await admin
      .from("trading_creator_payouts")
      .select("application_id")
      .eq("status", "paid")
      .in("application_id", brought.map((b) => b.id));
    paidIds = new Set((theirPayouts ?? []).map((p) => p.application_id as string));
  }

  const team: TeamMember[] = brought.map((b) => ({
    name: b.name,
    code: b.referral_code,
    country: b.country,
    joined: b.applied_at,
    started: !!b.first_post_at,
    paid: paidIds.has(b.id),
  }));

  const earningCount = team.filter((t) => t.paid).length;

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
    team,
    teamTotals: {
      members: team.length,
      earning: earningCount,
      earnedUsd: earningCount * TEAM_BONUS_USD,
      // Members who joined but have not been paid yet — money not yet earned.
      pendingUsd: (team.length - earningCount) * TEAM_BONUS_USD,
      perPersonUsd: TEAM_BONUS_USD,
    },
    progress,
    serverTime: new Date().toISOString(),
  };

  // Found some other way? Hand back the key so this device stops needing to.
  if (!token || token.length < 32) {
    const { data: keyRow } = await admin
      .from("trading_creator_applications")
      .select("access_token")
      .eq("id", creator.id)
      .maybeSingle();
    if (keyRow?.access_token) body.recoveredToken = keyRow.access_token as string;
  }

  return NextResponse.json(body);
}
