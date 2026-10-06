/**
 * DERIV — the first platform. Everything Deriv-specific lives under lib/deriv
 * (config, OAuth, API client) so adding another broker later is a sibling folder,
 * not a rewrite.
 *
 * Connect is CLIENT-SIDE and account-less: there is no Clunoid sign-in. The user
 * authorises their own Deriv account via Deriv's OAuth; Deriv redirects back with
 * an authorization code which the browser exchanges (PKCE, no secret) for an
 * access token that lives in the user's browser. Clunoid never stores a password
 * or a Deriv token server-side.
 *
 * ONE APP, EVERYWHERE: Clunoid's Deriv app, 33PP… (NEXT_PUBLIC_DERIV_APP_ID).
 *   1. authorize → auth.deriv.com/oauth2/auth (client_id 33PP…, PKCE S256)
 *   2. token     → auth.deriv.com/oauth2/token → an `ory_at_…` access token,
 *                  issued to 33PP… — Deriv credits every trade made with it
 *                  (and so the app's markup) to 33PP…
 *   3. accounts  → api.derivws.com REST (Bearer + Deriv-App-ID: 33PP…)
 *   4. trading   → POST …/accounts/{id}/otp → the account's own WebSocket
 *   5. market data that needs no account (the MT5 signals' candles) →
 *                  wss://api.derivws.com/trading/v1/options/ws/public, which
 *                  takes no app id at all.
 * No other app id is used anywhere: the classic WebSocket (ws.derivws.com,
 * numeric app ids such as Deriv's public 1089) and the legacy a1- tokens are
 * gone. See https://developers.deriv.com/llms/authentication.md.
 *
 * Gotchas learned the hard way:
 *  - The client lives on auth.deriv.com, NOT oauth.deriv.com (which returns
 *    invalid_client).
 *  - Only the exact registered redirect_uri works (root is rejected); it must
 *    match byte-for-byte between the authorize and token requests.
 */

/** Clunoid's Deriv app (an OIDC client_id, 33PP…), from NEXT_PUBLIC_DERIV_APP_ID. */
export const DERIV_CLIENT_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID || "";

/** Kept as an alias so existing imports (hasDerivApp etc.) don't churn. */
export const DERIV_APP_ID = DERIV_CLIENT_ID;

/** True when the id is a classic numeric app_id → the direct oauth.deriv.com flow.
 *  Clunoid's app is not one (33PP… is an OIDC client); kept for that case only. */
export const DERIV_IS_NUMERIC_APP = /^\d+$/.test(DERIV_CLIENT_ID);

export const hasDerivApp = (): boolean => !!DERIV_CLIENT_ID;

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
  process.env.NEXT_PUBLIC_DERIV_AFFILIATE_URL || "https://t.deriv.link?t=8FJ7FBEALQBP";

/** The Deriv cashier deposit page (Deriv TradersHub — lands straight on the
 *  deposit sheet, the best UX; the bare affiliate smart link would dump the user
 *  on the deriv.com homepage instead). */
export const DERIV_DEPOSIT_URL =
  "https://home.deriv.com/dashboard/deposit?from=portfolio&depositSheet=1&currency=USD";

/** The MyAffiliates click-tracking token (the `t=` value the smart link resolves
 *  to) and the affiliate's utm identity. Deriv's own docs attribute TradersHub
 *  deep links with `?t=<token>&utm_campaign=<campaign>` appended to the
 *  destination — so the visitor lands directly on the page AND the referral is
 *  still credited to us. Override via env if the affiliate token ever changes. */
export const DERIV_AFFILIATE_TOKEN =
  process.env.NEXT_PUBLIC_DERIV_AFFILIATE_TOKEN || "qNeBJf2u-UL0GKXG4_dSPmNd7ZgqdRLk";
const DERIV_AFFILIATE_UTM =
  process.env.NEXT_PUBLIC_DERIV_AFFILIATE_UTM ||
  "utm_source=affiliate_265967&utm_medium=affiliate&utm_campaign=MyAffiliates";

/** Deposit page, deep-linked directly but carrying the affiliate tracking token +
 *  utm so Deriv attributes the visit to us (no homepage bounce). */
export const DERIV_TRACKED_DEPOSIT_URL =
  `${DERIV_DEPOSIT_URL}&t=${DERIV_AFFILIATE_TOKEN}&${DERIV_AFFILIATE_UTM}`;

/** The Deriv cashier withdraw page, deep-linked + tracked the same way. */
export const DERIV_WITHDRAW_URL =
  "https://home.deriv.com/dashboard/withdraw/verify?currency=USD&from=portfolio&openWithdraw=1";
export const DERIV_TRACKED_WITHDRAW_URL =
  `${DERIV_WITHDRAW_URL}&t=${DERIV_AFFILIATE_TOKEN}&${DERIV_AFFILIATE_UTM}`;

/** The Deriv portfolio page — where a user moves funds into their options trading
 *  account (the only balance we can read) — deep-linked + tracked. No existing
 *  query on this URL, so the tracking params start with `?`. */
export const DERIV_PORTFOLIO_URL = "https://home.deriv.com/dashboard/portfolio";
export const DERIV_TRACKED_PORTFOLIO_URL =
  `${DERIV_PORTFOLIO_URL}?t=${DERIV_AFFILIATE_TOKEN}&${DERIV_AFFILIATE_UTM}`;
