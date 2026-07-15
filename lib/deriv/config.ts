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

/** Public Deriv OAuth client id (OIDC). Not a secret — it identifies the app in
 *  the authorize URL. Register an app at api.deriv.com / developers.deriv.com,
 *  set its redirect URL to https://www.clunoid.com/trading/command, then set this
 *  as NEXT_PUBLIC_DERIV_APP_ID. Until then the connect button shows a setup
 *  state and offers the paste-a-token path (unconfigured-safe). */
export const DERIV_CLIENT_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID || "";

/** Kept as an alias so existing imports (hasDerivApp etc.) don't churn. */
export const DERIV_APP_ID = DERIV_CLIENT_ID;

export const hasDerivApp = (): boolean => !!DERIV_CLIENT_ID;

/** NUMERIC app_id for the WebSocket connection. The OIDC client_id is NOT a valid
 *  WS app_id (Deriv rejects the upgrade), and OAuth account tokens authorise fine
 *  on the public app_id 1089. Override with NEXT_PUBLIC_DERIV_WS_APP_ID if the app
 *  has its own numeric app_id. */
export const DERIV_WS_APP_ID = process.env.NEXT_PUBLIC_DERIV_WS_APP_ID || "1089";

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
