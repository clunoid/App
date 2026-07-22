/**
 * DERIV — the first platform. Everything Deriv-specific lives under lib/deriv
 * (config, OAuth, API client) so adding another broker later is a sibling folder,
 * not a rewrite.
 *
 * Connect is CLIENT-SIDE and account-less: there is no Clunoid sign-in. The user
 * authorises their own Deriv account via Deriv's OAuth; Deriv redirects back with
 * an authorization code which the browser exchanges (PKCE, no secret) for
 * per-account tokens that live in the user's browser. Clunoid never stores a
 * password or a Deriv token server-side.
 *
 * FLOW (Deriv's NEW OIDC / Ory stack — verified live against Deriv, 2026-07-15):
 *   1. authorize  → auth.deriv.com/oauth2/auth  (client_id, PKCE S256, NO scope,
 *                   state ≥ 8 chars, redirect_uri = the app's registered URL)
 *   2. token      → auth.deriv.com/oauth2/token (grant_type=authorization_code +
 *                   code_verifier; public client, no secret; CORS→clunoid)
 *   3. legacy     → oauth.deriv.com/oauth2/legacy/tokens (Bearer access_token;
 *                   CORS *) → the a1-… account tokens the WebSocket understands
 *   4. balances   → ws.derivws.com WebSocket, authorize(a1-…), app_id NUMERIC
 *
 * Gotchas learned the hard way:
 *  - The client lives on auth.deriv.com, NOT oauth.deriv.com (which returns
 *    invalid_client). oauth.deriv.com is only for the legacy/tokens exchange.
 *  - The client is not allowed to request any scope (openid/read/trade all fail),
 *    so we send NO scope parameter.
 *  - The OIDC client_id (a 21-char id like 33PP…) is REJECTED by the WebSocket —
 *    the WS needs a numeric app_id, so DERIV_WS_APP_ID is separate.
 *  - Only the exact registered redirect_uri works (root is rejected); it must
 *    match byte-for-byte between the authorize and token requests.
 */

/** The Deriv app identifier, from NEXT_PUBLIC_DERIV_APP_ID. Deriv has TWO kinds:
 *
 *  - a NUMERIC classic app_id (e.g. 80111): uses the simple, single-host flow —
 *    oauth.deriv.com/oauth2/authorize?app_id=<num> redirects straight back to the
 *    app's registered URL with ?acct1&token1&cur1. No PKCE, no token exchange.
 *    This is the standard way third-party apps connect a user's Deriv account.
 *
 *  - an OIDC client_id (a 21-char id like 33PP…): the newer Ory flow on
 *    auth.deriv.com. It requires a cross-host hop to oauth.deriv.com/legacy/tokens
 *    which only works if the client is registered on oauth.deriv.com — a purely
 *    auth.deriv.com client (like 33PP…) is rejected there (UNAUTHORIZED), so a
 *    numeric app_id is required for connection to actually succeed.
 *
 *  We auto-detect which and pick the matching flow. */
export const DERIV_CLIENT_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID || "";

/** Kept as an alias so existing imports (hasDerivApp etc.) don't churn. */
export const DERIV_APP_ID = DERIV_CLIENT_ID;

/** True when the id is a classic numeric app_id → use the direct oauth.deriv.com flow. */
export const DERIV_IS_NUMERIC_APP = /^\d+$/.test(DERIV_CLIENT_ID);

export const hasDerivApp = (): boolean => !!DERIV_CLIENT_ID;

/** NUMERIC app_id for the WebSocket connection. A classic numeric app_id is used
 *  directly (the a1- tokens are minted against it); an OIDC client_id is NOT a
 *  valid WS app_id, so we fall back to the public app_id 1089 (OAuth account
 *  tokens authorise fine on it). Override with NEXT_PUBLIC_DERIV_WS_APP_ID. */
export const DERIV_WS_APP_ID =
  process.env.NEXT_PUBLIC_DERIV_WS_APP_ID || (DERIV_IS_NUMERIC_APP ? DERIV_CLIENT_ID : "1089");

/** WebSocket API endpoint (real-time: authorize, balance, mt5_login_list). */
export const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_WS_APP_ID}`;

/** OIDC authorize + token host (Ory). */
export const DERIV_AUTH_BASE = "https://auth.deriv.com";
/** Legacy tokens exchange host. */
export const DERIV_OAUTH_BASE = "https://oauth.deriv.com";

/** The exact redirect URL registered on the Deriv app. Must match byte-for-byte
 *  in both the authorize and token requests — Deriv rejects anything else
 *  (including the bare root domain). */
export const DERIV_REDIRECT_URI =
  process.env.NEXT_PUBLIC_DERIV_REDIRECT_URI || "https://www.clunoid.com/trading/command";

/** The owner's Deriv REVENUE-SHARE affiliate link — used for the "Create a Deriv
 *  account" button so new sign-ups are attributed to us (recurring commission). */
export const DERIV_AFFILIATE_URL =
  process.env.NEXT_PUBLIC_DERIV_AFFILIATE_URL || "https://track.deriv.com/_30qaRjl291f1hit6RV3zsGNd7ZgqdRLk/1/";

/** The Deriv cashier deposit page. */
export const DERIV_DEPOSIT_URL =
  "https://home.deriv.com/dashboard/deposit?from=portfolio&depositSheet=1&currency=USD";

/** The deposit page routed THROUGH the affiliate tracker (?url=…) so the visit is
 *  attributed to us — same partner token as the "create account" link. Deriv's
 *  smart link sets the affiliate cookie, then forwards to the deposit page. */
export const DERIV_TRACKED_DEPOSIT_URL = `${DERIV_AFFILIATE_URL}?url=${encodeURIComponent(DERIV_DEPOSIT_URL)}`;
