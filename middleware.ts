import { NextRequest, NextResponse } from "next/server";

/**
 * TRADING-MODE TRANSFORM (reversible, presentational).
 *
 * The app has two modes, chosen by the `clunoid_mode` cookie:
 *  - trading (DEFAULT, everyone): clunoid.com IS the Clunoid Trading platform.
 *    `/` renders the trading landing (rewrite → /trading) and every other page
 *    is redirected to /trading, so the public sees ONLY trading. Nothing is
 *    deleted — the classic app is merely hidden.
 *  - classic (admins): the full original Clunoid. The cookie is set only by
 *    /api/mode after an admin check, and cleared to return to trading mode.
 *
 * This is a VIEW switch, not a security boundary — the classic features were
 * public already, and the genuinely admin-only tools (/tdesk, /showtime, /vlab,
 * /career) stay enforced server-side on their own APIs regardless of mode. So
 * the cookie is trusted here without re-verifying the session.
 *
 * API, auth, and static assets are excluded via the matcher, so this only ever
 * governs page navigation.
 */
export function middleware(req: NextRequest) {
  // Deriv OAuth returns account tokens as ?acct1&token1&… to the app's REGISTERED
  // redirect URL (which may be the root or any path). Funnel that return to the
  // Command Center with the query intact — otherwise a trading-mode rewrite of
  // "/" would strip the tokens and the connection would silently fail.
  const sp = req.nextUrl.searchParams;
  const isOAuthReturn =
    (sp.has("acct1") && sp.has("token1")) || // legacy flat return
    (sp.has("code") && sp.has("state")) || // new OIDC code return
    sp.has("error"); // an OAuth error we want to surface
  if (isOAuthReturn && req.nextUrl.pathname !== "/trading/command") {
    const u = req.nextUrl.clone();
    u.pathname = "/trading/command";
    return NextResponse.redirect(u); // preserves the OAuth query (tokens or error)
  }

  const mode = req.cookies.get("clunoid_mode")?.value;
  if (mode === "classic") return NextResponse.next(); // full classic app

  // ── trading mode (default) ──
  const { pathname } = req.nextUrl;
  if (pathname === "/trading" || pathname.startsWith("/trading/")) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/trading";
  url.search = "";
  // `/` shows the platform in place (rewrite keeps clunoid.com in the bar);
  // any other classic page is redirected to the trading front door.
  return pathname === "/" ? NextResponse.rewrite(url) : NextResponse.redirect(url);
}

export const config = {
  // Run on page routes only — never on API, auth, Next internals, or static files.
  matcher: ["/((?!api|auth|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|opengraph-image|og|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|json|webmanifest)).*)"],
};
