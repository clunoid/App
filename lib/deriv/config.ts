/**
 * DERIV — the first platform. Everything Deriv-specific lives under lib/deriv
 * (config, OAuth, API client) so adding another broker later is a sibling folder,
 * not a rewrite.
 *
 * Connect is CLIENT-SIDE and account-less: there is no Clunoid sign-in. The user
 * authorises their own Deriv account via Deriv's OAuth; Deriv redirects back with
 * per-account tokens which live in the user's browser. Clunoid never stores a
 * password or a Deriv token server-side. The only config needed is the Deriv
 * app id (public identifier), set as NEXT_PUBLIC_DERIV_APP_ID — until then the
 * connect button shows an "add your Deriv app" state (unconfigured-safe).
 */

/** Public Deriv application id. Not a secret (it identifies the app in the OAuth
 *  URL). Register an app at developers.deriv.com, set its redirect URL to
 *  https://www.clunoid.com/trading/command, then set this env var. */
export const DERIV_APP_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID || "";

export const hasDerivApp = (): boolean => !!DERIV_APP_ID;

/** WebSocket API endpoint (real-time: authorize, balance, mt5_login_list). The
 *  app_id in the URL only scopes/attributes the connection. */
export const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID || "1089"}`;

const DERIV_OAUTH_BASE = "https://oauth.deriv.com/oauth2/authorize";

/**
 * The Deriv OAuth authorize URL. The redirect target is whatever URL is
 * REGISTERED on the Deriv app (must be https://www.clunoid.com/trading/command),
 * so we don't pass a redirect_uri here — Deriv sends the browser back there with
 * `acct1/token1/cur1…` query params on success.
 */
export function derivAuthorizeUrl(): string {
  return `${DERIV_OAUTH_BASE}?app_id=${encodeURIComponent(DERIV_APP_ID)}&l=EN&brand=deriv`;
}
