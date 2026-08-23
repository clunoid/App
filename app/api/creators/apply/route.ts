import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * CREATOR PROGRAM — take an application.
 *
 * Open to anyone: the whole point is that people anywhere can apply, so this
 * does not require a Clunoid account. If the applicant happens to be signed in
 * we stamp their user id, which makes paying them later easier.
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
  newAccounts?: boolean;
  agreed?: boolean;
};

const MAX = 120;
const trim = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX) : "");

/** Strip @, any full URL wrapper, and case — so one person cannot hold two seats. */
function handle(v: unknown): string | null {
  let s = trim(v);
  if (!s) return null;
  s = s.replace(/^https?:\/\/(www\.)?[^/]+\//i, ""); // a pasted profile URL
  s = s.replace(/^@+/, "").replace(/\/+$/, "").trim();
  if (!s) return null;
  return s.toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const name = trim(body.name);
  const email = trim(body.email).toLowerCase();
  const country = trim(body.country);
  const tiktok = handle(body.tiktok);
  const instagram = handle(body.instagram);
  const youtube = handle(body.youtube);

  if (!name) return NextResponse.json({ error: "Please give us your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "That email does not look right." }, { status: 400 });
  if (!country) return NextResponse.json({ error: "Please tell us your country." }, { status: 400 });
  if (!tiktok && !instagram && !youtube) {
    return NextResponse.json({ error: "Add at least one account — TikTok, Instagram or YouTube." }, { status: 400 });
  }
  if (!body.agreed) {
    return NextResponse.json({ error: "Please confirm you have read the rules." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "Applications are not open yet. Try again shortly." }, { status: 503 });

  // Signed in? Remember who, so payout has an account to attach to. Applying
  // does not require it.
  const user = await requireUser().catch(() => null);

  const { error } = await db.from("creator_applications").insert({
    name,
    email,
    country,
    user_id: user?.id ?? null,
    tiktok,
    instagram,
    youtube,
    new_accounts: !!body.newAccounts,
  });

  if (error) {
    // 23505 = unique violation: same email or same handle already applied.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You have already applied with that email or account. We will be in touch." },
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

  return NextResponse.json({ ok: true });
}
