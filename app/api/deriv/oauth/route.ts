import { NextRequest, NextResponse } from "next/server";
import {
  DERIV_AUTH_BASE,
  DERIV_OAUTH_BASE,
  DERIV_CLIENT_ID,
  DERIV_REDIRECT_URI,
} from "@/lib/deriv/config";

/**
 * DERIV OIDC token exchange — server-side, STATELESS.
 *
 * Why server-side: Deriv's oauth2/legacy/tokens endpoint answers the CORS
 * preflight but omits Access-Control-Allow-Origin on the actual POST response,
 * so a browser fetch dies with "Failed to fetch". Doing the exchange here (Node →
 * Deriv, no CORS) is reliable. Nothing is stored: the browser sends the one-time
 * authorization code + PKCE verifier, we hand back the account tokens, done. The
 * user's tokens still only ever live in the user's browser.
 *
 * Flow: code (+ code_verifier) → auth.deriv.com/oauth2/token → access_token →
 * oauth.deriv.com/oauth2/legacy/tokens → the a1-… tokens the WebSocket uses.
 */

type OutToken = { loginid: string; token: string; currency: string };

function normalizeTokens(data: unknown): OutToken[] {
  const out: OutToken[] = [];
  const push = (t: Record<string, unknown>) => {
    const token = typeof t.token === "string" ? t.token : "";
    if (!token) return;
    const loginid =
      (typeof t.loginid === "string" && t.loginid) ||
      (typeof t.loginId === "string" && (t.loginId as string)) ||
      (typeof t.acct === "string" && (t.acct as string)) ||
      "";
    const currency =
      (typeof t.currency === "string" && t.currency) ||
      (typeof t.cur === "string" && (t.cur as string)) ||
      "";
    out.push({ token, loginid, currency });
  };
  if (Array.isArray(data)) {
    for (const t of data) if (t && typeof t === "object") push(t as Record<string, unknown>);
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.tokens)) {
      for (const t of obj.tokens) if (t && typeof t === "object") push(t as Record<string, unknown>);
    } else {
      // flat acct1/token1/cur1 shape
      for (let i = 1; i < 30; i++) {
        const loginid = obj[`acct${i}`];
        const token = obj[`token${i}`];
        if (typeof loginid !== "string" || typeof token !== "string") break;
        const cur = obj[`cur${i}`];
        out.push({ loginid, token, currency: typeof cur === "string" ? cur : "" });
      }
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!DERIV_CLIENT_ID) {
    return NextResponse.json({ error: "Deriv OAuth is not configured." }, { status: 500 });
  }
  let body: { code?: string; code_verifier?: string; redirect_uri?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const code = body.code;
  if (!code) return NextResponse.json({ error: "Missing authorization code." }, { status: 400 });
  // The redirect_uri in the token request must byte-match the one used at
  // authorize time. The client passes back whichever it used; fall back to config.
  const redirectUri = body.redirect_uri || DERIV_REDIRECT_URI;

  // 1) authorization code → access_token (public client, PKCE, no secret)
  let access_token = "";
  try {
    const tokenRes = await fetch(`${DERIV_AUTH_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: DERIV_CLIENT_ID,
        code_verifier: body.code_verifier || "",
      }).toString(),
    });
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      return NextResponse.json(
        { error: tokenJson.error_description || tokenJson.error || "Deriv token exchange failed." },
        { status: 400 },
      );
    }
    access_token = tokenJson.access_token;
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't reach Deriv token endpoint: ${e instanceof Error ? e.message : "network error"}` },
      { status: 502 },
    );
  }

  // 2) access_token → a1-… account tokens the WebSocket understands
  try {
    // Matches Deriv's official @deriv-com/auth-client requestLegacyToken exactly:
    // POST with ONLY the Bearer header, no body, no Content-Type.
    const legacyRes = await fetch(`${DERIV_OAUTH_BASE}/oauth2/legacy/tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const legacyJson = await legacyRes.json().catch(() => null);
    if (!legacyRes.ok) {
      const msg =
        (legacyJson &&
          (legacyJson.error_description || legacyJson.error || legacyJson.error_code)) ||
        "Deriv account-token exchange failed.";
      return NextResponse.json({ error: String(msg) }, { status: 400 });
    }
    const tokens = normalizeTokens(legacyJson);
    if (!tokens.length) {
      return NextResponse.json({ error: "Deriv returned no account tokens." }, { status: 400 });
    }
    return NextResponse.json({ tokens });
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't reach Deriv token endpoint: ${e instanceof Error ? e.message : "network error"}` },
      { status: 502 },
    );
  }
}
