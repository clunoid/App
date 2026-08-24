import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isPayoutMethod, newAccessToken, normaliseHandle, trim } from "@/lib/creators/account";
import { DEFAULT_PLATFORMS, parsePlatformChoice, PLATFORMS_REQUIRED } from "@/lib/creators/platforms";

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
  platforms?: string[];
  handles?: Record<string, string>;
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
  // Three platforms of their choosing. Nothing sent means they never opened the
  // picker, which is the recommended set.
  const platforms = body.platforms === undefined ? DEFAULT_PLATFORMS : parsePlatformChoice(body.platforms);
  if (!platforms) {
    return NextResponse.json(
      { error: `Choose exactly ${PLATFORMS_REQUIRED} platforms to post on.` },
      { status: 400 },
    );
  }

  if (!name) return NextResponse.json({ error: "Please give us your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "That email does not look right." }, { status: 400 });
  if (!country) return NextResponse.json({ error: "Please tell us your country." }, { status: 400 });
  // Handles are optional at this stage — they are required before the first
  // post, not before registering, so someone can join while an account is new.
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

  const { data: created, error } = await db.from("trading_creator_applications").insert({
    name,
    email,
    country,
    user_id: user?.id ?? null,
    payout_method: payoutMethod,
    new_accounts: !!body.newAccounts,
    // No waiting on us: the clock starts now.
    status: 'active',
    started_at: new Date().toISOString(),
    access_token: accessToken,
  }).select("id").single();

  if (error) {
    // 23505 = unique violation: they are already registered.
    //
    // Being stranded on the sign-up page with no route to your own dashboard is
    // a dead end, so where it is safe we just let them back in. "Safe" means
    // they are signed in to Clunoid with the very email on the row — signing in
    // is the proof. Knowing somebody's email is NOT proof, and handing over a
    // dashboard on an email alone would let anyone read a creator's details and
    // change where their money goes.
    if (error.code === "23505") {
      const { data: existing } = await db
        .from("trading_creator_applications")
        .select("access_token, email, user_id")
        .eq("email", email)
        .maybeSingle();

      const signedInAsThem =
        !!existing &&
        !!user &&
        (existing.user_id === user.id || (user.email ?? "").toLowerCase() === existing.email);

      if (signedInAsThem && existing.access_token) {
        // Link the row to the account while we are here, so the fallback lookup
        // finds them next time even without a token.
        if (!existing.user_id) {
          await db.from("trading_creator_applications").update({ user_id: user.id }).eq("email", email);
        }
        return NextResponse.json({ ok: true, token: existing.access_token, already: true });
      }

      return NextResponse.json(
        {
          error:
            "You are already registered with that email or account. Open your dashboard on the device you signed up on, or sign in to Clunoid with this email and try again.",
        },
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

  // One row per chosen platform. A handle they did not give yet stays null —
  // the choice is recorded either way, so the dashboard knows where they post.
  if (created?.id) {
    const rows = platforms.map((platform) => ({
      application_id: created.id as string,
      platform,
      handle: normaliseHandle(body.handles?.[platform]),
    }));
    const { error: hErr } = await db.from("trading_creator_handles").insert(rows);
    if (hErr) {
      // A handle already used by someone else. Undo the registration rather than
      // leaving a creator with no platforms at all.
      await db.from("trading_creator_applications").delete().eq("id", created.id);
      if (hErr.code === "23505") {
        return NextResponse.json(
          { error: "One of those accounts is already registered by another creator." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, token: accessToken });
}
