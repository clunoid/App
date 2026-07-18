/**
 * DERIV BOTS — shared config for the browser-side, API-executed Deriv bots.
 *
 * Unlike the MT5 automations (server signals + a user-hosted EA), these bots run
 * ENTIRELY in the user's browser and place orders DIRECTLY on Deriv's WebSocket
 * (proposal → buy → proposal_open_contract), the way Deriv's own DBot does. The
 * user's Deriv account token never leaves the browser.
 *
 * MARKUP: every bot connects on the app owner's app_id so trades earn the app's
 * configured markup. Deriv trading (buying contracts) is WebSocket-only — the new
 * REST API (api.derivws.com) is read-only (verified: every /trading/v1 buy/
 * proposal path 404s), so the bots must use the WS with an a1- account token.
 *
 * ⚠️ app_id caveat (verified live 2026-07-18): the OIDC login client_id
 * (33PP0AqLX0blymxYDSg92) is REJECTED at the WS handshake — it is a login client,
 * not a WS trading app. A WS trading app needs a Deriv app_id that the WebSocket
 * accepts (classic numeric, or an app registered for browser/WS use). Set the
 * correct markup app id in NEXT_PUBLIC_DERIV_BOT_APP_ID; the default below is the
 * value the owner supplied and can be overridden without a code change.
 */

/** The app id the bot's trading WebSocket connects on → this app earns the markup. */
export const DERIV_BOT_APP_ID =
  process.env.NEXT_PUBLIC_DERIV_BOT_APP_ID || "33PP0AqLX0blymxYDSg92";

/** The bot trading WebSocket (separate from the account-data socket, so the
 *  markup app id is used for every buy). */
export const DERIV_BOT_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_BOT_APP_ID}`;

/** Deriv Volatility indices the digit bots trade. */
export const DERIV_VOLATILITY_MARKETS = ["R_10", "R_25", "R_50", "R_75", "R_100"] as const;

/** Shared config defaults for a bot (mirrors the BotsLab global inputs). */
export type BotConfig = {
  initialStake: number;
  takeProfit: number; // stop the bot when session profit ≥ this (USD)
  stopLoss: number; // stop the bot when session loss ≥ this (USD)
  martingaleMultiplier: number; // next stake after a loss = current × this
};

export const BOT_DEFAULTS = {
  initialStake: 1,
  minStake: 0.35,
  takeProfit: 100,
  stopLoss: 1000,
  martingaleMultiplier: 3.1,
} as const;
