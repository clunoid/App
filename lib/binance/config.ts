/**
 * BINANCE — config for the Clunoid integration.
 *
 * Connection model (deliberate, and different from Deriv):
 *  - Deriv uses OAuth. Binance's OAuth ("Binance Login") is NOT self-serve — it is
 *    "only provided to close ecosystem partners", so we can't use it yet.
 *  - So the user connects with an API key they create themselves. We ask for a
 *    READ-ONLY key: it can see balances but can NOT trade or withdraw.
 *
 * Why read-only matters for a STABLE connection: Binance expires the
 * "Enable Spot & Margin Trading" permission on keys that have no IP allowlist.
 * The read-only permission carries no such expiry — so a read-only key keeps
 * working indefinitely, exactly like the Deriv connection.
 *
 * Signed Binance requests are CORS-blocked in the browser, so every signed call
 * goes through our server route (app/api/binance/account) which signs and proxies.
 * The key never leaves the user's browser except to that route, and we never store it.
 */

/** Binance REST base (spot). */
export const BINANCE_API_BASE = "https://api.binance.com";

/** Where the user creates their read-only API key. */
export const BINANCE_API_MANAGEMENT_URL = "https://www.binance.com/en/my/settings/api-management";
