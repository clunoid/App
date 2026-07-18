/**
 * DERIV BOTS — shared config for the browser-side, API-executed Deriv bots.
 *
 * Unlike the MT5 automations (server signals + a user-hosted EA), these bots run
 * ENTIRELY in the user's browser and place orders DIRECTLY on Deriv's WebSocket
 * (proposal → buy → proposal_open_contract), the way Deriv's own DBot does. The
 * user's Deriv account token never leaves the browser.
 *
 * ⚠️ TRADE SOCKET app_id (PROVEN live 2026-07-18, Node + a real browser):
 *   wss://ws.derivws.com/websockets/v3?app_id=33PP0AqLX0blymxYDSg92  → HTTP 401
 *   wss://ws.derivws.com/websockets/v3?app_id=1089                   → connects
 * `33PP…` is Clunoid's OAuth/OIDC LOGIN app (it passes oauth.deriv.com/authorize,
 * which is how the command center connects) but Deriv's trade WebSocket REJECTS it
 * at the handshake — it is not a WS trading app. So the bots MUST open the trade
 * socket on a WS-capable app_id. We reuse `DERIV_WS_APP_ID` — the same one the rest
 * of Clunoid's WebSocket code already uses (1089 by default) — so this is guaranteed
 * to connect.
 *
 * MARKUP: Deriv attributes markup to the app_id that owns the trade socket. To earn
 * markup the owner registers a WS-capable app with app_markup_percentage set and
 * points NEXT_PUBLIC_DERIV_WS_APP_ID at it (no code change) — the bots then trade on
 * that app and every buy carries the markup. Until then trades run on 1089 (no
 * markup) so the bots work on Demo/Real immediately.
 */
import { DERIV_WS_APP_ID } from "../config";

/** The app id the bot's trading WebSocket connects on. MUST be a WS-capable app
 *  (33PP… is not — it 401s the handshake). This is also the app that earns markup,
 *  so set NEXT_PUBLIC_DERIV_WS_APP_ID to your markup-enabled WS app to collect it. */
export const DERIV_BOT_APP_ID = DERIV_WS_APP_ID;

/** The bot trading WebSocket. */
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
