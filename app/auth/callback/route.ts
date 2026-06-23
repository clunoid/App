import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

/**
 * OAuth (Google) + recovery redirect target. Exchanges the auth code for a
 * session and — crucially — writes the session cookies onto the REDIRECT
 * RESPONSE itself, so the browser actually receives them. (Setting cookies via
 * next/headers does NOT attach them to a custom NextResponse.redirect.)
 *
 * Supports a `next` param (same-origin path only) so the password-reset flow can
 * land the user on /auth/reset after the recovery code is exchanged.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  // Only allow same-origin relative paths (no open redirects). Default to the
  // authenticated app, since a successful OAuth/recovery exchange means signed-in.
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/home";

  const response = NextResponse.redirect(new URL(next, origin));

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(toSet: { name: string; value: string; options?: CookieOptions }[]) {
            toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      }
    );
    try {
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      /* fall through and still redirect */
    }
  }

  return response;
}
