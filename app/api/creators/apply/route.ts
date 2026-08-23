import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isPayoutMethod, newAccessToken, normaliseHandle, trim } from "@/lib/creators/account";

export const runtime = "nodejs";

/**
 * CREATOR PROGRAM — register a creator.
 *
 * Open to anyone: the whole point is that people anywhere can join, so this
 * does not require a Clunoid account. If they happen to be signed in we stamp
 * their user id, which makes paying them later easier.
 *
 * There is no approval gate. The row goes in 'active' straight away and the
 * creator lands on their dashboard. started_at records when they registered; the
 * 30 days themselves begin when they confirm their FIRST POST is live, which is
 * stamped separately as first_post_at.
 *
 * The row is written with the service role because the table denies everything
 * to anon clients. Duplicate email or handle comes back as a friendly 409 rather
 * than a database error, since applying twice is a mistake, not an attack.
 */

type Body = {
  name?: string;
  email?: string;
  country?: string;
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  payoutMethod?: string;
  newAccounts?: boolean;
  agreed?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const name = trim(body.name);
  const email = trim(body.email).toLowerCase();
  const country = trim(body.country);
  const tiktok = normaliseHandle(body.tiktok);
  const instagram = normaliseHandle(body.instagram);
  const youtube = normaliseHandle(body.youtube);

  if (!name) return NextResponse.json({ error: "Please give us your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "That email does not look right." }, { status: 400 });
  if (!country) return NextResponse.json({ error: "Please tell us your country." }, { status: 400 });
  // Handles are optional at this stage — they are required before the first
  // payout, not before applying, so someone can join while an account is new.
  // Optional at sign-up. A payout rail matters when there is money to send, and
  // the dashboard keeps asking until it is set — so it must not block joining.
  // Anything sent must still be one we can actually pay on.
  const rawPayout = trim(body.payoutMethod).toLowerCase();
  if (rawPayout && !isPayoutMethod(rawPayout)) {
    return NextResponse.json({ error: "Pick one of the payout methods listed." }, { status: 400 });
  }
  const payoutMethod = rawPayout || null;
  if (!body.agreed) {
    return NextResponse.json({ error: "Please confirm you have read the rules." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "Applications are not open yet. Try again shortly." }, { status: 503 });

  // Signed in? Remember who, so payout has an account to attach to. Applying
  // does not require it.
  const user = await requireUser().catch(() => null);

  // The key their browser keeps so it can open their dashboard again later.
  const accessToken = newAccessToken();

  const { error } = await db.from("trading_creator_applications").insert({
    name,
    email,
    country,
    user_id: user?.id ?? null,
    tiktok,
    instagram,
    youtube,
    payout_method: payoutMethod,
    new_accounts: !!body.newAccounts,
    // No waiting on us: the clock starts now.
    status: 'active',
    started_at: new Date().toISOString(),
    access_token: accessToken,
  });

  if (error) {
    // 23505 = unique violation: same email or same handle already applied.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You are already registered with that email or account — just keep posting." },
        { status: 409 },
      );
    }
    // Table missing — the migration has not been run on this project yet.
    // PostgREST reports its own PGRST205 rather than the Postgres 42P01, and
    // which one surfaces depends on the client, so accept either.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ error: "Applications are not open yet. Try again shortly." }, { status: 503 });
    }
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token: accessToken });
}
